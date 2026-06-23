"""
Backend pytest suite – iteration 2.

Coverage:
- Event create/PATCH with prices (price_member, price_non_member)
- aggregate totals (expected_revenue / paid_revenue / outstanding_revenue / total_members / total_non_members / total_attendees)
- PATCH /api/events/{id}/participants/{pid} with {num_members,num_non_members,note,paid} (subset)
- GET /api/events/{id}/participants/export — CSV header + check-in column
- Brute-force lockout on /api/auth/login (5 fails → 429), reset on correct login
"""

import os
import csv
import io
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') if os.environ.get('REACT_APP_BACKEND_URL') else None
if not BASE_URL:
    fe = '/app/frontend/.env'
    if os.path.exists(fe):
        with open(fe) as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    BASE_URL = line.split('=', 1)[1].strip().rstrip('/')

ADMIN_EMAIL = "tdeele@gmail.com"
ADMIN_PASSWORD = "Fransen123!!!"


def _backend_env():
    env = {}
    with open('/app/backend/.env') as f:
        for line in f:
            line = line.strip()
            if line and '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                v = v.strip().strip('"').strip("'")
                env[k] = v
    return env


@pytest.fixture(scope="module")
def mongo():
    env = _backend_env()
    cli = MongoClient(env['MONGO_URL'])
    yield cli[env['DB_NAME']]
    cli.close()


@pytest.fixture(scope="module")
def admin_session(mongo):
    # ensure no lockout exists on the admin email before logging in
    mongo.login_attempts.delete_many({"_id": ADMIN_EMAIL})
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    return s


@pytest.fixture
def event_with_prices(admin_session):
    """Create a fresh event with prices; cleaned up at end."""
    r = admin_session.post(f"{BASE_URL}/api/events", json={
        "title": "FinTest_QA",
        "description": "fin",
        "location": "Kbh",
        "event_date": "2026-09-10",
        "price_member": 100,
        "price_non_member": 150,
    }, timeout=20)
    assert r.status_code == 200, r.text
    ev = r.json()
    yield ev
    admin_session.delete(f"{BASE_URL}/api/events/{ev['id']}", timeout=20)


# ---------- 1. Event prices persistence + aggregates ----------
class TestEventPricesAndAggregates:
    def test_create_persists_prices_and_zero_totals(self, event_with_prices, admin_session):
        ev = event_with_prices
        assert ev["price_member"] == 100
        assert ev["price_non_member"] == 150
        assert ev["expected_revenue"] == 0
        assert ev["paid_revenue"] == 0
        assert ev["outstanding_revenue"] == 0
        assert ev["total_members"] == 0
        assert ev["total_non_members"] == 0
        assert ev["total_attendees"] == 0
        # GET roundtrip
        g = admin_session.get(f"{BASE_URL}/api/events/{ev['id']}", timeout=20).json()
        for k in ("price_member", "price_non_member", "expected_revenue", "paid_revenue",
                  "outstanding_revenue", "total_members", "total_non_members", "total_attendees"):
            assert k in g

    def test_patch_event_updates_fields(self, event_with_prices, admin_session):
        eid = event_with_prices["id"]
        r = admin_session.patch(f"{BASE_URL}/api/events/{eid}", json={
            "title": "FinTest_QA_v2",
            "description": "v2",
            "location": "Århus",
            "event_date": "2026-09-11",
            "price_member": 200,
            "price_non_member": 250,
        }, timeout=20)
        assert r.status_code == 200, r.text
        upd = r.json()
        assert upd["title"] == "FinTest_QA_v2"
        assert upd["price_member"] == 200
        assert upd["price_non_member"] == 250
        # verify GET
        g = admin_session.get(f"{BASE_URL}/api/events/{eid}", timeout=20).json()
        assert g["title"] == "FinTest_QA_v2"
        assert g["price_member"] == 200


