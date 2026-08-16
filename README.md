# portfolio-v6-admin

Cognito-gated admin UI for **Portfolio v6** — **Vite + React + TypeScript + MUI**, fully
themed (light/dark + system detection). It is the single-operator console for editing the
public site's content: pages management, the section/item page builder, blogs, the blog
post + block editor, the media library, preview, publishing, version history/restore,
integrations (Spotify/GitHub/Duolingo + API keys), and analytics.

Deploys to Vercel as `portfolio-v6-admin-dev` (production branch `dev`) and
`portfolio-v6-admin-prod` (production branch `main`, portfolio-v6-admin-prod.vercel.app).
The authoritative spec is `TECH_SPEC_V1.md` in the `portfolio-v6` repo; section references
below (e.g. §4.2) point into it.

## Purpose & architecture (§2, §8.3, §14.4)

The system is a deliberate three-repo split: a public site (`portfolio-v6`), an API
(`portfolio-v6-api`), and **this admin**. The public bundle ships no Cognito SDK by design,
so all authenticated editing lives here. The admin talks only to the API's `/api/admin/*`
routes (§4.2); auth is Cognito SRP with the id token attached as a bearer on each request
and a one-shot refresh-then-logout on `401`. Server-side, admin routes require the token's
`cognito:groups` to include `admins` (403 otherwise); a subset of routes (posts, media
upload, blogs list) alternatively accepts a machine **API key** (`pv6k_…`) minted and
revoked from the Integrations page — see `requireAdminOrMachine` in the API repo.

**Login flow** (`src/lib/cognitoClient.ts` + `src/pages/LoginPage.tsx`): SRP sign-in is a
small state machine. First login with an admin-issued temporary password answers a
`NEW_PASSWORD_REQUIRED` challenge — the form collects any pool-required attributes the
profile is missing (`given_name`/`family_name` render as First/Last name). The prod pool
then requires TOTP: enrollment renders a scannable `otpauth://` QR code (`qrcode.react`)
with a manual-entry secret fallback; subsequent logins ask for the 6-digit code. A
"Forgot password?" flow (emailed verification code → new password) covers self-service
recovery for users who have completed first login; invited users still on a temporary
password need a fresh invite instead.

Content publishing is **snapshot-based**: edits accumulate in a *working set* (sections,
items, post drafts), and an explicit **Publish** captures that working set as an immutable
*version* that the public API serves. Preview shows the draft through the real public-site
renderer (in an iframe) before you commit to publishing.

The admin is built once, fully, on MUI and is **not** part of any future public-site restyle
(§14.4). All styling goes through one theme module plus per-component `sx` — there are no
parallel CSS files in this repo.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server on `localhost:5174` with the `/api` → `:3002` proxy (§10). |
| `npm run build` | Type-check (`tsc --noEmit`) then production `vite build`. |
| `npm run preview` | Serve the built `dist/` locally to sanity-check a production build. |
| `npm test` | Run the Vitest suite once (offline; AWS/Cognito and the API are mocked). |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run sync:types` | Regenerate `src/types/content.ts` from `<api>/api/schema` when the API is reachable; a no-op that leaves the committed file authoritative when it is not (§8.4). |

## Environment variables (§9.6)

Vite exposes **only** `VITE_`-prefixed vars to the client via `import.meta.env`; `process`
does not exist at runtime, so a stray `process.env.X` is a `ReferenceError`, not `undefined`.
Copy `.env.example` to `.env.local` and fill in:

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | API origin. **Empty locally** so requests are same-origin and the Vite dev proxy (§10) forwards `/api`; the gateway origin (`https://api.benkile.com/portfolio-v6-api[-dev]`) in deployed environments. |
| `VITE_COGNITO_USER_POOL_ID` | Cognito user pool id (prod vs dev pool per environment). |
| `VITE_COGNITO_CLIENT_ID` | Cognito app client id (public SPA client — **no** client secret). The region is derived from the pool id — there is no region variable. |
| `VITE_PUBLIC_SITE_URL` | Public-site hostname; the preview-iframe target (§7). Becomes `https://benkile.com` at cutover — the only value that changes when the apex is swapped. |
| `VITE_CDN_URL` | Optional CDN base for media thumbnails (§6.8). Used only when the media list does not already return a resolved `url`; leave empty to fall back to the raw `s3_key`. |

Vercel scopes these per environment (Production vs Preview). The project also enables Vercel
deployment protection and ships `robots.txt` with `Disallow: /` (§9.6).

## Local development (§10)

Run the API locally against the **dev** database and **dev** Cognito pool — do not iterate by
deploying (an API deploy triggers a ~7-minute ASG instance refresh, §10). The three repos run
side by side:

```
portfolio-v6-api      npm run dev   → localhost:3002   (IS_LOCAL=true)
portfolio-v6          npm run dev   → localhost:5173
portfolio-v6-admin    npm run dev   → localhost:5174   ← this repo
```

**Pointing the admin at a local API.** Leave `VITE_API_BASE_URL` **empty**. Requests then go
out same-origin as `/api/...`, and Vite's dev proxy forwards them to the API container:

