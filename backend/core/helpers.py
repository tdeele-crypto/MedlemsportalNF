"""Pure helpers: text parsing, Excel cell coercion, HTML escaping, DK date formatting."""
from datetime import datetime


MEDLEMSTYPER = [
    "Livsvarigt medlemskab",
    "Medlemskab uden opkrævning",
    "Alm. medlemskab",
]

_DK_DAYS = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"]
_DK_MONTHS = [
    "januar", "februar", "marts", "april", "maj", "juni",
    "juli", "august", "september", "oktober", "november", "december",
]


def parse_medlemskaber(text: str) -> tuple[str, str]:
    """Parse the free-text 'Medlemskaber' column into (medlemstype, bladstatus)."""
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
    elif (
        "medlemsblad på e-mail" in t or "på e-mail" in t
        or "paa e-mail" in t or "pa e-mail" in t
    ):
        bladstatus = "Medlemsblad på e-mail"
    return (medlemstype, bladstatus)


def clean_str(v) -> str:
    """Normalize an Excel cell value into a trimmed string."""
    if v is None:
        return ""
    if isinstance(v, float):
        if v.is_integer():
            return str(int(v))
        return str(v)
    return str(v).strip()


def html_escape(s) -> str:
    if s is None:
        return ""
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def format_dk_date(date_str: str | None, time_str: str | None = None) -> str:
    """Render an ISO date string as 'mandag d. 5. marts 2026 kl. 19:00' (Danish)."""
    if not date_str:
        return ""
    try:
        d = datetime.fromisoformat(date_str.replace("Z", "+00:00").split("T")[0])
        s = f"{_DK_DAYS[d.weekday()]} d. {d.day}. {_DK_MONTHS[d.month - 1]} {d.year}"
        if time_str:
            s += f" kl. {time_str}"
        return s
    except Exception:
        return date_str
