# BeepJeep

Real-time jeepney tracking and fleet management mobile app for the Philippines.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (port 8080)
- `pnpm --filter @workspace/mobile run dev` — Expo mobile app
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Socket.io (real-time GPS)
- DB: PostgreSQL + Drizzle ORM
- Auth: JWT (jsonwebtoken + bcryptjs) stored in AsyncStorage
- Export: xlsx for Excel/CSV report generation
- Mobile: Expo (React Native) + expo-router + react-native-webview
- Maps: Leaflet.js via WebView (no API key needed)

## Where things live

- DB schema: `lib/db/src/schema/` — users, fleets, fare_records
- API routes: `artifacts/api-server/src/routes/` — auth, fleets, fares, reports
- JWT middleware: `artifacts/api-server/src/middlewares/auth.ts`
- Socket.io: `artifacts/api-server/src/socket.ts`
- Mobile screens: `artifacts/mobile/app/` — index (login), signup, driver, commuter, admin
- Auth context: `artifacts/mobile/context/AuthContext.tsx`
- Socket context: `artifacts/mobile/context/SocketContext.tsx`
- API helper: `artifacts/mobile/lib/api.ts`

## Architecture decisions

- Socket.io path is `/api/socket.io` so it routes through the Replit proxy alongside REST
- Fleet drivers cannot self-register — credentials are provisioned by admin only
- JWT token passed as query param for file export endpoints (acceptable for download-only)
- Leaflet maps loaded in WebView via HTML string (CDN) — avoids native map SDK complexity
- Fare records persisted to DB server-side; local state tracks session totals for the driver UI

## Product

**4 user types:**
1. **Admin** — self-registers, creates fleets, provisions fleet driver credentials, exports Excel/CSV reports
2. **Fleet Driver** — credentials created by admin, tracks GPS + fares, belongs to a fleet
3. **Independent Driver** — self-registers, same tracking features, no fleet
4. **Commuter** — self-registers, sees live jeepney map, gets proximity alerts when within 100m

## User preferences

- White and orange color scheme
- Filipino peso (₱) fare amounts: Regular ₱13, Student/Senior ₱10
- Default map center: Manila (14.5995, 120.9842)

## Gotchas

- Run `pnpm --filter @workspace/db run push` after any schema changes
- Socket.io WebSocket upgrade requires the Replit proxy — direct port connections won't work
- Font loading from Google CDN times out in the Replit sandbox — use system fonts only
