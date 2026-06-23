# Medlems- og Arrangementsapp — PRD

## Original problem statement (Danish)
Arrangement og medlems check app: Webapp skal både have frontend og backend, med users og admins. På backend opretter brugerene, som import af nedenstående excel ark, arket bruges til at lave en medlemsliste i systemet. I import er felt 1 medlemsnummer, Felt 2 navn og adresse, Felt 3 e-mail, felt 4 telefon feltet laves som tekst, felt 5 indholder 2 typer informationer, som i systemet skal laves som 2 felter "medlemstype (Alm. Melemskab, Medlemsskab uden opkrævning, Livsvarigt medlemskab) - Status på hvordan de modtager bladet (medlemsblad med posten ell. medlemsblad på e-mail). Admins kan importerer denne liste, import skal overskrive eksisterende medlemsnumre. På backend skan man kunne oprette et arrangement, som man senere på frontend kan tildele deltagere, samt en note ud for tilmelding. Kun admins kan tilføje/slette deltagere, men Users kan se deltagere til et givent arrangement. Når man skal tilføje deltagere, skal systemet kunne søge på medlemsnummer feltet, Navn/adresse feltet, telefon, og email feltet som wildcard søgning. Der skal også logges ind på frontend for at kunne bruge systemet.

## Architecture
- **Frontend**: React 19, React Router, Tailwind, Shadcn UI, Manrope/Work Sans
- **Backend**: FastAPI, Motor (async MongoDB), JWT (PyJWT), bcrypt, openpyxl
- **Auth**: JWT (httpOnly cookie + Bearer fallback). Admin seeded on startup from env.

## Personas
- **Administrator** (Tina/foreningsbestyrelse): seeded `tdeele@gmail.com`. Imports members, creates events, adds/removes participants, manages user accounts.
- **Bruger**: Read-only — can view members and event participants but cannot edit/import.

## Core requirements
- Login (email + adgangskode)
- Excel import (`.xlsx`) — overwrites by `medlemsnummer`
- Member fields: medlemsnummer, navn, adresse (multi-line), email, telefon (text), medlemstype, bladstatus
- Wildcard search on medlemsnummer, navn, adresse, telefon, email
- Events: title, dato, sted, beskrivelse
- Participants: per-event with notes; same household added separately
- Role-based: only admin mutates

## Implemented (2026-02)
- ✅ JWT auth with seeded admin, /api/auth/{login,me,logout}, brute force lockout
- ✅ User CRUD (admin)
- ✅ Excel parser → parses `Medlemskaber` into `medlemstype` + `bladstatus`
- ✅ Member list + wildcard regex search
- ✅ Event CRUD (incl. UI edit dialog with gear icon)
- ✅ Tid (HH:MM) felt på arrangementer
- ✅ "Vi mødes her" + DAWA adresse-autocomplete
- ✅ Priser pr. arrangement, antal medl/ikke-medl pr. tilmelding
- ✅ Betalt-checkbox + Mødt op (live check-in) checkbox
- ✅ Økonomi-widget (Forventet/Betalt/Mangler)
- ✅ CSV-eksport af deltagerliste med Mødt op-status
- ✅ **SMTP via Brevo**: automatiske emails ved tilmelding, ved betaling registreret, samt påmindelse 2 dage før arrangement (APScheduler kører dagligt kl. 09:00 Europe/Copenhagen)
- ✅ Admin endpoint `/api/admin/run-reminders` til manuel udsendelse

## Backlog
- **P2**: Email reminders til tilmeldte (Resend integration)
- **P2**: Medlems-detaljeside med tilmeldingshistorik
- **P3**: IP-baseret brute force i tillæg til email-baseret
- **P3**: Restrict CORS allowlist i produktion
- **P3**: i18n (currently DK-only)
- **P3**: 404 i stedet for 500 ved malformed ObjectId i URLs

## Files
- Backend: `/app/backend/server.py`
- Frontend pages: `/app/frontend/src/pages/{LoginPage,DashboardPage,MembersPage,EventsPage,EventDetailPage,UsersPage}.js`
- Auth context: `/app/frontend/src/context/AuthContext.js`
- Test credentials: `/app/memory/test_credentials.md`
