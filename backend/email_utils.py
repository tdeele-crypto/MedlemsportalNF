"""Email helpers for Medlemsportal — SMTP via Brevo."""
import os
import logging
from email.message import EmailMessage
from datetime import datetime
import aiosmtplib

logger = logging.getLogger(__name__)

SMTP_SERVER = os.environ.get("SMTP_SERVER", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587") or "587")
SMTP_LOGIN = os.environ.get("SMTP_LOGIN", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
FROM_EMAIL = os.environ.get("FROM_EMAIL", SMTP_LOGIN)
FROM_NAME = os.environ.get("FROM_NAME", "Medlemsportal")


def _is_configured() -> bool:
    return bool(SMTP_SERVER and SMTP_LOGIN and SMTP_PASSWORD and FROM_EMAIL)


def _fmt_date(date_str: str | None) -> str:
    if not date_str:
        return ""
    try:
        d = datetime.fromisoformat(date_str.replace("Z", "+00:00").split("T")[0])
        DK_DAYS = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"]
        DK_MONTHS = ["januar", "februar", "marts", "april", "maj", "juni",
                     "juli", "august", "september", "oktober", "november", "december"]
        return f"{DK_DAYS[d.weekday()]} d. {d.day}. {DK_MONTHS[d.month - 1]} {d.year}"
    except Exception:
        return date_str


def _event_summary(event: dict) -> str:
    parts = []
    if event.get("event_date"):
        s = _fmt_date(event["event_date"])
        if event.get("event_time"):
            s += f" kl. {event['event_time']}"
        parts.append(s)
    loc_bits = []
    if event.get("location"):
        loc_bits.append(event["location"])
    if event.get("address"):
        loc_bits.append(event["address"])
    if loc_bits:
        parts.append(" · ".join(loc_bits))
    return "\n".join(parts)


def _maps_link(address: str) -> str:
    from urllib.parse import quote_plus
    return f"https://www.google.com/maps/search/?api=1&query={quote_plus(address)}"


def _event_summary_html(event: dict) -> str:
    """HTML version of event summary, with address as clickable Google Maps link."""
    parts = []
    if event.get("event_date"):
        s = _fmt_date(event["event_date"])
        if event.get("event_time"):
            s += f" kl. {event['event_time']}"
        parts.append(s)
    loc_bits = []
    if event.get("location"):
        loc_bits.append(event["location"])
    addr = event.get("address")
    if addr:
        loc_bits.append(
            f'<a href="{_maps_link(addr)}" style="color:#2C4C3B; text-decoration:underline;" target="_blank" rel="noopener">{addr}</a>'
        )
    if loc_bits:
        parts.append(" · ".join(loc_bits))
    return "<br>".join(parts)


async def _send(to_email: str, to_name: str, subject: str, body_text: str, body_html: str | None = None) -> bool:
    if not _is_configured():
        logger.warning("SMTP not configured — skipping email to %s", to_email)
        return False
    if not to_email:
        return False
    msg = EmailMessage()
    msg["From"] = f"{FROM_NAME} <{FROM_EMAIL}>"
    msg["To"] = f"{to_name} <{to_email}>" if to_name else to_email
    msg["Subject"] = subject
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")
    try:
        await aiosmtplib.send(
            msg,
            hostname=SMTP_SERVER,
            port=SMTP_PORT,
            start_tls=True,
            username=SMTP_LOGIN,
            password=SMTP_PASSWORD,
            timeout=20,
        )
        logger.info("Email sent: subject=%r to=%s", subject, to_email)
        return True
    except Exception as e:
        logger.error("Email send failed (to=%s subject=%r): %s", to_email, subject, e)
        return False


def _html_wrap(title: str, body_html: str) -> str:
    return f"""<!doctype html>
<html lang="da"><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#F5F6F1; padding:24px; color:#1B1F1B;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px; margin:0 auto; background:#fff; border:1px solid #E1E5DC; border-radius:8px;">
    <tr><td style="padding:24px 28px 0;">
      <div style="color:#2C4C3B; font-weight:700; font-size:16px; letter-spacing:-.01em;">Medlemsportal</div>
    </td></tr>
    <tr><td style="padding:8px 28px 28px;">
      <h1 style="font-size:22px; margin:16px 0 12px; color:#1B1F1B; font-weight:700;">{title}</h1>
      {body_html}
      <p style="color:#7A7F75; font-size:12px; margin-top:32px;">Denne mail er sendt automatisk fra Medlemsportalen. Svar venligst ikke direkte på denne mail.</p>
    </td></tr>
  </table>
</body></html>"""


async def send_registration_email(member: dict, event: dict, num_members: int, num_non_members: int, note: str, price_member: float, price_non_member: float) -> bool:
    to_email = (member.get("email") or "").strip()
    if not to_email:
        return False
    total = num_members + num_non_members
    title = event.get("title", "Arrangement")
    summary = _event_summary(event)
    summary_html = _event_summary_html(event)
    expected = num_members * (price_member or 0) + num_non_members * (price_non_member or 0)
    price_line = ""
    if expected > 0:
        price_line = f"\nForventet betaling: {expected:g} kr."

    text = (
        f"Hej {member.get('navn', '')}\n\n"
        f"Du er nu tilmeldt arrangementet: {title}.\n\n"
        f"{summary}\n\n"
        f"Antal: {total} ({num_members} medlemmer + {num_non_members} ikke-medlemmer)"
        f"{price_line}"
        f"{(chr(10) + chr(10) + 'Note: ' + note) if note else ''}\n\n"
        f"Vi glæder os til at se dig.\n\nVenlig hilsen\n{FROM_NAME}"
    )

    html_body = f"""
      <p style="margin:0 0 16px;">Hej {member.get('navn', '')}</p>
      <p style="margin:0 0 16px;">Du er nu tilmeldt arrangementet:</p>
      <div style="background:#F5F6F1; border-left:3px solid #2C4C3B; padding:14px 16px; border-radius:4px; margin:12px 0;">
        <div style="font-weight:600; font-size:16px;">{title}</div>
        <div style="color:#5C615C; font-size:14px; margin-top:6px;">{summary_html}</div>
      </div>
      <p style="margin:0 0 8px;"><strong>Antal:</strong> {total} ({num_members} medlemmer + {num_non_members} ikke-medlemmer)</p>
      {f'<p style="margin:0 0 8px;"><strong>Forventet betaling:</strong> {expected:g} kr.</p>' if expected > 0 else ''}
      {f'<p style="margin:0 0 8px;"><strong>Note:</strong> {note}</p>' if note else ''}
      <p style="margin:24px 0 0;">Vi glæder os til at se dig.</p>
    """
    return await _send(to_email, member.get("navn", ""), f"Tilmelding bekræftet — {title}", text, _html_wrap("Tilmelding bekræftet", html_body))


async def send_payment_email(participant: dict, event: dict) -> bool:
    to_email = (participant.get("email") or "").strip()
    if not to_email:
        return False
    title = event.get("title", "Arrangement")
    summary = _event_summary(event)
    summary_html = _event_summary_html(event)
    text = (
        f"Hej {participant.get('navn', '')}\n\n"
        f"Vi har registreret din betaling for arrangementet: {title}.\n\n"
        f"{summary}\n\n"
        f"Tak! Vi ses.\n\nVenlig hilsen\n{FROM_NAME}"
    )
    html_body = f"""
      <p style="margin:0 0 16px;">Hej {participant.get('navn', '')}</p>
      <p style="margin:0 0 16px;">Vi har registreret din betaling for arrangementet:</p>
      <div style="background:#F5F6F1; border-left:3px solid #2C4C3B; padding:14px 16px; border-radius:4px; margin:12px 0;">
        <div style="font-weight:600; font-size:16px;">{title}</div>
        <div style="color:#5C615C; font-size:14px; margin-top:6px;">{summary_html}</div>
      </div>
      <p style="margin:24px 0 0;">Tak! Vi ses.</p>
    """
    return await _send(to_email, participant.get("navn", ""), f"Betaling registreret — {title}", text, _html_wrap("Betaling registreret", html_body))


async def send_reminder_email(participant: dict, event: dict) -> bool:
    to_email = (participant.get("email") or "").strip()
    if not to_email:
        return False
    title = event.get("title", "Arrangement")
    summary = _event_summary(event)
    summary_html = _event_summary_html(event)
    text = (
        f"Hej {participant.get('navn', '')}\n\n"
        f"Bare en lille påmindelse: Du er tilmeldt arrangementet {title} om 2 dage.\n\n"
        f"{summary}\n\nVi glæder os til at se dig.\n\nVenlig hilsen\n{FROM_NAME}"
    )
    html_body = f"""
      <p style="margin:0 0 16px;">Hej {participant.get('navn', '')}</p>
      <p style="margin:0 0 16px;">Bare en lille påmindelse: Du er tilmeldt arrangementet om <strong>2 dage</strong>.</p>
      <div style="background:#F5F6F1; border-left:3px solid #2C4C3B; padding:14px 16px; border-radius:4px; margin:12px 0;">
        <div style="font-weight:600; font-size:16px;">{title}</div>
        <div style="color:#5C615C; font-size:14px; margin-top:6px;">{summary_html}</div>
      </div>
      <p style="margin:24px 0 0;">Vi glæder os til at se dig.</p>
    """
    return await _send(to_email, participant.get("navn", ""), f"Påmindelse: {title} om 2 dage", text, _html_wrap("Påmindelse om arrangement", html_body))
