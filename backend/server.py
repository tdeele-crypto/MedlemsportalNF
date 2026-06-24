from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
import io
import csv
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List

import openpyxl
from bson import ObjectId
from fastapi import (
    FastAPI, APIRouter, HTTPException, Depends, Request, Response,
    UploadFile, File, Query, BackgroundTasks,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response as FastResponse
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from zoneinfo import ZoneInfo

import email_utils
import storage_utils

from core.db import client, db
from core.schemas import (
    LoginIn, UserOut, UserCreateIn, UserUpdateIn, MemberOut,
    EventIn, EventOut, ParticipantOut,
    AddParticipantIn, UpdateParticipantIn, MemberRegistrationOut,
)
from core.security import (
    hash_password, verify_password, create_access_token, decode_access_token,
    get_current_user, require_admin,
    check_lockout, record_failed_login, clear_failed_login,
    JWT_ALGO, JWT_SECRET,
)
from core.helpers import (
    parse_medlemskaber, clean_str, html_escape, format_dk_date,
)
from core.serializers import (
    member_to_out, event_to_out, participant_to_out,
    resolve_contact, aggregate_event_totals,
)


# ----- Logging -----
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ----- App -----
app = FastAPI(title="Medlems- og Arrangementsapp")
api = APIRouter(prefix="/api")


# ----- Auth Endpoints -----
@api.post("/auth/login")
async def login(payload: LoginIn, request: Request, response: Response):
    email = payload.email.lower().strip()
    identifier = email
    await check_lockout(identifier)
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        await record_failed_login(identifier)
        raise HTTPException(status_code=401, detail="Forkert email eller adgangskode")
    await clear_failed_login(identifier)
    token = create_access_token(str(user["_id"]), user["email"], user.get("role", "user"))
    response.set_cookie(
        key="access_token", value=token, httponly=True,
        secure=True, samesite="none", max_age=7 * 24 * 3600, path="/",
    )
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user.get("name", ""),
        "role": user.get("role", "user"),
        "access_token": token,
    }


@api.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return user


# ----- Users Management (admin) -----
@api.get("/users", response_model=List[UserOut])
async def list_users(_admin: dict = Depends(require_admin)):
    cursor = db.users.find({}).sort("email", 1)
    return [
        {"id": str(u["_id"]), "email": u["email"], "name": u.get("name", ""), "role": u.get("role", "user")}
        async for u in cursor
    ]


