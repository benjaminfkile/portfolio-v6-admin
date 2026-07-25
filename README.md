# portfolio-v6-admin

Cognito-gated admin UI for Portfolio v6 — **Vite + React + TypeScript + MUI**, fully
themed (light/dark + system detection). Deploys to Vercel at `admin.benkile.com`. See
`/context/portfolio-v6/TECH_SPEC_V1.md` for the authoritative spec; section references
below point into it.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server on `localhost:5174` with the `/api` → `:3002` proxy (§10). |
| `npm run build` | Type-check (`tsc --noEmit`) then production `vite build`. |
| `npm test` | Run the Vitest suite once (offline; AWS/Cognito and the API are mocked). |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run sync:types` | Regenerate `src/types/content.ts` from `<api>/api/schema` when reachable (§8.4). |

## Environment (§9.6)

Vite exposes only `VITE_`-prefixed vars via `import.meta.env`; `process` does not exist at
runtime. Copy `.env.example` to `.env` and fill in:

- `VITE_API_BASE_URL` — empty locally (same-origin, proxied); the gateway origin in prod.
- `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_REGION` — SRP client.
- `VITE_PUBLIC_SITE_URL` — public-site hostname, used as the preview iframe target (§7).

## Structure

```
src/
├── lib/cognitoClient.ts        SRP auth via amazon-cognito-identity-js (ported §5.2)
├── api/
│   ├── apiClient.ts            axios instance; request interceptor → Bearer idToken
│   └── setupInterceptors.ts    response interceptor: 401 → one refresh+retry → logout
├── contexts/AuthContext.tsx    session state (no users table — group claim only, §5.3)
├── theme/                      one theme module: light+dark, system detection (§14.4)
├── components/                 AppShell (AppBar/Drawer), ProtectedRoute, ThemeToggle …
├── pages/                      Login + Sections/Posts/Media/Versions/Preview (stubs)
└── types/content.ts            content model, hand-derived from spec §3 (generated-equiv)
```

## Testing

Verification runs **offline**. Cognito is mocked at the SDK level
(`__mocks__/amazon-cognito-identity-js.ts`, following the FileManager pattern) and the API
via `axios-mock-adapter`. Covered: login flow, request-interceptor attach, the
401-refresh-retry-then-logout path, protected routing, and the theme toggle.