```ts
// vite.config.ts
server: { proxy: { '/api': { target: 'http://localhost:3002', changeOrigin: true } } }
```

This mirrors what the gateway does in production, so CORS never enters the local path and
local behavior matches deployed behavior. To point at a different local API port, change the
proxy `target` (not `VITE_API_BASE_URL`, which stays empty locally). Preview (§7) additionally
needs a public site running at `VITE_PUBLIC_SITE_URL` (default `http://localhost:5173` for
local work) so the iframe has something to render.

### Offline verification

All checks run **offline** — AWS/Cognito and the API are unreachable in CI and this container.
Cognito is mocked at the SDK level (`__mocks__/amazon-cognito-identity-js.ts`, following the
`FileManager` reference pattern) and the API via `axios-mock-adapter`. `npm run build` and
`npm test` therefore pass with no network access. Dependencies are **pinned to exact
versions** in `package.json` — a bare `npm install` would float to newer majors; keep
versions pinned.

## API endpoint → UI coverage (§4.2)

Every admin endpoint in spec §4.2 is reachable from the UI. The API wrappers live in
`src/api/*Api.ts`; the "UI entry point" column is where an operator triggers each call.

| Method | Path | UI entry point | API wrapper |
|---|---|---|---|
| `GET` | `/api/admin/pages` | Pages page — list load | `getPages` |
| `POST` | `/api/admin/pages` | Pages → **Add page** dialog | `createPage` |
| `PATCH` | `/api/admin/pages/:id` | Page **Edit** dialog | `updatePage` |
| `DELETE` | `/api/admin/pages/:id` | Page row → **Delete** (confirm) | `deletePage` |
| `PUT` | `/api/admin/pages/order` | Page drag-and-drop reorder | `reorderPages` |
| `GET` | `/api/admin/sections?page_id=` | Sections page — load for the selected page | `getSections` |
| `POST` | `/api/admin/sections` | Sections → **Add section** dialog | `createSection` |
| `PATCH` | `/api/admin/sections/:id` | Section **Edit** dialog + hide/show toggle | `updateSection` |
| `DELETE` | `/api/admin/sections/:id` | Section card → **Delete** (confirm) | `deleteSection` |
| `PUT` | `/api/admin/sections/order` | Section drag-and-drop reorder (body `{ page_id, ids }`) | `reorderSections` |
| `POST` | `/api/admin/sections/:id/items` | Items editor → **Add item** | `createItem` |
| `PATCH` | `/api/admin/items/:id` | Item **Edit** dialog | `updateItem` |
| `DELETE` | `/api/admin/items/:id` | Items editor → delete item | `deleteItem` |
| `PUT` | `/api/admin/sections/:id/items/order` | Item drag-and-drop reorder | `reorderItems` |
| `POST` | `/api/admin/media/upload-url` | Media → **Upload** dialog (presign) | `requestUploadUrl` |
| `POST` | `/api/admin/media/:id/confirm` | Upload dialog — after the S3 PUT lands | `confirmUpload` |
| `GET` | `/api/admin/media` | Media page — grid load + picker | `getMedia` |
| `DELETE` | `/api/admin/media/:id` | Media asset → **Delete** | `deleteMedia` |
| `POST` | `/api/admin/media/sweep` | Media → **Run sweep** (GC on demand, §6.9) | `runSweep` |
| `GET` | `/api/admin/posts` | Posts page — list load | `getPosts` |
| `POST` | `/api/admin/posts` | Posts → **Create post** dialog | `createPost` |
| `GET` | `/api/admin/posts/:id` | Post editor — load draft | `getPost` |
| `PATCH` | `/api/admin/posts/:id` | Post editor — save metadata / `draft_body` | `updatePost` |
| `DELETE` | `/api/admin/posts/:id` | Post editor → **Delete** | `deletePost` |
| `POST` | `/api/admin/posts/:id/publish` | Post editor → **Publish** | `publishPost` |
| `POST` | `/api/admin/posts/:id/unpublish` | Post editor → **Unpublish** | `unpublishPost` |
| `POST` | `/api/admin/preview-token` | Preview page + per-post preview (`PreviewFrame`) | `mintPreviewToken` |
| `GET` | `/api/admin/preview` † | Public site inside the **Preview** iframe (admin mints the token; the public bundle calls this route) | — (public site) |
| `GET` | `/api/admin/preview/posts/:id` † | Public site inside the **per-post preview** iframe | — (public site) |
| `POST` | `/api/admin/publish` | App bar → **Publish site** (snapshots the working set live, §4.2/§3.9) | `publishSite` |
| `GET` | `/api/admin/versions` | Versions page — history load | `getVersions` |
| `POST` | `/api/admin/versions/:v/restore` | Versions → **Restore** (destructive; explicit confirm, §4.2) | `restoreVersion` |
| `GET` | `/api/admin/blogs` | Blogs page — list load | `getBlogs` |
| `POST` | `/api/admin/blogs` | Blogs → **Add blog** dialog | `createBlog` |
| `PATCH` | `/api/admin/blogs/:id` | Blog **Edit** dialog | `updateBlog` |
| `DELETE` | `/api/admin/blogs/:id` | Blog row → **Delete** (confirm) | `deleteBlog` |
| `GET` | `/api/admin/api-keys` | Integrations → API keys section | `getApiKeys` |
| `POST` | `/api/admin/api-keys` | Integrations → **Create key** (secret shown once) | `createApiKey` |
| `POST` | `/api/admin/api-keys/:id/revoke` | Integrations → key row **Revoke** (confirm) | `revokeApiKey` |
| `GET` | `/api/admin/integrations` | Integrations page — list load | `getIntegrations` |
| `PUT` | `/api/admin/integrations/:key/value` | Integrations → set PAT/username | `saveIntegrationValue` |
| `POST` | `/api/admin/integrations/:key/connect` | Integrations → **Connect** (Spotify OAuth) | `connectIntegration` |
| `DELETE` | `/api/admin/integrations/:key` | Integrations → **Disconnect** | `disconnectIntegration` |
| `GET` | `/api/admin/analytics?days=` | Analytics page — load | `getAnalytics` |
| `GET` | `/api/admin/icons/devicon-manifest` | Item editor — icon picker | `getDeviconManifest` |
| `GET` | `/api/admin/icons/simpleicons-manifest` | Item editor — icon picker | `getSimpleIconsManifest` |
| `POST` | `/api/admin/icons/import` | Item editor — import icon as media | `importIcon` / `importSimpleIcon` |

