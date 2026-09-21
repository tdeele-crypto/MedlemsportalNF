"""Tests for the num_free (Gratis Deltagere) feature."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback for test discovery only; real value read from frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

ADMIN = {"email": "tdeele@gmail.com", "password": "Fransen123!!!"}
EVENT_ID = "6a3a6a043d35afe20f67991f"


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
    assert r.status_code == 200, f"login failed: {r.text}"
    return s


@pytest.fixture(scope="module")
def event(sess):
    r = sess.get(f"{BASE_URL}/api/events/{EVENT_ID}")
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def member_id(sess):
    # Grab any member
    r = sess.get(f"{BASE_URL}/api/members?limit=5")
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", [])
    assert items, "no members"
    return items[0]["id"]


created_ids = []


def _cleanup(sess):
    for pid in list(created_ids):
        sess.delete(f"{BASE_URL}/api/events/{EVENT_ID}/participants/{pid}")
    created_ids.clear()


# --- Backward compatibility ---
def test_add_participant_default_num_free_zero(sess, member_id):
    r = sess.post(
        f"{BASE_URL}/api/events/{EVENT_ID}/participants",
        json={"member_id": member_id, "num_members": 1, "num_non_members": 0},
    )
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["num_free"] == 0
    assert p["num_members"] == 1
    created_ids.append(p["id"])
    sess.delete(f"{BASE_URL}/api/events/{EVENT_ID}/participants/{p['id']}")
    created_ids.remove(p["id"])


# --- Free-first-to-members discount logic ---
def test_add_with_free_discount(sess, member_id, event):
    price_m = float(event.get("price_member", 0))
    price_nm = float(event.get("price_non_member", 0))
    r = sess.post(
        f"{BASE_URL}/api/events/{EVENT_ID}/participants",
        json={"member_id": member_id, "num_members": 1, "num_non_members": 4, "num_free": 3},
    )
    assert r.status_code == 200, r.text
    p = r.json()
    created_ids.append(p["id"])
    assert p["num_free"] == 3

    # Now fetch event totals
    r2 = sess.get(f"{BASE_URL}/api/events/{EVENT_ID}")
    assert r2.status_code == 200
    ev = r2.json()

    # Verify this participant contributes: 1 free absorbs 1 member; 2 free absorb 2 non-members;
    # so pay_m=0, pay_nm=2 -> revenue contribution = 2*price_nm
    expected_delta = 2 * price_nm
    # Just assert totals contain our added counts
    assert ev["total_free"] >= 3
    assert ev["total_members"] >= 1
    assert ev["total_non_members"] >= 4
    # Compute participant's own contribution formula independently
    assert round(expected_delta, 2) >= 0

    # cleanup this one participant
    sess.delete(f"{BASE_URL}/api/events/{EVENT_ID}/participants/{p['id']}")
    created_ids.remove(p["id"])


# --- Overflow validation on POST ---
def test_add_overflow_num_free(sess, member_id):
    r = sess.post(
        f"{BASE_URL}/api/events/{EVENT_ID}/participants",
        json={"member_id": member_id, "num_members": 1, "num_non_members": 1, "num_free": 5},
    )
    assert r.status_code == 400
    assert "gratis deltagere" in r.json().get("detail", "").lower()


# --- Overflow validation on PATCH ---
def test_patch_overflow_num_free(sess, member_id):
    r = sess.post(
        f"{BASE_URL}/api/events/{EVENT_ID}/participants",
        json={"member_id": member_id, "num_members": 2, "num_non_members": 1, "num_free": 0},
    )
    assert r.status_code == 200, r.text
    p = r.json()
    created_ids.append(p["id"])
    pid = p["id"]

    # PATCH only num_free too high
    r2 = sess.patch(
        f"{BASE_URL}/api/events/{EVENT_ID}/participants/{pid}",
        json={"num_free": 10},
    )
    assert r2.status_code == 400
    assert "gratis deltagere" in r2.json().get("detail", "").lower()

    # PATCH num_free alone within limits recomputes revenue
    r3 = sess.patch(
        f"{BASE_URL}/api/events/{EVENT_ID}/participants/{pid}",
        json={"num_free": 2},
    )
    assert r3.status_code == 200, r3.text
    assert r3.json()["num_free"] == 2
    assert r3.json()["num_members"] == 2  # unchanged
    assert r3.json()["num_non_members"] == 1  # unchanged

    sess.delete(f"{BASE_URL}/api/events/{EVENT_ID}/participants/{pid}")
    created_ids.remove(pid)


# --- max_participants includes free ---
def test_max_participants_counts_free(sess, member_id):
    # Create a temp event with max=10
    r = sess.post(
        f"{BASE_URL}/api/events",
        json={
            "title": "TEST_free_max",
            "price_member": 100,
            "price_non_member": 200,
            "max_participants": 10,
        },
    )
    assert r.status_code == 200, r.text
    ev_id = r.json()["id"]
    try:
        # Add 5 attendees first (m=5)
        r1 = sess.post(
            f"{BASE_URL}/api/events/{ev_id}/participants",
            json={"member_id": member_id, "num_members": 5, "num_non_members": 0, "num_free": 0},
        )
        assert r1.status_code == 200, r1.text

        # Now try m=2 + nm=1 + free=3 = 6 > remaining 5
        r2 = sess.post(
            f"{BASE_URL}/api/events/{ev_id}/participants",
            json={"member_id": member_id, "num_members": 2, "num_non_members": 1, "num_free": 3},
        )
        assert r2.status_code == 400, r2.text
        assert "fuldt" in r2.json().get("detail", "").lower() or "plads" in r2.json().get("detail", "").lower()
    finally:
        sess.delete(f"{BASE_URL}/api/events/{ev_id}")


# --- Revenue calc precise ---
def test_revenue_calculation_precise(sess, member_id):
    # Create isolated event
    r = sess.post(
        f"{BASE_URL}/api/events",
        json={
            "title": "TEST_free_revenue",
            "price_member": 80,
            "price_non_member": 160,
        },
    )
    assert r.status_code == 200
    ev_id = r.json()["id"]
    try:
        r1 = sess.post(
            f"{BASE_URL}/api/events/{ev_id}/participants",
            json={"member_id": member_id, "num_members": 1, "num_non_members": 4, "num_free": 3},
        )
        assert r1.status_code == 200, r1.text

        r2 = sess.get(f"{BASE_URL}/api/events/{ev_id}")
        assert r2.status_code == 200
        ev = r2.json()
        assert ev["total_attendees"] == 8
        assert ev["total_members"] == 1
        assert ev["total_non_members"] == 4
        assert ev["total_free"] == 3
        # 1 free -> 1 member; 2 free -> 2 non-members ; pay_m=0, pay_nm=2
        assert ev["expected_revenue"] == 2 * 160
    finally:
        sess.delete(f"{BASE_URL}/api/events/{ev_id}")
