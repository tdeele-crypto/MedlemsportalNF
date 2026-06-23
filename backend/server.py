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
    event_date: Optional[str] = None  # ISO string yyyy-mm-dd or full ISO


class EventOut(BaseModel):
    id: str
    title: str
    description: str = ""
    location: str = ""
    event_date: Optional[str] = None
    created_at: str
    participant_count: int = 0


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
    added_at: str


class AddParticipantIn(BaseModel):
    member_id: str
    note: str = ""


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


def event_to_out(doc, count: int = 0) -> dict:
    return {
        "id": str(doc["_id"]),
        "title": doc.get("title", ""),
        "description": doc.get("description", ""),
        "location": doc.get("location", ""),
        "event_date": doc.get("event_date"),
        "created_at": doc.get("created_at", ""),
        "participant_count": count,
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
        "added_at": doc.get("added_at", ""),
    }


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
@api.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Forkert email eller adgangskode")
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
        count = await db.participants.count_documents({"event_id": str(ev["_id"])})
        items.append(event_to_out(ev, count))
    return items


@api.post("/events", response_model=EventOut)
async def create_event(payload: EventIn, _admin: dict = Depends(require_admin)):
    doc = {
        "title": payload.title,
        "description": payload.description or "",
        "location": payload.location or "",
        "event_date": payload.event_date,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.events.insert_one(doc)
    doc["_id"] = res.inserted_id
    return event_to_out(doc, 0)


@api.get("/events/{event_id}", response_model=EventOut)
async def get_event(event_id: str, _user: dict = Depends(get_current_user)):
    ev = await db.events.find_one({"_id": ObjectId(event_id)})
    if not ev:
        raise HTTPException(status_code=404, detail="Arrangement ikke fundet")
    count = await db.participants.count_documents({"event_id": event_id})
    return event_to_out(ev, count)


@api.patch("/events/{event_id}", response_model=EventOut)
async def update_event(event_id: str, payload: EventIn, _admin: dict = Depends(require_admin)):
    update = {
        "title": payload.title,
        "description": payload.description or "",
        "location": payload.location or "",
        "event_date": payload.event_date,
    }
    await db.events.update_one({"_id": ObjectId(event_id)}, {"$set": update})
    ev = await db.events.find_one({"_id": ObjectId(event_id)})
    if not ev:
        raise HTTPException(status_code=404, detail="Arrangement ikke fundet")
    count = await db.participants.count_documents({"event_id": event_id})
    return event_to_out(ev, count)


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
    doc = {
        "event_id": event_id,
        "member_id": str(member["_id"]),
        "medlemsnummer": member.get("medlemsnummer", ""),
        "navn": member.get("navn", ""),
        "adresse": member.get("adresse", ""),
        "email": member.get("email", ""),
        "telefon": member.get("telefon", ""),
        "note": payload.note or "",
        "added_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.participants.insert_one(doc)
    doc["_id"] = res.inserted_id
    return participant_to_out(doc)


@api.patch("/events/{event_id}/participants/{participant_id}", response_model=ParticipantOut)
async def update_participant_note(event_id: str, participant_id: str, payload: AddParticipantIn, _admin: dict = Depends(require_admin)):
    await db.participants.update_one(
        {"_id": ObjectId(participant_id), "event_id": event_id},
        {"$set": {"note": payload.note or ""}}
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