# ---------- 2. PATCH participant ----------
class TestParticipantPatch:
    def test_patch_participant_subsets_and_totals(self, event_with_prices, admin_session):
        eid = event_with_prices["id"]
        # pick 1 member
        members = admin_session.get(f"{BASE_URL}/api/members", params={"limit": 1}, timeout=30).json()["items"]
        assert members
        m = members[0]

        # add participant default num_members=1
        add = admin_session.post(f"{BASE_URL}/api/events/{eid}/participants",
                                 json={"member_id": m["id"], "note": "init",
                                       "num_members": 2, "num_non_members": 1},
                                 timeout=20)
        assert add.status_code == 200, add.text
        p = add.json()
        assert p["num_members"] == 2
        assert p["num_non_members"] == 1
        assert p["paid"] is False

        # event totals → 2 members + 1 non-member * (100 / 150) = 350
        ev = admin_session.get(f"{BASE_URL}/api/events/{eid}", timeout=20).json()
        assert ev["total_members"] == 2
        assert ev["total_non_members"] == 1
        assert ev["total_attendees"] == 3
        assert ev["expected_revenue"] == 2 * 100 + 1 * 150
        assert ev["paid_revenue"] == 0
        assert ev["outstanding_revenue"] == 350

        # PATCH only num_members (subset)
        u = admin_session.patch(f"{BASE_URL}/api/events/{eid}/participants/{p['id']}",
                                json={"num_members": 3}, timeout=20)
        assert u.status_code == 200
        assert u.json()["num_members"] == 3
        assert u.json()["num_non_members"] == 1  # unchanged

        # PATCH only paid
        u2 = admin_session.patch(f"{BASE_URL}/api/events/{eid}/participants/{p['id']}",
                                 json={"paid": True}, timeout=20)
        assert u2.status_code == 200
        assert u2.json()["paid"] is True

        # PATCH only note + num_non_members
        u3 = admin_session.patch(f"{BASE_URL}/api/events/{eid}/participants/{p['id']}",
                                 json={"note": "ny", "num_non_members": 2}, timeout=20)
        assert u3.status_code == 200
        assert u3.json()["note"] == "ny"
        assert u3.json()["num_non_members"] == 2

        # totals now: 3 m * 100 + 2 nm * 100 (wait price m=100/nm=150) → expected = 300 + 300 = 600
        ev2 = admin_session.get(f"{BASE_URL}/api/events/{eid}", timeout=20).json()
        assert ev2["total_members"] == 3
        assert ev2["total_non_members"] == 2
        assert ev2["expected_revenue"] == 3 * 100 + 2 * 150
        assert ev2["paid_revenue"] == 3 * 100 + 2 * 150
        assert ev2["outstanding_revenue"] == 0


# ---------- 3. CSV export ----------
class TestCsvExport:
    def test_export_csv_headers_and_rows(self, event_with_prices, admin_session):
        eid = event_with_prices["id"]
        members = admin_session.get(f"{BASE_URL}/api/members", params={"limit": 2}, timeout=30).json()["items"]
        for m in members:
            admin_session.post(f"{BASE_URL}/api/events/{eid}/participants",
                               json={"member_id": m["id"], "num_members": 1, "num_non_members": 0},
                               timeout=20)
        r = admin_session.get(f"{BASE_URL}/api/events/{eid}/participants/export", timeout=20)
        assert r.status_code == 200, r.text
        ctype = r.headers.get("content-type", "")
        assert "text/csv" in ctype, ctype
        assert "attachment" in r.headers.get("content-disposition", "").lower()
        # strip BOM
        body = r.text
        if body.startswith("\ufeff"):
            body = body[1:]
        reader = list(csv.reader(io.StringIO(body), delimiter=";"))
        assert reader, "CSV body empty"
        expected_header = ["Medlemsnr", "Navn", "Adresse", "Email", "Telefon",
                           "Antal medl.", "Antal ikke-medl.", "Antal i alt",
                           "Betalt", "Note", "Mødt op"]
        assert reader[0] == expected_header, reader[0]
        assert len(reader) >= 1 + len(members)
        # every data row ends with empty Mødt op
        for row in reader[1:]:
            assert row[-1] == "", f"last col should be empty, got {row[-1]!r}"


# ---------- 4. Brute-force lockout ----------
class TestBruteForceLockout:
    """Use a fake email so we never lock the real admin."""
    FAKE_EMAIL = "doesnotexist_qa@example.com"

    def test_lockout_after_5_fails_then_clears_on_success(self, mongo):
        mongo.login_attempts.delete_many({"_id": self.FAKE_EMAIL})
        mongo.login_attempts.delete_many({"_id": ADMIN_EMAIL})

        s = requests.Session()
        # 5 bad attempts → all 401
        for i in range(5):
            r = s.post(f"{BASE_URL}/api/auth/login",
                       json={"email": self.FAKE_EMAIL, "password": "nope"}, timeout=20)
            assert r.status_code == 401, f"attempt {i}: {r.status_code} {r.text}"

        # 6th attempt → 429 with Danish lockout message
        r6 = s.post(f"{BASE_URL}/api/auth/login",
                    json={"email": self.FAKE_EMAIL, "password": "nope"}, timeout=20)
        assert r6.status_code == 429, f"expected 429, got {r6.status_code} {r6.text}"
        detail = r6.json().get("detail", "")
        assert "For mange mislykkede forsøg" in detail, detail
        assert "15 min" in detail or "min" in detail

        # cleanup the lockout we just created
        mongo.login_attempts.delete_many({"_id": self.FAKE_EMAIL})

    def test_correct_login_resets_counter(self, mongo):
        mongo.login_attempts.delete_many({"_id": ADMIN_EMAIL})
        s = requests.Session()
        # 3 bad attempts on admin (under threshold)
        for _ in range(3):
            r = s.post(f"{BASE_URL}/api/auth/login",
                       json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=20)
            assert r.status_code == 401

        # correct login → 200 and clears counter
        ok = s.post(f"{BASE_URL}/api/auth/login",
                    json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
        assert ok.status_code == 200, ok.text

        # counter should be gone
        rec = mongo.login_attempts.find_one({"_id": ADMIN_EMAIL})
        assert rec is None, f"login_attempts not cleared: {rec}"
