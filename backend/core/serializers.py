"""Mongo-doc → API-dict serializers + aggregations."""
from bson import ObjectId


def member_to_out(doc) -> dict:
    return {
        "id": str(doc["_id"]),
        "medlemsnummer": doc.get("medlemsnummer", ""),
        "navn": doc.get("navn", ""),
        "adresse": doc.get("adresse", ""),
        "email": doc.get("email", ""),
        "telefon": doc.get("telefon", ""),
        "medlemstype": doc.get("medlemstype", ""),
        "bladstatus": doc.get("bladstatus", ""),
    }


def event_to_out(
    doc,
    count: int = 0,
    total_members: int = 0,
    total_non_members: int = 0,
    total_free: int = 0,
    expected_revenue: float = 0.0,
    paid_revenue: float = 0.0,
    checked_in_attendees: int = 0,
) -> dict:
    max_p = doc.get("max_participants")
    max_p = int(max_p) if isinstance(max_p, (int, float)) and max_p else None
    total_att = total_members + total_non_members + total_free
    free_spots = max(0, max_p - total_att) if max_p is not None else None
    return {
        "id": str(doc["_id"]),
        "title": doc.get("title", ""),
        "description": doc.get("description", ""),
        "location": doc.get("location", ""),
        "address": doc.get("address", ""),
        "event_date": doc.get("event_date"),
        "event_time": doc.get("event_time"),
        "registration_deadline": doc.get("registration_deadline"),
        "contact_member_id": doc.get("contact_member_id"),
        "contact_name": doc.get("contact_name", ""),
        "contact_email": doc.get("contact_email", ""),
        "contact_phone": doc.get("contact_phone", ""),
        "created_at": doc.get("created_at", ""),
        "price_member": float(doc.get("price_member", 0) or 0),
        "price_non_member": float(doc.get("price_non_member", 0) or 0),
        "max_participants": max_p,
        "free_spots": free_spots,
        "email_on_register": bool(doc.get("email_on_register", True)),
        "email_on_paid": bool(doc.get("email_on_paid", True)),
        "email_on_reminder": bool(doc.get("email_on_reminder", True)),
        "image_path": doc.get("image_path"),
        "participant_count": count,
        "total_members": total_members,
        "total_non_members": total_non_members,
        "total_free": total_free,
        "total_attendees": total_att,
        "checked_in_attendees": checked_in_attendees,
        "expected_revenue": round(expected_revenue, 2),
        "paid_revenue": round(paid_revenue, 2),
        "outstanding_revenue": round(max(0.0, expected_revenue - paid_revenue), 2),
    }


def participant_to_out(doc) -> dict:
    return {
        "id": str(doc["_id"]),
        "event_id": doc.get("event_id", ""),
        "member_id": doc.get("member_id", ""),
        "medlemsnummer": doc.get("medlemsnummer", ""),
        "navn": doc.get("navn", ""),
        "adresse": doc.get("adresse", ""),
        "email": doc.get("email", ""),
        "telefon": doc.get("telefon", ""),
        "note": doc.get("note", ""),
        "num_members": int(doc.get("num_members", 1) or 0),
        "num_non_members": int(doc.get("num_non_members", 0) or 0),
        "num_free": int(doc.get("num_free", 0) or 0),
        "paid": bool(doc.get("paid", False)),
        "checked_in": bool(doc.get("checked_in", False)),
        "reminder_sent": bool(doc.get("reminder_sent", False)),
        "added_at": doc.get("added_at", ""),
    }


async def resolve_contact(db, member_id: str | None) -> dict:
    """Look up contact member by id and return (contact_member_id, contact_name,
    contact_email, contact_phone) suitable for spreading into an event doc."""
    out = {
        "contact_member_id": None,
        "contact_name": "",
        "contact_email": "",
        "contact_phone": "",
    }
    if not member_id:
        return out
    try:
        m = await db.members.find_one({"_id": ObjectId(member_id)})
    except Exception:
        return out
    if not m:
        return out
    out["contact_member_id"] = str(m["_id"])
    out["contact_name"] = m.get("navn", "")
    out["contact_email"] = m.get("email", "")
    out["contact_phone"] = m.get("telefon", "")
    return out


def compute_paying(num_members: int, num_non_members: int, num_free: int) -> tuple[int, int]:
    """Given counts on one participant row, return (paying_members, paying_non_members)
    after applying the free discount to members first, then non-members."""
    m = max(0, int(num_members or 0))
    nm = max(0, int(num_non_members or 0))
    f = max(0, int(num_free or 0))
    free_on_m = min(f, m)
    pay_m = m - free_on_m
    free_rem = f - free_on_m
    free_on_nm = min(free_rem, nm)
    pay_nm = nm - free_on_nm
    return pay_m, pay_nm


async def aggregate_event_totals(db, event_id: str):
    """Returns (count, total_members, total_non_members, total_free,
    expected_revenue, paid_revenue, checked_in_attendees) for one event.

    Free participants add to attendee count but do not add to revenue.
    Discount applies to members first, then non-members."""
    ev = (
        await db.events.find_one({"_id": ObjectId(event_id)})
        if ObjectId.is_valid(event_id)
        else None
    )
    price_m = float((ev or {}).get("price_member", 0) or 0)
    price_nm = float((ev or {}).get("price_non_member", 0) or 0)

    count = 0
    total_m = 0
    total_nm = 0
    total_free = 0
    expected = 0.0
    paid = 0.0
    checked_in = 0
    async for p in db.participants.find({"event_id": event_id}):
        m = int(p.get("num_members", 1) or 0)
        nm = int(p.get("num_non_members", 0) or 0)
        f = int(p.get("num_free", 0) or 0)
        pay_m, pay_nm = compute_paying(m, nm, f)
        row_expected = pay_m * price_m + pay_nm * price_nm
        count += 1
        total_m += m
        total_nm += nm
        total_free += f
        expected += row_expected
        if p.get("paid"):
            paid += row_expected
        if p.get("checked_in"):
            checked_in += m + nm + f
    return count, total_m, total_nm, total_free, expected, paid, checked_in
