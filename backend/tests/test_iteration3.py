"""
Iteration 3 – regression after server.py refactor + NEW endpoint:
  GET /api/members/{member_id}/registrations
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')

ADMIN_EMAIL = "tdeele@gmail.com"
ADMIN_PASSWORD = "Fransen123!!!"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    return s


# ---- Regression: core endpoints after refactor ----
class TestRefactorRegression:
    def test_auth_me(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/auth/me", timeout=20)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_stats(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/stats", timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ("members", "events", "participants"):
            assert k in d and isinstance(d[k], int)

    def test_list_members(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/members", params={"limit": 5}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "total" in d
        assert isinstance(d["items"], list)

    def test_list_events(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/events", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---- NEW: GET /api/members/{id}/registrations ----
class TestMemberRegistrations:
    def test_requires_auth(self):
        # plain session, no auth
        r = requests.get(f"{BASE_URL}/api/members/000000000000000000000000/registrations", timeout=20)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_404_for_invalid_id(self, admin_session):
        # malformed id → 404 (handled by ObjectId.is_valid check)
        r = admin_session.get(f"{BASE_URL}/api/members/not-an-objectid/registrations", timeout=20)
        assert r.status_code == 404

    def test_404_for_unknown_id(self, admin_session):
        # well-formed but unknown id → 404
        r = admin_session.get(f"{BASE_URL}/api/members/000000000000000000000000/registrations", timeout=20)
        assert r.status_code == 404

    def test_returns_list_for_existing_member(self, admin_session):
        # pick any existing member
        ms = admin_session.get(f"{BASE_URL}/api/members", params={"limit": 1}, timeout=20).json()["items"]
        if not ms:
            pytest.skip("no members in DB")
        m = ms[0]
        r = admin_session.get(f"{BASE_URL}/api/members/{m['id']}/registrations", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # if any entry exists, validate shape
        if data:
            row = data[0]
            for k in ("participant_id", "event_id", "event_title",
                      "num_members", "num_non_members", "paid", "checked_in", "note"):
                assert k in row, f"missing key {k} in {row}"

    def test_e2e_add_then_appears_in_registrations(self, admin_session):
        # Create event + add participant + verify member's registrations contains it
        members = admin_session.get(f"{BASE_URL}/api/members", params={"limit": 1}, timeout=20).json()["items"]
        if not members:
            pytest.skip("no members in DB")
        m = members[0]

        ev = admin_session.post(f"{BASE_URL}/api/events", json={
            "title": "TEST_Iter3_RegHistory",
            "event_date": "2026-12-01",
            "price_member": 50,
            "price_non_member": 75,
        }, timeout=20)
        assert ev.status_code == 200, ev.text
        eid = ev.json()["id"]
        try:
            p = admin_session.post(f"{BASE_URL}/api/events/{eid}/participants",
                                   json={"member_id": m["id"], "num_members": 1, "num_non_members": 0, "note": "iter3"},
                                   timeout=20)
            assert p.status_code == 200, p.text
            pid = p.json()["id"]

            regs = admin_session.get(f"{BASE_URL}/api/members/{m['id']}/registrations", timeout=20).json()
            ids = [r["participant_id"] for r in regs]
            assert pid in ids
            row = next(r for r in regs if r["participant_id"] == pid)
            assert row["event_id"] == eid
            assert row["event_title"] == "TEST_Iter3_RegHistory"
            assert row["num_members"] == 1
            assert row["note"] == "iter3"
        finally:
            admin_session.delete(f"{BASE_URL}/api/events/{eid}", timeout=20)


# ---- bcrypt hash sanity (admin row) ----
class TestSecurity:
    def test_admin_password_hash_is_bcrypt(self):
        from pymongo import MongoClient
        env = {}
        with open('/app/backend/.env') as f:
            for line in f:
                line = line.strip()
                if '=' in line and not line.startswith('#'):
                    k, v = line.split('=', 1)
                    env[k] = v.strip().strip('"').strip("'")
        cli = MongoClient(env['MONGO_URL'])
        try:
            u = cli[env['DB_NAME']].users.find_one({"email": ADMIN_EMAIL})
            assert u is not None, "admin not seeded"
            ph = u.get("password_hash", "")
            assert ph.startswith("$2"), f"hash not bcrypt: {ph[:6]!r}"
        finally:
            cli.close()