@api.post("/users", response_model=UserOut)
async def create_user(payload: UserCreateIn, _admin: dict = Depends(require_admin)):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email findes allerede")
    doc = {
        "email": email,
        "name": payload.name or "",
        "role": "admin" if payload.role == "admin" else "user",
        "password_hash": hash_password(payload.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.users.insert_one(doc)
    return {"id": str(res.inserted_id), "email": email, "name": doc["name"], "role": doc["role"]}


@api.patch("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: str, payload: UserUpdateIn, _admin: dict = Depends(require_admin)):
    update = {}
    if payload.name is not None:
        update["name"] = payload.name
    if payload.role is not None:
        update["role"] = "admin" if payload.role == "admin" else "user"
    if payload.password:
        update["password_hash"] = hash_password(payload.password)
    if not update:
        raise HTTPException(status_code=400, detail="Intet at opdatere")
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update})
    u = await db.users.find_one({"_id": ObjectId(user_id)})
    if not u:
        raise HTTPException(status_code=404, detail="Bruger ikke fundet")
    return {"id": str(u["_id"]), "email": u["email"], "name": u.get("name", ""), "role": u.get("role", "user")}


@api.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if admin["id"] == user_id:
        raise HTTPException(status_code=400, detail="Du kan ikke slette din egen konto")
    res = await db.users.delete_one({"_id": ObjectId(user_id)})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Bruger ikke fundet")
    return {"ok": True}


# ----- Members -----
@api.get("/members")
async def list_members(
    q: str = Query("", description="Wildcard search across medlemsnummer, navn, adresse, telefon, email"),
    medlemstype: str = Query("", description="Filter by exact medlemstype, e.g. 'Alm. medlemskab'"),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    _user: dict = Depends(get_current_user),
):
    filt: dict = {}
    if q.strip():
        pattern = re.escape(q.strip())
        regex = {"$regex": pattern, "$options": "i"}
        filt["$or"] = [
            {"medlemsnummer": regex}, {"navn": regex}, {"adresse": regex},
            {"telefon": regex}, {"email": regex},
        ]
    if medlemstype.strip():
        filt["medlemstype"] = medlemstype.strip()
    total = await db.members.count_documents(filt)
    cursor = db.members.find(filt).sort("navn", 1).skip(skip).limit(limit)
    items = [member_to_out(d) async for d in cursor]
    return {"items": items, "total": total}


@api.get("/members/{member_id}", response_model=MemberOut)
async def get_member(member_id: str, _user: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(member_id):
        raise HTTPException(status_code=404, detail="Medlem ikke fundet")
    doc = await db.members.find_one({"_id": ObjectId(member_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Medlem ikke fundet")
    return member_to_out(doc)


@api.get("/members/{member_id}/registrations", response_model=List[MemberRegistrationOut])
async def get_member_registrations(member_id: str, _user: dict = Depends(get_current_user)):
    """Return all event registrations for a single member (history)."""
    if not ObjectId.is_valid(member_id):
        raise HTTPException(status_code=404, detail="Medlem ikke fundet")
    member = await db.members.find_one({"_id": ObjectId(member_id)})
    if not member:
        raise HTTPException(status_code=404, detail="Medlem ikke fundet")
    out: list[dict] = []
    cursor = db.participants.find({"member_id": str(member["_id"])}).sort("added_at", -1)
    async for p in cursor:
        ev_id = p.get("event_id", "")
        ev = None
        if ev_id and ObjectId.is_valid(ev_id):
            ev = await db.events.find_one({"_id": ObjectId(ev_id)})
        out.append({
            "participant_id": str(p["_id"]),
            "event_id": ev_id if ev else None,
            "event_title": (ev or {}).get("title", "(slettet arrangement)"),
            "event_date": (ev or {}).get("event_date"),
            "event_time": (ev or {}).get("event_time"),
            "location": (ev or {}).get("location", ""),
            "address": (ev or {}).get("address", ""),
            "num_members": int(p.get("num_members", 1) or 0),
            "num_non_members": int(p.get("num_non_members", 0) or 0),
            "paid": bool(p.get("paid", False)),
            "checked_in": bool(p.get("checked_in", False)),
            "note": p.get("note", ""),
            "added_at": p.get("added_at", ""),
        })
    return out


def _parse_excel_row(row) -> dict | None:
    """Map one Excel row (tuple) → member doc or None to skip."""
    if not row or all(v is None for v in row):
        return None
    medlemsnummer = clean_str(row[0]) if len(row) > 0 else ""
    if not medlemsnummer:
        return None
    medlemskaber = clean_str(row[5]) if len(row) > 5 else ""
    medlemstype, bladstatus = parse_medlemskaber(medlemskaber)
    return {
        "medlemsnummer": medlemsnummer,
        "navn": clean_str(row[1]) if len(row) > 1 else "",
        "adresse": clean_str(row[2]) if len(row) > 2 else "",
        "email": (clean_str(row[3]) if len(row) > 3 else "").lower(),
        "telefon": clean_str(row[4]) if len(row) > 4 else "",
        "medlemstype": medlemstype,
        "bladstatus": bladstatus,
        "raw_medlemskaber": medlemskaber,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


@api.post("/members/import")
async def import_members(file: UploadFile = File(...), _admin: dict = Depends(require_admin)):
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Kun .xlsx eller .xls filer er tilladt")
    data = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Kunne ikke læse Excel-fil: {e}")
    ws = wb.active

    inserted, updated, skipped = 0, 0, 0
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    for row in rows:
        doc = _parse_excel_row(row)
        if doc is None:
            skipped += 1
            continue
        existing = await db.members.find_one({"medlemsnummer": doc["medlemsnummer"]})
        if existing:
            await db.members.update_one({"_id": existing["_id"]}, {"$set": doc})
            updated += 1
        else:
            doc["created_at"] = doc["updated_at"]
            await db.members.insert_one(doc)
            inserted += 1
    return {"inserted": inserted, "updated": updated, "skipped": skipped, "total": len(rows)}


# ----- Events -----
@api.get("/events", response_model=List[EventOut])
async def list_events(_user: dict = Depends(get_current_user)):
    """Return events ordered: upcoming first (nearest date first),
    then past events (most-recent first), then events without a date."""
    today_iso = datetime.now(timezone.utc).date().isoformat()
    items = []
    async for ev in db.events.find({}):
        count, members, non_members, expected, paid, checked_in = await aggregate_event_totals(db, str(ev["_id"]))
        items.append(event_to_out(ev, count, members, non_members, expected, paid, checked_in))

    def sort_key(e):
        d = e.get("event_date") or ""
        if not d:
            return (2, "")               # no date → bottom
        if d >= today_iso:
            return (0, d)                # upcoming → ascending (nearest first)
        return (1, "-" + d)              # past → most recent past first
    items.sort(key=sort_key)
    return items


def _event_doc_from_payload(payload: EventIn, contact: dict) -> dict:
    return {
        "title": payload.title,
        "description": payload.description or "",
        "location": payload.location or "",
        "address": payload.address or "",
        "event_date": payload.event_date,
        "event_time": payload.event_time,
        "registration_deadline": payload.registration_deadline,
        "price_member": float(payload.price_member or 0),
        "price_non_member": float(payload.price_non_member or 0),
        "email_on_register": bool(payload.email_on_register),
        "email_on_paid": bool(payload.email_on_paid),
        "email_on_reminder": bool(payload.email_on_reminder),
        "image_path": payload.image_path,
        **contact,
    }


@api.post("/events", response_model=EventOut)
async def create_event(payload: EventIn, _admin: dict = Depends(require_admin)):
    contact = await resolve_contact(db, payload.contact_member_id)
    doc = {**_event_doc_from_payload(payload, contact),
           "created_at": datetime.now(timezone.utc).isoformat()}
    res = await db.events.insert_one(doc)
    doc["_id"] = res.inserted_id
    return event_to_out(doc, 0, 0, 0, 0.0, 0.0, 0)


@api.get("/events/{event_id}", response_model=EventOut)
async def get_event(event_id: str, _user: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=404, detail="Arrangement ikke fundet")
    ev = await db.events.find_one({"_id": ObjectId(event_id)})
    if not ev:
        raise HTTPException(status_code=404, detail="Arrangement ikke fundet")
    count, members, non_members, expected, paid, checked_in = await aggregate_event_totals(db, event_id)
    return event_to_out(ev, count, members, non_members, expected, paid, checked_in)


@api.patch("/events/{event_id}", response_model=EventOut)
async def update_event(event_id: str, payload: EventIn, _admin: dict = Depends(require_admin)):
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=404, detail="Arrangement ikke fundet")
    contact = await resolve_contact(db, payload.contact_member_id)
    update = _event_doc_from_payload(payload, contact)
    await db.events.update_one({"_id": ObjectId(event_id)}, {"$set": update})
    ev = await db.events.find_one({"_id": ObjectId(event_id)})
    if not ev:
        raise HTTPException(status_code=404, detail="Arrangement ikke fundet")
    count, members, non_members, expected, paid, checked_in = await aggregate_event_totals(db, event_id)
    return event_to_out(ev, count, members, non_members, expected, paid, checked_in)


@api.delete("/events/{event_id}")
async def delete_event(event_id: str, _admin: dict = Depends(require_admin)):
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=404, detail="Arrangement ikke fundet")
    await db.participants.delete_many({"event_id": event_id})
    res = await db.events.delete_one({"_id": ObjectId(event_id)})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Arrangement ikke fundet")
    return {"ok": True}


# ----- Participants -----
@api.get("/events/{event_id}/participants", response_model=List[ParticipantOut])
async def list_participants(event_id: str, _user: dict = Depends(get_current_user)):
    cursor = db.participants.find({"event_id": event_id}).sort("added_at", 1)
    return [participant_to_out(d) async for d in cursor]


@api.post("/events/{event_id}/participants", response_model=ParticipantOut)
async def add_participant(
    event_id: str, payload: AddParticipantIn, background: BackgroundTasks,
    _admin: dict = Depends(require_admin),
):
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=404, detail="Arrangement ikke fundet")
    ev = await db.events.find_one({"_id": ObjectId(event_id)})
    if not ev:
        raise HTTPException(status_code=404, detail="Arrangement ikke fundet")
    if not ObjectId.is_valid(payload.member_id):
        raise HTTPException(status_code=404, detail="Medlem ikke fundet")
    member = await db.members.find_one({"_id": ObjectId(payload.member_id)})
    if not member:
        raise HTTPException(status_code=404, detail="Medlem ikke fundet")
    num_m = max(0, int(payload.num_members or 0))
    num_nm = max(0, int(payload.num_non_members or 0))
    if num_m + num_nm < 1:
        num_m = 1
    doc = {
        "event_id": event_id,
        "member_id": str(member["_id"]),
        "medlemsnummer": member.get("medlemsnummer", ""),
        "navn": member.get("navn", ""),
        "adresse": member.get("adresse", ""),
        "email": member.get("email", ""),
        "telefon": member.get("telefon", ""),
        "note": payload.note or "",
        "num_members": num_m,
        "num_non_members": num_nm,
        "paid": False,
        "checked_in": False,
        "reminder_sent": False,
        "added_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.participants.insert_one(doc)
    doc["_id"] = res.inserted_id
    if bool(ev.get("email_on_register", True)):
        background.add_task(
            email_utils.send_registration_email,
            member, ev, num_m, num_nm, payload.note or "",
            float(ev.get("price_member", 0) or 0),
            float(ev.get("price_non_member", 0) or 0),
        )
    return participant_to_out(doc)


def _build_participant_update(payload: UpdateParticipantIn) -> dict:
    update: dict = {}
    if payload.note is not None:
        update["note"] = payload.note
    if payload.num_members is not None:
        update["num_members"] = max(0, int(payload.num_members))
    if payload.num_non_members is not None:
        update["num_non_members"] = max(0, int(payload.num_non_members))
    if payload.paid is not None:
        update["paid"] = bool(payload.paid)
    if payload.checked_in is not None:
        update["checked_in"] = bool(payload.checked_in)
    return update


@api.patch("/events/{event_id}/participants/{participant_id}", response_model=ParticipantOut)
async def update_participant(
    event_id: str, participant_id: str, payload: UpdateParticipantIn,
    background: BackgroundTasks, _admin: dict = Depends(require_admin),
):
    if not (ObjectId.is_valid(event_id) and ObjectId.is_valid(participant_id)):
        raise HTTPException(status_code=404, detail="Tilmelding ikke fundet")
    existing = await db.participants.find_one(
        {"_id": ObjectId(participant_id), "event_id": event_id}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Tilmelding ikke fundet")
    update = _build_participant_update(payload)
    if update:
        await db.participants.update_one(
            {"_id": ObjectId(participant_id), "event_id": event_id},
            {"$set": update},
        )
    p = await db.participants.find_one({"_id": ObjectId(participant_id)})
    if not p:
        raise HTTPException(status_code=404, detail="Tilmelding ikke fundet")
    if payload.paid is True and not bool(existing.get("paid", False)):
        ev = await db.events.find_one({"_id": ObjectId(event_id)})
        if ev and bool(ev.get("email_on_paid", True)):
            background.add_task(email_utils.send_payment_email, p, ev)
    return participant_to_out(p)


@api.delete("/events/{event_id}/participants/{participant_id}")
async def remove_participant(event_id: str, participant_id: str, _admin: dict = Depends(require_admin)):
    if not (ObjectId.is_valid(event_id) and ObjectId.is_valid(participant_id)):
        raise HTTPException(status_code=404, detail="Tilmelding ikke fundet")
    res = await db.participants.delete_one({"_id": ObjectId(participant_id), "event_id": event_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Tilmelding ikke fundet")
    return {"ok": True}


@api.get("/events/{event_id}/participants/export")
async def export_participants_csv(event_id: str, _user: dict = Depends(get_current_user)):
    """CSV export with check-in column for printing."""
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=404, detail="Arrangement ikke fundet")
    ev = await db.events.find_one({"_id": ObjectId(event_id)})
    if not ev:
        raise HTTPException(status_code=404, detail="Arrangement ikke fundet")
    buf = io.StringIO()
    buf.write("\ufeff")  # BOM for Excel
    writer = csv.writer(buf, delimiter=";")
    writer.writerow([
        "Medlemsnr", "Navn", "Adresse", "Email", "Telefon",
        "Antal medl.", "Antal ikke-medl.", "Antal i alt", "Betalt", "Note", "Mødt op",
    ])
    cursor = db.participants.find({"event_id": event_id}).sort("navn", 1)
    async for p in cursor:
        nm = int(p.get("num_members", 1) or 0)
        nnm = int(p.get("num_non_members", 0) or 0)
        addr = str(p.get("adresse", "")).replace("\n", ", ")
        writer.writerow([
            p.get("medlemsnummer", ""), p.get("navn", ""), addr,
            p.get("email", ""), p.get("telefon", ""),
            nm, nnm, nm + nnm,
            "Ja" if p.get("paid") else "Nej",
            p.get("note", ""),
            "Ja" if p.get("checked_in") else "",
        ])
    title = (ev.get("title") or "arrangement").replace(" ", "_")
    filename = f"deltagere_{title}_{event_id}.csv"
    return FastResponse(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ----- Stats -----
@api.get("/stats")
async def stats(_user: dict = Depends(get_current_user)):
    return {
        "members": await db.members.count_documents({}),
        "events": await db.events.count_documents({}),
        "participants": await db.participants.count_documents({}),
    }


@api.get("/")
async def root():
    return {"message": "Medlems- og Arrangementsapp API"}


# ----- Public sharing (no auth required) -----
@api.get("/share/event/{event_id}/image")
async def share_event_image(event_id: str):
    """Public endpoint that serves the event cover image. Used by Facebook's Open Graph scraper."""
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=404, detail="Ikke fundet")
    ev = await db.events.find_one({"_id": ObjectId(event_id)})
    if not ev or not ev.get("image_path"):
        raise HTTPException(status_code=404, detail="Intet billede")
    try:
        data, content_type = storage_utils.get_object(ev["image_path"])
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Intet billede")
    except Exception as e:
        logger.error("Public image fetch failed: %s", e)
        raise HTTPException(status_code=500, detail="Kunne ikke hente billede")
    return FastResponse(content=data, media_type=content_type,
                        headers={"Cache-Control": "public, max-age=300"})


def _resolve_public_base_url(request: Request) -> str:
    base_url = str(request.base_url).rstrip("/")
    fwd_host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    fwd_proto = request.headers.get("x-forwarded-proto", "https")
    if fwd_host and "preview.emergentagent" in fwd_host:
        base_url = f"{fwd_proto}://{fwd_host}"
    return base_url


def _build_share_description(ev: dict, where_bits: list[str], date_str: str) -> str:
    parts: list[str] = []
    if date_str:
        parts.append(date_str)
    if ev.get("registration_deadline"):
        parts.append(f"⏳ Tilmeldingsfrist: {format_dk_date(ev.get('registration_deadline'))}")
    if where_bits:
        parts.append(" · ".join(where_bits))
    if ev.get("description"):
        parts.append(ev["description"])
    if (ev.get("price_member") or 0) > 0 or (ev.get("price_non_member") or 0) > 0:
        parts.append(
            f"Pris: {ev.get('price_member', 0):g} kr. medlem / "
            f"{ev.get('price_non_member', 0):g} kr. ikke-medlem"
        )
    if ev.get("contact_name"):
        bits = [ev["contact_name"]]
        if ev.get("contact_email"):
            bits.append(ev["contact_email"])
        if ev.get("contact_phone"):
            bits.append(ev["contact_phone"])
        parts.append("Tilmelding til: " + " · ".join(bits))
    return "\n\n".join(parts) or ev.get("title", "")


@api.get("/share/event/{event_id}")
async def share_event_page(event_id: str, request: Request):
    """Public Open Graph preview page. Facebook's scraper reads OG tags here."""
    if not ObjectId.is_valid(event_id):
        raise HTTPException(status_code=404, detail="Ikke fundet")
    ev = await db.events.find_one({"_id": ObjectId(event_id)})
    if not ev:
        raise HTTPException(status_code=404, detail="Arrangement ikke fundet")

    title = ev.get("title", "Arrangement")
    date_str = format_dk_date(ev.get("event_date"), ev.get("event_time"))
    where_bits = [b for b in [ev.get("location"), ev.get("address")] if b]
    description = _build_share_description(ev, where_bits, date_str)

    base_url = _resolve_public_base_url(request)
    page_url = f"{base_url}/api/share/event/{event_id}"
    image_url = f"{base_url}/api/share/event/{event_id}/image" if ev.get("image_path") else ""

    deadline_html = (
        f'<p class="meta">⏳ Tilmeldingsfrist: '
        f'{html_escape(format_dk_date(ev.get("registration_deadline")))}</p>'
        if ev.get("registration_deadline") else ""
    )
    contact_html = ""
    if ev.get("contact_name"):
        contact_html = (
            f'<p class="meta"><strong>Tilmelding til:</strong> '
            f'{html_escape(ev.get("contact_name", ""))}'
            + (f' · {html_escape(ev.get("contact_email", ""))}' if ev.get("contact_email") else "")
            + (f' · {html_escape(ev.get("contact_phone", ""))}' if ev.get("contact_phone") else "")
            + "</p>"
        )

    html = f"""<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{html_escape(title)}</title>
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Medlemsportal">
  <meta property="og:title" content="{html_escape(title)}">
  <meta property="og:description" content="{html_escape(description)}">
  <meta property="og:url" content="{page_url}">
  {f'<meta property="og:image" content="{image_url}">' if image_url else ''}
  {f'<meta property="og:image:secure_url" content="{image_url}">' if image_url else ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{html_escape(title)}">
  <meta name="twitter:description" content="{html_escape(description)}">
  {f'<meta name="twitter:image" content="{image_url}">' if image_url else ''}
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background:#F5F6F1; color:#1B1F1B; margin:0; padding:24px; }}
    .card {{ max-width: 600px; margin: 32px auto; background:#fff; border:1px solid #E1E5DC; border-radius:8px; overflow:hidden; }}
    .card img {{ width:100%; height:auto; display:block; }}
    .body {{ padding:24px; }}
    h1 {{ margin:0 0 12px; font-size:22px; }}
    p {{ margin:8px 0; white-space:pre-line; color:#3a3f3a; }}
    .meta {{ color:#5C615C; font-size:14px; }}
  </style>
</head>
<body>
  <div class="card">
    {f'<img src="{image_url}" alt="">' if image_url else ''}
    <div class="body">
      <h1>{html_escape(title)}</h1>
      <p class="meta">{html_escape(date_str)}</p>
      {deadline_html}
      <p class="meta">{html_escape(' · '.join(where_bits))}</p>
      <p>{html_escape(ev.get('description', ''))}</p>
      {contact_html}
    </div>
  </div>
</body>
</html>"""
    return FastResponse(content=html, media_type="text/html; charset=utf-8")


@api.get("/config/facebook")
async def facebook_config(_user: dict = Depends(get_current_user)):
    return {"group_url": os.environ.get("FACEBOOK_GROUP_URL", "")}


# ----- Image upload (event covers) -----
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB
_EXT_MAP = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}


@api.post("/uploads/image")
async def upload_image(file: UploadFile = File(...), _admin: dict = Depends(require_admin)):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Kun JPG, PNG, WebP eller GIF tilladt")
    data = await file.read()
    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="Billede er for stort (max 10 MB)")
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Tom fil")
    ext = _EXT_MAP.get(file.content_type, "bin")
    app_name = os.environ.get("APP_NAME", "medlemsportal")
    path = f"{app_name}/events/{uuid.uuid4()}.{ext}"
    try:
        result = storage_utils.put_object(path, data, file.content_type)
    except Exception as e:
        logger.error("Image upload failed: %s", e)
        raise HTTPException(status_code=500, detail="Kunne ikke uploade billede")
    stored_path = result.get("path") or path
    await db.files.insert_one({
        "storage_path": stored_path,
        "original_filename": file.filename,
        "content_type": file.content_type,
        "size": len(data),
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"path": stored_path, "size": len(data), "content_type": file.content_type}


def _authorize_file_request(request: Request, auth: Optional[str]) -> None:
    """Authorize a /files/{path} request via cookie, Bearer header, or ?auth= query."""
    if request.cookies.get("access_token") or request.headers.get("Authorization"):
        # Cookie/Bearer present — fall through to get_current_user style validation
        return
    if not auth:
        raise HTTPException(status_code=401, detail="Ikke logget ind")
    decode_access_token(auth)  # raises if invalid


@api.get("/files/{path:path}")
async def get_file(path: str, request: Request, auth: Optional[str] = Query(None)):
    # Allow auth via cookie, Bearer header, or ?auth= query param (for <img src>)
    if request.cookies.get("access_token") or request.headers.get("Authorization"):
        await get_current_user(request)
    else:
        _authorize_file_request(request, auth)
    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not record:
        raise HTTPException(status_code=404, detail="Fil ikke fundet")
    try:
        data, content_type = storage_utils.get_object(path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Fil ikke fundet")
    except Exception as e:
        logger.error("File download failed: %s", e)
        raise HTTPException(status_code=500, detail="Kunne ikke hente fil")
    return FastResponse(
        content=data,
        media_type=record.get("content_type", content_type),
        headers={"Cache-Control": "public, max-age=3600"},
    )


# ----- Startup -----
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.members.create_index("medlemsnummer", unique=True)
    await db.participants.create_index([("event_id", 1)])
    await db.participants.create_index([("member_id", 1)])
    # Init object storage
    try:
        storage_utils.init_storage()
    except Exception as e:
        logger.warning("Storage init at startup failed: %s", e)
    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "").lower().strip()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if admin_email and admin_password:
        existing = await db.users.find_one({"email": admin_email})
        if not existing:
            await db.users.insert_one({
                "email": admin_email,
                "name": "Administrator",
                "role": "admin",
                "password_hash": hash_password(admin_password),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info(f"Seeded admin: {admin_email}")
        else:
            if not verify_password(admin_password, existing.get("password_hash", "")):
                await db.users.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {"password_hash": hash_password(admin_password), "role": "admin"}},
                )
                logger.info(f"Updated admin password for {admin_email}")
    # Start scheduler for reminder emails
    _start_scheduler()


# ----- Reminder scheduler -----
scheduler: Optional[AsyncIOScheduler] = None


async def send_reminders_for_date(target_date_str: str) -> dict:
    """Find all events on target_date_str (yyyy-mm-dd) and email reminders to
    participants who have not yet received one. Returns counters."""
    sent, skipped, failed = 0, 0, 0
    events_cursor = db.events.find({"event_date": target_date_str})
    async for ev in events_cursor:
        if not bool(ev.get("email_on_reminder", True)):
            continue
        parts = db.participants.find({"event_id": str(ev["_id"]), "reminder_sent": {"$ne": True}})
        async for p in parts:
            if not p.get("email"):
                skipped += 1
                continue
            ok = await email_utils.send_reminder_email(p, ev)
            if ok:
                await db.participants.update_one(
                    {"_id": p["_id"]},
                    {"$set": {"reminder_sent": True,
                              "reminder_sent_at": datetime.now(timezone.utc).isoformat()}},
                )
                sent += 1
            else:
                failed += 1
    logger.info("Reminder run for %s: sent=%d skipped=%d failed=%d",
                target_date_str, sent, skipped, failed)
    return {"sent": sent, "skipped": skipped, "failed": failed}


def _reminder_tz() -> ZoneInfo:
    try:
        return ZoneInfo(os.environ.get("REMINDER_TIMEZONE", "Europe/Copenhagen"))
    except Exception:
        return ZoneInfo("Europe/Copenhagen")


async def _reminder_job():
    """Daily job: send reminders to participants of events happening in exactly 2 days."""
    target = (datetime.now(_reminder_tz()).date() + timedelta(days=2)).isoformat()
    await send_reminders_for_date(target)


def _start_scheduler():
    global scheduler
    if scheduler is not None:
        return
    tz = _reminder_tz()
    hour = int(os.environ.get("REMINDER_HOUR", "9") or "9")
    scheduler = AsyncIOScheduler(timezone=tz)
    scheduler.add_job(
        _reminder_job,
        trigger=CronTrigger(hour=hour, minute=0, timezone=tz),
        id="reminder_2d",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Reminder scheduler started (daily %02d:00 %s)", hour, tz.key)


# Admin endpoint to manually trigger today's reminder run (useful for testing)
@api.post("/admin/run-reminders")
async def admin_run_reminders(target_date: Optional[str] = None, _admin: dict = Depends(require_admin)):
    """Manually trigger reminders. If target_date is omitted, defaults to today+2 days."""
    if not target_date:
        target_date = (datetime.now(_reminder_tz()).date() + timedelta(days=2)).isoformat()
    return await send_reminders_for_date(target_date)


@app.on_event("shutdown")
async def on_shutdown():
    global scheduler
    if scheduler is not None:
        try:
            scheduler.shutdown(wait=False)
        except Exception:
            pass
        scheduler = None
    client.close()


app.include_router(api)

# CORS - allow credentials; preview origin is from FRONTEND env
_cors_origins = os.environ.get("CORS_ORIGINS", "*")
if _cors_origins == "*":
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins.split(","),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
