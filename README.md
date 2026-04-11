# Admin Backend (NestJS)

This is a lightweight admin API for the Flutter Quran app.

## Setup

1. Copy `.env.example` to `.env` and set DB/JWT/admin seed values.
2. Install dependencies:
```
npm install
```
3. Run dev server:
```
npm run start:dev
```

## Endpoints

- `GET /health`
- `POST /auth/login` (email/password -> JWT)
- `GET /admin/overview`
- `GET /admin/content`
- `GET /users`
- `PATCH /users/:id/active`
- `GET /editions`
- `POST /editions`
- `PATCH /editions/:id/enabled`
- `GET /announcements`
- `POST /announcements`
- `PATCH /announcements/:id/active`
- `GET /settings`
- `POST /settings`
- `GET /settings/flags`
- `PATCH /settings/flags/:id`
