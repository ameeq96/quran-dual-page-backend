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

## Production

This repo is ready for a basic Node.js deployment on Hostinger for `adminapi.opplexify.com`.

Required environment variables:

```env
HOST=0.0.0.0
PORT=3000
NODE_ENV=production
APP_URL=https://adminapi.opplexify.com
DB_HOST=your-db-host
DB_PORT=3306
DB_USER=your-db-user
DB_PASS=your-db-password
DB_NAME=your-db-name
DB_SYNCHRONIZE=true
DB_LOGGING=false
JWT_SECRET=your-strong-secret
JWT_EXPIRES_IN=7d
ADMIN_SEED_EMAIL=admin@opplexify.com
ADMIN_SEED_PASSWORD=ChangeMe123!
```

Notes:

- `npm install` will automatically run `npm run build` because of the `postinstall` script.
- App startup command is `npm start`.
- Static files inside `storage/` are served from `/assets`.
- Health check endpoint is `GET /health`.
- Startup and crash logs now print to stdout/stderr, so they should appear in Hostinger logs.

## Hostinger Deploy

1. Create a new `Node.js` website in Hostinger hPanel.
2. Use the domain/subdomain `adminapi.opplexify.com`.
3. Upload this project to the app directory or connect the Git repo.
4. Set the application startup command to:
```bash
npm start
```
5. Set the install command to:
```bash
npm install
```
6. Add the environment variables from the section above in Hostinger.
7. Create the MySQL database in Hostinger and use those credentials in the env vars.
8. Restart the Node.js app from hPanel.

After deployment, test:

- `https://adminapi.opplexify.com/health`
- `https://adminapi.opplexify.com/auth/login`

## PM2 Deploy

If you are using a VPS or any server where you manage the process yourself:

1. Upload the project.
2. Create `.env` from `.env.example` and fill production values.
3. Install dependencies:
```bash
npm install
```
4. Start with PM2:
```bash
npm run pm2:start
```
5. Save PM2 process list:
```bash
npx pm2 save
```
6. Enable PM2 startup on reboot:
```bash
npx pm2 startup
```

Useful PM2 commands:

- `npm run pm2:logs`
- `npm run pm2:restart`
- `npm run pm2:stop`
- `npx pm2 status`

PM2 log files:

- `logs/pm2-out.log`
- `logs/pm2-error.log`

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
