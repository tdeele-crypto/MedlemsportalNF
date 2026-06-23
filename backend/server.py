from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
import io
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Annotated

import bcrypt
import jwt as pyjwt
import openpyxl
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, BeforeValidator, ConfigDict


# ----- Logging -----
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ----- Mongo -----
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ----- App -----
app = FastAPI(title="Medlems- og Arrangementsapp")
api = APIRouter(prefix="/api")

JWT_ALGO = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]


# ----- Helpers -----
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Ikke logget ind")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Ugyldigt token")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Bruger ikke fundet")
        return {
            "id": str(user["_id"]),
            "email": user["email"],
            "name": user.get("name", ""),
            "role": user.get("role", "user"),
        }
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session udløbet")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Ugyldigt token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Kun administratorer har adgang")
    return user


# ----- Pydantic Schemas -----
class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str = ""
    role: str = "user"


class UserCreateIn(BaseModel):
    email: EmailStr
    password: str
    name: str = ""
    role: str = "user"


class UserUpdateIn(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None


class MemberOut(BaseModel):
    id: str
    medlemsnummer: str
    navn: str
    adresse: str = ""
    email: str = ""
    telefon: str = ""
    medlemstype: str = ""
    bladstatus: str = ""


class EventIn(BaseModel):
    title: str
    description: str = ""
    location: str = ""
    address: str = ""
    event_date: Optional[str] = None  # ISO string yyyy-mm-dd or full ISO
    event_time: Optional[str] = None  # HH:MM
    price_member: float = 0
    price_non_member: float = 0


class EventOut(BaseModel):
    id: str
    title: str
    description: str = ""
    location: str = ""
    address: str = ""
    event_date: Optional[str] = None
    event_time: Optional[str] = None
    created_at: str
    price_member: float = 0
    price_non_member: float = 0
    participant_count: int = 0
    total_attendees: int = 0
    total_members: int = 0
    total_non_members: int = 0
    checked_in_attendees: int = 0
    expected_revenue: float = 0
    paid_revenue: float = 0
    outstanding_revenue: float = 0


class ParticipantOut(BaseModel):
    id: str
    event_id: str
    member_id: str
    medlemsnummer: str
    navn: str
    adresse: str = ""
    email: str = ""
    telefon: str = ""
    note: str = ""
    num_members: int = 1
    num_non_members: int = 0
    paid: bool = False
    checked_in: bool = False
    added_at: str


class AddParticipantIn(BaseModel):
    member_id: str
    note: str = ""
    num_members: int = 1
    num_non_members: int = 0


class UpdateParticipantIn(BaseModel):
    note: Optional[str] = None
    num_members: Optional[int] = None
    num_non_members: Optional[int] = None
    paid: Optional[bool] = None
    checked_in: Optional[bool] = None


# ----- Mongo doc helpers -----
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


def event_to_out(doc, count: int = 0, total_members: int = 0, total_non_members: int = 0,
                 expected_revenue: float = 0.0, paid_revenue: float = 0.0,
                 checked_in_attendees: int = 0) -> dict:
    return {
        "id": str(doc["_id"]),
        "title": doc.get("title", ""),
        "description": doc.get("description", ""),
        "location": doc.get("location", ""),
        "address": doc.get("address", ""),
        "event_date": doc.get("event_date"),
        "event_time": doc.get("event_time"),
        "created_at": doc.get("created_at", ""),
        "price_member": float(doc.get("price_member", 0) or 0),
        "price_non_member": float(doc.get("price_non_member", 0) or 0),
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
        "added_at": doc.get("added_at", ""),
    }


async def aggregate_event_totals(event_id: str):
    """Returns (count, total_members, total_non_members, expected_revenue, paid_revenue, checked_in_attendees)."""
    ev = await db.events.find_one({"_id": ObjectId(event_id)}) if ObjectId.is_valid(event_id) else None
    price_m = float((ev or {}).get("price_member", 0) or 0)
    price_nm = float((ev or {}).get("price_non_member", 0) or 0)
    pipeline = [
        {"$match": {"event_id": event_id}},
        {"$group": {
            "_id": None,
            "count": {"$sum": 1},
            "members": {"$sum": {"$ifNull": ["$num_members", 1]}},
            "non_members": {"$sum": {"$ifNull": ["$num_non_members", 0]}},
            "paid_members": {"$sum": {"$cond": [{"$eq": ["$paid", True]}, {"$ifNull": ["$num_members", 1]}, 0]}},
            "paid_non_members": {"$sum": {"$cond": [{"$eq": ["$paid", True]}, {"$ifNull": ["$num_non_members", 0]}, 0]}},
            "checked_in": {"$sum": {"$cond": [{"$eq": ["$checked_in", True]},
                                              {"$add": [{"$ifNull": ["$num_members", 1]}, {"$ifNull": ["$num_non_members", 0]}]},
                                              0]}},
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


# ----- Excel parsing -----
MEDLEMSTYPER = [
    "Livsvarigt medlemskab",
    "Medlemskab uden opkrævning",
    "Alm. medlemskab",
]


def parse_medlemskaber(text: str):
    if not text:
        return ("", "")
    t = str(text).lower()
    medlemstype = ""
    for mt in MEDLEMSTYPER:
        if mt.lower() in t:
            medlemstype = mt
            break
    bladstatus = ""
    if "medlemsblad med posten" in t or "med posten" in t:
        bladstatus = "Medlemsblad med posten"
    elif "medlemsblad på e-mail" in t or "på e-mail" in t or "paa e-mail" in t or "pa e-mail" in t:
        bladstatus = "Medlemsblad på e-mail"
    return (medlemstype, bladstatus)


def clean_str(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float):
        if v.is_integer():
            return str(int(v))
        return str(v)
    return str(v).strip()


# ----- Auth Endpoints -----
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


async def check_lockout(identifier: str):
    rec = await db.login_attempts.find_one({"_id": identifier})
    if not rec:
        return
    locked_until = rec.get("locked_until")
    if locked_until:
        try:
            lu = datetime.fromisoformat(locked_until)
        except Exception:
            return
        if lu > datetime.now(timezone.utc):
            mins = max(1, int((lu - datetime.now(timezone.utc)).total_seconds() // 60) + 1)
            raise HTTPException(status_code=429, detail=f"For mange mislykkede forsøg. Prøv igen om {mins} min.")


async def record_failed_login(identifier: str):
    now = datetime.now(timezone.utc)
    rec = await db.login_attempts.find_one({"_id": identifier})
    count = (rec.get("count", 0) if rec else 0) + 1
    update = {"count": count, "last_at": now.isoformat()}
    if count >= MAX_LOGIN_ATTEMPTS:
        update["locked_until"] = (now + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
        update["count"] = 0
    await db.login_attempts.update_one({"_id": identifier}, {"$set": update}, upsert=True)


async def clear_failed_login(identifier: str):
    await db.login_attempts.delete_one({"_id": identifier})


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
    out = []
    async for u in cursor:
        out.append({
            "id": str(u["_id"]),
            "email": u["email"],
            "name": u.get("name", ""),
            "role": u.get("role", "user"),
        })
    return out


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
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    _user: dict = Depends(get_current_user),
):
    filt = {}
    if q.strip():
        pattern = re.escape(q.strip())
        regex = {"$regex": pattern, "$options": "i"}
        filt = {
            "$or": [
                {"medlemsnummer": regex},
                {"navn": regex},
                {"adresse": regex},
                {"telefon": regex},
                {"email": regex},
            ]
        }
    total = await db.members.count_documents(filt)
    cursor = db.members.find(filt).sort("navn", 1).skip(skip).limit(limit)
    items = [member_to_out(d) async for d in cursor]
    return {"items": items, "total": total}


@api.get("/members/{member_id}", response_model=MemberOut)
async def get_member(member_id: str, _user: dict = Depends(get_current_user)):
    doc = await db.members.find_one({"_id": ObjectId(member_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Medlem ikke fundet")
    return member_to_out(doc)


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
        if not row or all(v is None for v in row):
            skipped += 1
            continue
        # Layout: Medlemsnummer | Navn | Adresse (combined) | E-mail | Mobilnummer | Medlemskaber
        medlemsnummer = clean_str(row[0]) if len(row) > 0 else ""
        navn = clean_str(row[1]) if len(row) > 1 else ""
        adresse = clean_str(row[2]) if len(row) > 2 else ""
        email = clean_str(row[3]) if len(row) > 3 else ""
        telefon = clean_str(row[4]) if len(row) > 4 else ""
        medlemskaber = clean_str(row[5]) if len(row) > 5 else ""
        if not medlemsnummer:
            skipped += 1
            continue
        medlemstype, bladstatus = parse_medlemskaber(medlemskaber)
        doc = {
            "medlemsnummer": medlemsnummer,
            "navn": navn,
            "adresse": adresse,
            "email": email.lower(),
            "telefon": telefon,
            "medlemstype": medlemstype,
            "bladstatus": bladstatus,
            "raw_medlemskaber": medlemskaber,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        existing = await db.members.find_one({"medlemsnummer": medlemsnummer})
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
    items = []
    async for ev in db.events.find({}).sort("event_date", -1):
        count, members, non_members, expected, paid, checked_in = await aggregate_event_totals(str(ev["_id"]))
        items.append(event_to_out(ev, count, members, non_members, expected, paid, checked_in))
    return items


@api.post("/events", response_model=EventOut)
async def create_event(payload: EventIn, _admin: dict = Depends(require_admin)):
    doc = {
        "title": payload.title,
        "description": payload.description or "",
        "location": payload.location or "",
        "address": payload.address or "",
        "event_date": payload.event_date,
        "event_time": payload.event_time,
        "price_member": float(payload.price_member or 0),
        "price_non_member": float(payload.price_non_member or 0),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.events.insert_one(doc)
    doc["_id"] = res.inserted_id
    return event_to_out(doc, 0, 0, 0, 0.0, 0.0, 0)


@api.get("/events/{event_id}", response_model=EventOut)
async def get_event(event_id: str, _user: dict = Depends(get_current_user)):
    ev = await db.events.find_one({"_id": ObjectId(event_id)})
    if not ev:
        raise HTTPException(status_code=404, detail="Arrangement ikke fundet")
    count, members, non_members, expected, paid, checked_in = await aggregate_event_totals(event_id)
    return event_to_out(ev, count, members, non_members, expected, paid, checked_in)


@api.patch("/events/{event_id}", response_model=EventOut)
async def update_event(event_id: str, payload: EventIn, _admin: dict = Depends(require_admin)):
    update = {
        "title": payload.title,
        "description": payload.description or "",
        "location": payload.location or "",
        "event_date": payload.event_date,
        "event_time": payload.event_time,
        "price_member": float(payload.price_member or 0),
        "price_non_member": float(payload.price_non_member or 0),
    }
    await db.events.update_one({"_id": ObjectId(event_id)}, {"$set": update})
    ev = await db.events.find_one({"_id": ObjectId(event_id)})
    if not ev:
        raise HTTPException(status_code=404, detail="Arrangement ikke fundet")
    count, members, non_members, expected, paid, checked_in = await aggregate_event_totals(event_id)
    return event_to_out(ev, count, members, non_members, expected, paid, checked_in)


@api.delete("/events/{event_id}")
async def delete_event(event_id: str, _admin: dict = Depends(require_admin)):
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
async def add_participant(event_id: str, payload: AddParticipantIn, _admin: dict = Depends(require_admin)):
    ev = await db.events.find_one({"_id": ObjectId(event_id)})
    if not ev:
        raise HTTPException(status_code=404, detail="Arrangement ikke fundet")
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
        "added_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.participants.insert_one(doc)
    doc["_id"] = res.inserted_id
    return participant_to_out(doc)


@api.patch("/events/{event_id}/participants/{participant_id}", response_model=ParticipantOut)
async def update_participant(event_id: str, participant_id: str, payload: UpdateParticipantIn, _admin: dict = Depends(require_admin)):
    update = {}
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
    if update:
        await db.participants.update_one(
            {"_id": ObjectId(participant_id), "event_id": event_id},
            {"$set": update},
        )
    p = await db.participants.find_one({"_id": ObjectId(participant_id)})
    if not p:
        raise HTTPException(status_code=404, detail="Tilmelding ikke fundet")
    return participant_to_out(p)


@api.delete("/events/{event_id}/participants/{participant_id}")
async def remove_participant(event_id: str, participant_id: str, _admin: dict = Depends(require_admin)):
    res = await db.participants.delete_one({"_id": ObjectId(participant_id), "event_id": event_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Tilmelding ikke fundet")
    return {"ok": True}


@api.get("/events/{event_id}/participants/export")
async def export_participants_csv(event_id: str, _user: dict = Depends(get_current_user)):
    """CSV export with check-in column for printing."""
    ev = await db.events.find_one({"_id": ObjectId(event_id)})
    if not ev:
        raise HTTPException(status_code=404, detail="Arrangement ikke fundet")
    from fastapi.responses import Response as _Response
    import csv as _csv
    import io as _io
    buf = _io.StringIO()
    buf.write("\ufeff")  # BOM for Excel
    writer = _csv.writer(buf, delimiter=";")
    writer.writerow([
        "Medlemsnr", "Navn", "Adresse", "Email", "Telefon",
        "Antal medl.", "Antal ikke-medl.", "Antal i alt", "Betalt", "Note", "Mødt op"
    ])
    cursor = db.participants.find({"event_id": event_id}).sort("navn", 1)
    async for p in cursor:
        nm = int(p.get("num_members", 1) or 0)
        nnm = int(p.get("num_non_members", 0) or 0)
        addr = str(p.get("adresse", "")).replace("\n", ", ")
        writer.writerow([
            p.get("medlemsnummer", ""),
            p.get("navn", ""),
            addr,
            p.get("email", ""),
            p.get("telefon", ""),
            nm,
            nnm,
            nm + nnm,
            "Ja" if p.get("paid") else "Nej",
            p.get("note", ""),
            "Ja" if p.get("checked_in") else "",
        ])
    title = (ev.get("title") or "arrangement").replace(" ", "_")
    filename = f"deltagere_{title}_{event_id}.csv"
    return _Response(
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


# ----- Startup -----
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.members.create_index("medlemsnummer", unique=True)
    await db.participants.create_index([("event_id", 1)])
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


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


app.include_router(api)

# CORS - allow credentials; preview origin is from FRONTEND env
_cors_origins = os.environ.get("CORS_ORIGINS", "*")
if _cors_origins == "*":
    # Use regex to allow all origins with credentials (preview URL varies)
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
