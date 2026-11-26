# AETIS Frontend

React 18 + TypeScript + Vite interface for the AETIS emergency vehicle priority and hospital pre-alert system.

## Run

```bash
npm install
cp .env.example .env.local      # Windows: copy .env.example .env.local
npm run dev
```

Open `http://localhost:5173`. Set `VITE_USE_MOCK_DATA=false` to connect directly to the FastAPI backend (`aetis-backend/`) through the Vite proxy (`/api` and `/ws`).

## Supported Roles
- `dispatcher`: `dispatcher@aetis.example` (mock) or seeded backend dispatcher
- `driver`: `driver@aetis.example` (mock) or seeded backend driver
- `hospital`: `hospital@aetis.example` (mock) or seeded backend hospital staff
- `admin`: `admin@aetis.example` (mock) or seeded backend admin

## Scripts

```bash
npm run typecheck    # TypeScript check (tsc --noEmit)
npm run lint         # ESLint check
npm test             # Run frontend unit/contract tests
npm run build        # Production Vite bundle
```

## Authentication & Security
- Browser sessions use `HttpOnly` `access_token` / `refresh_token` cookies plus double-submit `X-CSRF-Token` validation; JWTs are never stored in `localStorage`.
- WebSocket connections use `wss://` in HTTPS deployments and automatically resync Redux slices on reconnect.
