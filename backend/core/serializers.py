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
    expected_revenue: float = 0.0,
    paid_revenue: float = 0.0,
    checked_in_attendees: int = 0,
) -> dict:
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
        "email_on_register": bool(doc.get("email_on_register", True)),
        "email_on_paid": bool(doc.get("email_on_paid", True)),
        "email_on_reminder": bool(doc.get("email_on_reminder", True)),
        "image_path": doc.get("image_path"),
        "participant_count": count,
        "total_members": total_members,
        "total_non_members": total_non_members,
        "total_attendees": total_members + total_non_members,
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


async def aggregate_event_totals(db, event_id: str):
    """Returns (count, total_members, total_non_members, expected_revenue,
    paid_revenue, checked_in_attendees) for one event."""
    ev = (
        await db.events.find_one({"_id": ObjectId(event_id)})
        if ObjectId.is_valid(event_id)
        else None
    )
    price_m = float((ev or {}).get("price_member", 0) or 0)
    price_nm = float((ev or {}).get("price_non_member", 0) or 0)
    pipeline = [
        {"$match": {"event_id": event_id}},
        {"$group": {
            "_id": None,
            "count": {"$sum": 1},
            "members": {"$sum": {"$ifNull": ["$num_members", 1]}},
            "non_members": {"$sum": {"$ifNull": ["$num_non_members", 0]}},
            "paid_members": {"$sum": {"$cond": [
                {"$eq": ["$paid", True]},
                {"$ifNull": ["$num_members", 1]}, 0,
            ]}},
            "paid_non_members": {"$sum": {"$cond": [
                {"$eq": ["$paid", True]},
                {"$ifNull": ["$num_non_members", 0]}, 0,
            ]}},
            "checked_in": {"$sum": {"$cond": [
                {"$eq": ["$checked_in", True]},
                {"$add": [
                    {"$ifNull": ["$num_members", 1]},
                    {"$ifNull": ["$num_non_members", 0]},
                ]}, 0,
            ]}},
        }},
    ]
    agg = await db.participants.aggregate(pipeline).to_list(1)
    if agg:
        a = agg[0]
        members = int(a["members"])
        non_members = int(a["non_members"])
        expected = members * price_m + non_members * price_nm
        paid = int(a["paid_members"]) * price_m + int(a["paid_non_members"]) * price_nm
        checked_in = int(a.get("checked_in", 0) or 0)
        return a["count"], members, non_members, expected, paid, checked_in
    return 0, 0, 0, 0.0, 0.0, 0