**On the two † routes.** `GET /api/admin/preview` and `GET /api/admin/preview/posts/:id`
serialize the *draft* for the preview iframe and are guarded by `requireAdminOrPreviewToken()`
(§4.2). They are called by the **public site** inside the iframe, not by the admin directly —
the admin's role is to mint the short-lived preview token (`POST /api/admin/preview-token`) and
compose the iframe URL (`src/lib/previewUrl.ts`). That is why their wrapper column reads "—".

Public endpoints (§4.1: `/api/health`, `/api/content`, `/api/status`, `/api/now-playing`,
`/api/posts`, `/api/posts/:slug`) are the public site's concern and are intentionally **not**
consumed by the admin.

## Concurrency & validation behavior (§4.5, §3.9)

- Every section/item/post `PATCH` sends `expected_updated_at`; a `409` raises the shared
  "this changed since you loaded it" refetch dialog rather than silently overwriting (§4.5).
  Reorder (`PUT .../order`) and the two publish routes are exempt by design.
- **Publish re-validates** the whole working set / post body server-side (§3.9). A validation
  refusal (`400`/`422`) is surfaced as a typed error and listed issue-by-issue in the UI, not
  as an opaque toast — see `publishSite` / `publishPost` and their pages.
- **Restore is destructive**: it re-publishes an old version *and* rebuilds the working set
  from it, discarding current unpublished edits (§4.2). The Versions page confirms explicitly
  before firing.

## Structure

```
src/
├── lib/cognitoClient.ts        Cognito sign-in state machine (SRP → new-password →
│                               TOTP setup/entry) + forgot-password recovery (§5.1/§5.2)
├── api/
│   ├── apiClient.ts            axios instance; request interceptor → Bearer idToken
│   ├── setupInterceptors.ts    response interceptor: 401 → one refresh+retry → logout
│   ├── pagesApi.ts             pages CRUD/reorder (§3.10)
│   ├── sectionsApi.ts          sections + items CRUD/reorder, page-scoped (§4.2, §4.5)
│   ├── blogsApi.ts             blogs CRUD (v1.13)
│   ├── postsApi.ts             posts CRUD + publish/unpublish (§3.6, §3.9)
│   ├── mediaApi.ts             upload-url/confirm/list/delete/sweep + direct S3 PUT (§6)
│   ├── versionsApi.ts          versions list, restore, and site publish (§4.2, §3.9)
│   ├── previewApi.ts           preview-token minting (§7)
│   ├── apiKeysApi.ts           pv6k_ machine keys: list/mint/revoke (v1.16)
│   ├── integrationsApi.ts      Spotify/GitHub/Duolingo credentials + OAuth connect
│   ├── analyticsApi.ts         beacon analytics summary
│   └── iconsApi.ts             devicon/simple-icons manifests + import-as-media
├── contexts/AuthContext.tsx    session state derived from the id token (no users table;
│                               the admins-group check is server-side, §5.3)
├── theme/                      one theme module: light+dark, system detection (§14.4)
├── components/                 AppShell, dialogs, dnd, forms, media, posts, sections,
│                               preview, apiKeys
├── pages/                      Login, Pages, Sections, Blogs, Posts + editor/preview,
│                               Media, Versions, Preview, Integrations, Analytics
└── types/content.ts            content model, sync'd from the API schema (§8.4)
```

## Testing

Verification runs **offline** (see *Offline verification* above). The suite covers the login
flow (including the new-password challenge with required attributes, TOTP, and the
forgot-password request/confirm paths), request-interceptor attach, the
401-refresh-retry-then-logout path, protected routing, the theme toggle,
pages/sections/items/blogs/media/posts editors, API-key mint/revoke, preview URL
composition, version restore, and site publish (including the validation-refusal path).
Run it with `npm test`.
