# Medlems- og Arrangementsapp — PRD

## Original problem statement (Danish)
Arrangement og medlems check app: Webapp skal både have frontend og backend, med users og admins. På backend opretter brugerene, som import af nedenstående excel ark, arket bruges til at lave en medlemsliste i systemet. I import er felt 1 medlemsnummer, Felt 2 navn og adresse, Felt 3 e-mail, felt 4 telefon feltet laves som tekst, felt 5 indholder 2 typer informationer, som i systemet skal laves som 2 felter "medlemstype (Alm. Melemskab, Medlemsskab uden opkrævning, Livsvarigt medlemskab) - Status på hvordan de modtager bladet (medlemsblad med posten ell. medlemsblad på e-mail). Admins kan importerer denne liste, import skal overskrive eksisterende medlemsnumre. På backend skan man kunne oprette et arrangement, som man senere på frontend kan tildele deltagere, samt en note ud for tilmelding. Kun admins kan tilføje/slette deltagere, men Users kan se deltagere til et givent arrangement. Når man skal tilføje deltagere, skal systemet kunne søge på medlemsnummer feltet, Navn/adresse feltet, telefon, og email feltet som wildcard søgning. Der skal også logges ind på frontend for at kunne bruge systemet.

## Architecture
- **Frontend**: React 19, React Router, Tailwind, Shadcn UI, Manrope/Work Sans
- **Backend**: FastAPI (modular: `core/{db,security,schemas,helpers,serializers}.py` + `server.py`), Motor, JWT (PyJWT), bcrypt, openpyxl
- **Auth**: JWT (httpOnly cookie + Bearer fallback). Admin seeded on startup from env.
- **Storage**: Local file system (`backend/storage_utils.py`) — `UPLOAD_DIR` env var on prod points outside the git repo (Contabo VPS).

## Personas
- **Administrator** (`tdeele@gmail.com`): imports members, creates events, manages participants and users.
- **Bruger**: read-only — views members and event participants.

## Core requirements
- Login (email + adgangskode)
- Excel import (`.xlsx`) — overwrites by `medlemsnummer`
- Member fields: medlemsnummer, navn, adresse (multi-line), email, telefon (text), medlemstype, bladstatus
- Wildcard search on medlemsnummer, navn, adresse, telefon, email
- Events: title, dato, tid, sted, adresse (DAWA), beskrivelse, billede, priser, tilmeldingsfrist, kontaktperson
- Participants: per-event with notes; same household added separately; paid + checked-in toggles
- Role-based: only admin mutates
- Emails (Brevo SMTP): registration / paid / 2-day reminder
- Facebook Group sharing via OG-tagged public preview + clipboard copy

## Implemented
- ✅ JWT auth with seeded admin, /api/auth/{login,me,logout}, brute force lockout
- ✅ User CRUD (admin)
- ✅ Excel import (overwrite by `medlemsnummer`)
- ✅ Wildcard member search; clickable member rows → `/medlemmer/:id`
- ✅ Event CRUD with cover image, DAWA address, time, deadline, contact person
- ✅ Priser pr. arrangement, antal medl/ikke-medl pr. tilmelding
- ✅ Betalt-checkbox + Mødt op (live check-in)
- ✅ Økonomi-widget (Forventet/Betalt/Mangler)
- ✅ CSV-eksport af deltagerliste med Mødt op-status
- ✅ Brevo SMTP: tilmelding / betaling / påmindelse 2 dage før (APScheduler 09:00 Europe/Copenhagen)
- ✅ `/api/admin/run-reminders` manuel udsendelse
- ✅ Lyst grøn tema + custom logo
- ✅ Facebook Group share (Open Graph + clipboard + manual paste flow)
- ✅ **Lokal filsystem-storage** for Contabo VPS deploy (`UPLOAD_DIR` env)
- ✅ **DEPLOY_CONTABO.md** trin-for-trin guide (Nginx, systemd, certbot, MongoDB, uploads-mappe udenfor repo)
- ✅ **2026-02-23**: Modular backend refactor — `server.py` slankere; helpers/schemas/serializers/security i `core/`. EventDetailPage.js opdelt i `components/event-detail/{EventHeader,FinanceWidget,ParticipantsTable,AddParticipantDialog,EditParticipantDialog,EditEventDialog,FacebookShareDialog,utils}.js`.
- ✅ **2026-02-23**: NEW — Medlems-detaljeside med tilmeldingshistorik (`/medlemmer/:id`) + backend `GET /api/members/{id}/registrations`. Klik på en tilmelding → arrangementets detaljeside. 10/10 tests pass + frontend Playwright flows verified.

## Backlog
- **P3**: IP-baseret brute force i tillæg til email-baseret
- **P3**: Restrict CORS allowlist i produktion
- **P3**: i18n (currently DK-only)
- **P3**: 404 i stedet for 500 ved malformed ObjectId i URLs (delvist gjort)

## Files
- Backend: `/app/backend/server.py`, `/app/backend/core/*.py`, `/app/backend/email_utils.py`, `/app/backend/storage_utils.py`
- Frontend pages: `/app/frontend/src/pages/{LoginPage,DashboardPage,MembersPage,MemberDetailPage,EventsPage,EventDetailPage,QuickCheckInPage,UsersPage}.js`
- Event detail sub-components: `/app/frontend/src/components/event-detail/*.js`
- Auth context: `/app/frontend/src/context/AuthContext.js`
- Deploy guide: `/app/DEPLOY_CONTABO.md`
- Test credentials: `/app/memory/test_credentials.md`
