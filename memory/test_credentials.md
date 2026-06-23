# Test Credentials

## Admin Account (seeded on startup)
- Email: `tdeele@gmail.com`
- Password: `Fransen123!!!`
- Role: `admin`

## Authentication
- JWT-based (email + password) with httpOnly cookies
- POST `/api/auth/login` `{ email, password }` → sets `access_token` cookie + returns user
- GET `/api/auth/me` (auth required) → current user
- POST `/api/auth/logout` → clears cookies

## App routes (frontend)
- `/login` – login screen
- `/medlemmer` – members list (search, import - admin)
- `/arrangementer` – events list (create - admin)
- `/arrangementer/:id` – event detail (participants, add/remove - admin)
- `/brugere` – user account management (admin only)

## Notes
- Test users may be created by admin via `/brugere` page
- Default admin role can create members, events, and additional users
