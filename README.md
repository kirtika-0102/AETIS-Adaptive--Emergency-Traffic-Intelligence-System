# AETIS frontend

Dispatcher, driver, hospital and admin interfaces for the AETIS emergency-vehicle priority system.
This repository contains only the frontend. There is no backend or database yet.

## Run

    npm install
    cp .env.example .env.local      # Windows: copy .env.example .env.local
    npm run fix:classes             # once
    npm run dev

Open http://localhost:5173. With `VITE_USE_MOCK_DATA=true` (development only) the app runs on built-in demo data.

## Demo accounts (mock mode only)

Password for all of them: `Demo@1234`

| Role | Email |
|---|---|
| Admin | admin@aetis.example |
| Dispatcher | dispatcher@aetis.example |
| Driver | driver@aetis.example |
| Hospital | hospital@aetis.example, hospital2@aetis.example |
| Police | police@aetis.example |
| Fire | fire@aetis.example |

## Browser console helpers (mock mode)

    __aetisMock.startTrip()     start a dispatched vehicle moving
    __aetisMock.failNext(3)     make the next 3 requests fail
    __aetisMock.reset()         restore the starting data and sign out

## Scripts

    npm run typecheck    type-check without building
    npm run build        production build
    npm run lint         lint src/
    npm run format       format src/

## Connecting a real backend

Set `VITE_USE_MOCK_DATA=false`, point `VITE_DEV_PROXY_TARGET` at the backend, and follow the endpoint
list in `src/services/api/`. The session must be an HttpOnly cookie, and the WebSocket server must
check the `Origin` header.# AETIS-Adaptive--Emergency-Traffic-Intelligence-System