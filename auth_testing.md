# Auth Testing Playbook

## Admin
- Email: `tdeele@gmail.com`
- Password: `Fransen123!!!`

## Endpoints
- POST /api/auth/login `{email,password}` → user + sets cookies
- GET /api/auth/me → current user (cookie or Bearer)
- POST /api/auth/logout → clears cookies

## Test
```
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)
curl -c /tmp/c.txt -X POST $API/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"tdeele@gmail.com","password":"Fransen123!!!"}'
curl -b /tmp/c.txt $API/api/auth/me
```

## Mongo
- Users collection: `users` (email unique index)
- Login attempts: `login_attempts`
- Admin seeded on startup, password hash updates if .env changed
