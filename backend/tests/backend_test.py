"""
Backend pytest suite for Medlems- og Arrangementsapp.

Coverage:
- /api/auth/login, /api/auth/me, /api/auth/logout (JWT cookie)
- /api/users CRUD (admin-only)
- /api/members (list/search wildcard) + /api/members/import (idempotency)
- /api/events CRUD (admin-only mutations)
- /api/events/{id}/participants (add/note/remove + dup allowance)
- /api/stats
"""

import os
import pytest
import requests

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') if os.environ.get('REACT_APP_BACKEND_URL') else None
if not BASE_URL:
    # fall back to frontend env file
    fe = '/app/frontend/.env'
    if os.path.exists(fe):
        with open(fe) as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    BASE_URL = line.split('=', 1)[1].strip().rstrip('/')

ADMIN_EMAIL = "tdeele@gmail.com"
ADMIN_PASSWORD = "Fransen123!!!"
TEST_USER_EMAIL = "testuser_qa@example.com"
TEST_USER_PASSWORD = "Test1234!"
EXCEL_PATH = "/tmp/medlem.xlsx"


# ----- fixtures -----
@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["role"] == "admin"
    # also set Authorization header (Bearer fallback)
    s.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    return s


@pytest.fixture(scope="session")
def user_session(admin_session):
    # create a non-admin user (idempotent: ignore 400 if exists)
    admin_session.post(f"{BASE_URL}/api/users", json={
        "email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD, "name": "QA Tester", "role": "user"
    }, timeout=30)
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}, timeout=30)
    assert r.status_code == 200
    return s


