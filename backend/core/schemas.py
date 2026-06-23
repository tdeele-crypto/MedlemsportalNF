"""Pydantic models for the API surface."""
from typing import Optional
from pydantic import BaseModel, EmailStr


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
    event_date: Optional[str] = None
    event_time: Optional[str] = None
    registration_deadline: Optional[str] = None
    contact_member_id: Optional[str] = None
    price_member: float = 0
    price_non_member: float = 0
    email_on_register: bool = True
    email_on_paid: bool = True
    email_on_reminder: bool = True
    image_path: Optional[str] = None


class EventOut(BaseModel):
    id: str
    title: str
    description: str = ""
    location: str = ""
    address: str = ""
    event_date: Optional[str] = None
    event_time: Optional[str] = None
    registration_deadline: Optional[str] = None
    contact_member_id: Optional[str] = None
    contact_name: str = ""
    contact_email: str = ""
    contact_phone: str = ""
    created_at: str
    email_on_register: bool = True
    email_on_paid: bool = True
    email_on_reminder: bool = True
    image_path: Optional[str] = None
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
    reminder_sent: bool = False
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


class MemberRegistrationOut(BaseModel):
    """One past/future event registration tied to a member."""
    participant_id: str
    event_id: str
    event_title: str
    event_date: Optional[str] = None
    event_time: Optional[str] = None
    location: str = ""
    address: str = ""
    num_members: int = 1
    num_non_members: int = 0
    paid: bool = False
    checked_in: bool = False
    note: str = ""
    added_at: str = ""