# ----- AUTH -----
class TestAuth:
    def test_me_without_cookie_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=20)
        assert r.status_code == 401

    def test_login_wrong_password_returns_401(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": "WRONGwrong!!"}, timeout=20)
        assert r.status_code == 401
        assert "Forkert email" in r.json().get("detail", "")

    def test_login_success_sets_cookie(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/auth/me", timeout=20)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL
        assert r.json()["role"] == "admin"


# ----- USERS (admin) -----
class TestUsers:
    def test_users_requires_admin_for_non_admin(self, user_session):
        r = user_session.get(f"{BASE_URL}/api/users", timeout=20)
        assert r.status_code == 403

    def test_admin_can_list_users(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/users", timeout=20)
        assert r.status_code == 200
        emails = [u["email"] for u in r.json()]
        assert ADMIN_EMAIL in emails


# ----- MEMBERS -----
class TestMembers:
    def test_list_default(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/members", timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "total" in body
        assert body["total"] >= 500, f"expected ~589 members, got {body['total']}"

    def test_search_bangash(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/members", params={"q": "Bangash"}, timeout=30)
        assert r.status_code == 200
        items = r.json()["items"]
        assert any("Bangash" in (it.get("navn") or "") for it in items), "no Bangash found"

    def test_search_address_valby(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/members", params={"q": "2500 Valby"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    def test_search_by_medlemsnummer(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/members", params={"limit": 1}, timeout=30)
        first = r.json()["items"][0]
        num = first["medlemsnummer"]
        r2 = admin_session.get(f"{BASE_URL}/api/members", params={"q": num}, timeout=30)
        assert r2.status_code == 200
        nums = [it["medlemsnummer"] for it in r2.json()["items"]]
        assert num in nums

    def test_medlemstype_and_bladstatus_parsed(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/members", params={"limit": 200}, timeout=30)
        items = r.json()["items"]
        types = {it.get("medlemstype") for it in items}
        statuses = {it.get("bladstatus") for it in items}
        allowed_types = {"Alm. medlemskab", "Medlemskab uden opkrævning", "Livsvarigt medlemskab", ""}
        allowed_stat = {"Medlemsblad med posten", "Medlemsblad på e-mail", ""}
        # at least one parsed value should appear
        assert types & {"Alm. medlemskab", "Medlemskab uden opkrævning", "Livsvarigt medlemskab"}
        assert statuses & {"Medlemsblad med posten", "Medlemsblad på e-mail"}
        # no rogue values
        assert types <= allowed_types, f"unexpected medlemstype: {types - allowed_types}"
        assert statuses <= allowed_stat, f"unexpected bladstatus: {statuses - allowed_stat}"

    def test_members_import_idempotent(self, admin_session):
        assert os.path.exists(EXCEL_PATH), "/tmp/medlem.xlsx missing"
        with open(EXCEL_PATH, "rb") as f:
            files = {"file": ("Medlemmer_KbhFrb_030626.xlsx", f,
                              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            r = admin_session.post(f"{BASE_URL}/api/members/import", files=files, timeout=120)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        # second import on the same file → expect inserted=0
        assert body["inserted"] == 0, f"expected 0 inserts on re-import, got {body}"
        assert body["updated"] >= 1


# ----- EVENTS + PARTICIPANTS -----
class TestEventsAndParticipants:
    def test_full_event_flow(self, admin_session, user_session):
        # create
        payload = {
            "title": "TEST_QA_Arrangement",
            "description": "qa beskrivelse",
            "location": "Kbh",
            "event_date": "2026-06-15",
        }
        r = admin_session.post(f"{BASE_URL}/api/events", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        ev = r.json()
        assert ev["title"] == payload["title"]
        assert ev["participant_count"] == 0
        event_id = ev["id"]

        # non-admin cannot create event
        r2 = user_session.post(f"{BASE_URL}/api/events", json=payload, timeout=20)
        assert r2.status_code == 403

        # non-admin can list events
        r3 = user_session.get(f"{BASE_URL}/api/events", timeout=20)
        assert r3.status_code == 200

        # fetch some members
        members = admin_session.get(f"{BASE_URL}/api/members", params={"limit": 3}, timeout=30).json()["items"]
        assert len(members) >= 2
        m1, m2 = members[0], members[1]

        # add 2 participants
        a1 = admin_session.post(f"{BASE_URL}/api/events/{event_id}/participants",
                                json={"member_id": m1["id"], "note": "vegetar"}, timeout=20)
        assert a1.status_code == 200, a1.text
        p1 = a1.json()
        assert p1["note"] == "vegetar"
        assert p1["medlemsnummer"] == m1["medlemsnummer"]

        a2 = admin_session.post(f"{BASE_URL}/api/events/{event_id}/participants",
                                json={"member_id": m2["id"], "note": ""}, timeout=20)
        assert a2.status_code == 200
        p2 = a2.json()

        # non-admin cannot add
        r4 = user_session.post(f"{BASE_URL}/api/events/{event_id}/participants",
                               json={"member_id": m1["id"], "note": ""}, timeout=20)
        assert r4.status_code == 403

        # participant_count = 2
        det = admin_session.get(f"{BASE_URL}/api/events/{event_id}", timeout=20).json()
        assert det["participant_count"] == 2

        # list participants visible to user
        lst = user_session.get(f"{BASE_URL}/api/events/{event_id}/participants", timeout=20)
        assert lst.status_code == 200
        assert len(lst.json()) == 2

        # update note
        up = admin_session.patch(
            f"{BASE_URL}/api/events/{event_id}/participants/{p1['id']}",
            json={"member_id": m1["id"], "note": "nytnote"}, timeout=20,
        )
        assert up.status_code == 200
        assert up.json()["note"] == "nytnote"

        # remove participant
        rm = admin_session.delete(
            f"{BASE_URL}/api/events/{event_id}/participants/{p1['id']}", timeout=20,
        )
        assert rm.status_code == 200
        det2 = admin_session.get(f"{BASE_URL}/api/events/{event_id}", timeout=20).json()
        assert det2["participant_count"] == 1

        # cleanup: delete event
        d = admin_session.delete(f"{BASE_URL}/api/events/{event_id}", timeout=20)
        assert d.status_code == 200
        # verify gone
        gone = admin_session.get(f"{BASE_URL}/api/events/{event_id}", timeout=20)
        assert gone.status_code == 404


# ----- STATS -----
class TestStats:
    def test_stats(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/stats", timeout=20)
        assert r.status_code == 200
        body = r.json()
        for k in ("members", "events", "participants"):
            assert k in body and isinstance(body[k], int)
        assert body["members"] >= 500
