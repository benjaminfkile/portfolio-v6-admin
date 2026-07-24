# Agent runner pre-checks

**Date:** 2026-07-24
**Container working dir:** `/workspace` (branch `grunt-task-433`)
**Purpose:** Verify the runner environment (toolchain, Postgres lifecycle, npm/frontend
tooling, read-only context mount, git, resources, network) before real porting work begins.
All scratch work was done under `/tmp` and cleaned up afterward. The only workspace file
created is this one.

---

## 1. Toolchain — PASS

| Tool | Version | Expectation | Result |
|------|---------|-------------|--------|
| node | `v20.20.2` | v20.x | PASS |
| npm | `10.8.2` | present | PASS |
| git | `2.39.5` | present | PASS |
| python3 | `3.11.2` | present | PASS |
| make | `GNU Make 4.3` | present | PASS |
| g++ | `g++ (Debian 12.2.0-14+deb12u1) 12.2.0` | present | PASS |

Node is on the expected v20 line; a native build toolchain (make + g++ 12) is present,
so packages with native addons can compile if needed.

---

## 2. Postgres throwaway-cluster lifecycle — PASS

`initdb --version`: `initdb (PostgreSQL) 15.18 (Debian 15.18-0+deb12u1)`

Full unix-socket-only lifecycle run as the current (non-root) user:

| Step | Command | Exit | Result |
|------|---------|------|--------|
| init cluster | `initdb -D /tmp/pgtest` | 0 | PASS |
| start (socket only, port 55432) | `pg_ctl -D /tmp/pgtest -o "-k /tmp -p 55432 -c listen_addresses=''" start` | 0 | PASS |
| create db | `createdb -h /tmp -p 55432 testdb` | 0 | PASS |
| query | `psql -h /tmp -p 55432 -d testdb -c 'select version();'` | 0 | PASS |
| stop | `pg_ctl -D /tmp/pgtest stop` | 0 | PASS |

`select version()` returned:
`PostgreSQL 15.18 (Debian 15.18-0+deb12u1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 12.2.0-14+deb12u1) 12.2.0, 64-bit`

The complete cycle works. Cluster was stopped and `/tmp/pgtest` removed during cleanup.
Note: the server binds a **unix socket in `/tmp` only** (`listen_addresses=''`), so future
tasks that need a throwaway DB must connect via `-h /tmp -p 55432`, not TCP/localhost.

---

## 3. npm + frontend tooling (MUI / Vite / Cognito stack) — PASS

In `/tmp/npmtest`: `npm init -y` (exit 0), then
`npm install typescript vite @mui/material @emotion/react @emotion/styled amazon-cognito-identity-js`.

- **Result:** exit 0 — `added 123 packages, and audited 124 packages`, **0 vulnerabilities**.
- **Rough install time:** ~13 seconds (warm-ish registry; see network check).
- `npx tsc --version` (from that dir): **`Version 7.0.2`**

Resolved dependency versions (from the generated `package.json`):

| Package | Resolved |
|---------|----------|
| typescript | `^7.0.2` |
| vite | `^8.1.5` |
| @mui/material | `^9.2.0` |
| @emotion/react | `^11.14.0` |
| @emotion/styled | `^11.14.1` |
| amazon-cognito-identity-js | `^6.3.20` |

The admin stack's key dependencies install cleanly. **Heads-up for porting:** a bare
`npm install` resolves to the current latest majors — **TypeScript 7, Vite 8, MUI 9** —
which are newer than what the FileManager reference app pins. FileManager is a
Create-React-App / react-scripts project (see check 4), so future admin tasks should pin
versions deliberately (match FileManager's `package.json`, or intentionally adopt the newer
majors) rather than relying on floating latest. Scratch dir `/tmp/npmtest` was removed.

---

## 4. Context mount `/context/FileManager` — PASS (readable + read-only enforced)

`/context` contains a single mount: `FileManager` (read-only). Top-level layout (two levels deep):

```
FileManager/
├── .gitignore
├── README.md
├── TASKS.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── grunt-agent-guide/   (README.md, agent-runtime.md, endpoints.md, examples.md, posting-tasks.md, schemas.md)
├── public/              (index.html, favicon.ico, file-manager-icon.svg, logo192/512.png, manifest.json, robots.txt)
└── src/                 (api/, components/, contexts/, hooks/, lib/, pages/, theme/, types/, utils/, __mocks__/, App.tsx, index.tsx, ...)
```

### Exact paths future porting tasks should reference

| What | Exact path | Notes |
|------|-----------|-------|
| **Cognito client** | `/context/FileManager/src/lib/cognitoClient.ts` | The only file importing `amazon-cognito-identity-js`. Wraps `CognitoUserPool` and exposes `signUp`, `getIdToken`, etc. Reads `REACT_APP_COGNITO_USER_POOL_ID` / `REACT_APP_COGNITO_APP_CLIENT_ID` from env. |
| **Axios API client (request interceptor)** | `/context/FileManager/src/api/apiClient.ts` | `axios.create({ baseURL: REACT_APP_API_BASE_URL ?? 'http://localhost:3007' })`; a **request** interceptor attaches `Authorization: Bearer <idToken>` via `getIdToken()` from the cognito client. |
| **Axios response interceptor (401 refresh/logout)** | `/context/FileManager/src/api/setupInterceptors.ts` | `setupInterceptors(logout, navigate)` registers a **response** interceptor that on 401 attempts a one-time token refresh + retry, then forces logout/redirect to `/login`. Also exports `ejectInterceptor(id)`. |

Supporting: `src/components/InterceptorSetup.tsx` wires `setupInterceptors` into the React
tree; `src/contexts/AuthContext.tsx` consumes the cognito client. Other axios importers:
`src/api/fileService.ts`, `src/api/shareLinkService.ts`, `src/pages/RecycleBinPage.tsx`.

### Read-only enforcement — PASS (write correctly failed)

`touch /context/FileManager/.write-test` → exit 1,
`touch: cannot touch '/context/FileManager/.write-test': Read-only file system`.
The write **failed with a read-only-filesystem error, which is the expected PASS result.**
No stray file was created (nothing to delete).

---

## 5. Workspace git — PASS

- Current branch: `grunt-task-433` — matches the expected `grunt-task-*` pattern. PASS.
- `git status` runs cleanly. PASS.
- **Pre-existing note:** `README.md` already showed as modified at container start (present in
  the initial task snapshot, not introduced by this task). The diff is a no-op line-ending /
  trailing-newline artifact of the Windows-backed mount (`/workspace` is on `C:\`) — the three
  `# portfolio-v6-admin` lines are textually identical. **It was left untouched**; this task
  created only `agent-pre-checks.md`.

---

## 6. Resources — PASS

| Metric | Value |
|--------|-------|
| `df -h /` | overlay `1007G` total, `12G` used, `944G` avail (2%) |
| `df -h /workspace` | `C:\` (Windows mount) `465G` total, `101G` used, `365G` avail (22%) |
| Memory | `free` not installed; from `/proc/meminfo`: MemTotal ≈ **11.7 GiB** (`12249312 kB`), MemAvailable ≈ **10.7 GiB** (`11247608 kB`) |
| `nproc` | **8** CPUs |

Ample disk, ~11.7 GiB RAM, 8 cores — comfortable for builds, test runs, and a throwaway
Postgres cluster. (`free -m` is unavailable in this image; `/proc/meminfo` used instead.)

---

## 7. Network — PASS (registry) / AWS intentionally not tested

- `npm ping` → `PONG 328ms` against `https://registry.npmjs.org/`. Registry reachable. PASS.
- **AWS / Cognito was deliberately NOT contacted.** AWS is expected to be unreachable from
  this container, and future tasks **must not depend on live AWS/Cognito calls** — Cognito
  interactions should be mocked (FileManager already ships `src/__mocks__/amazon-cognito-identity-js.ts`).

---

## Implications for future tasks

- **Toolchain is ready:** Node v20.20.2, npm 10.8.2, git 2.39.5, python3 3.11.2, and a native
  build toolchain (make 4.3 + g++ 12) are all present. 8 cores / ~11.7 GiB RAM / hundreds of GB free.
- **The MUI/Vite/Cognito admin stack installs cleanly** (~13s, 0 vulns). But a bare install
  floats to latest majors — **TypeScript 7, Vite 8, MUI 9, cognito-identity-js 6** — which are
  newer than the FileManager CRA reference. **Pin versions deliberately** to avoid surprise
  major-version drift when porting.
- **Postgres works fully** via a per-task throwaway cluster, but **unix-socket only**: connect
  with `-h /tmp -p 55432` (no TCP/localhost binding). Server is PostgreSQL 15.18.
- **Port authentication/API wiring from these exact FileManager files:**
  - Cognito wrapper → `/context/FileManager/src/lib/cognitoClient.ts`
  - Axios client + request-auth interceptor → `/context/FileManager/src/api/apiClient.ts`
  - Axios 401 refresh/logout response interceptor → `/context/FileManager/src/api/setupInterceptors.ts`
  (`/context/FileManager` is strictly read-only — copy/adapt into `/workspace`, never edit in place.)
- **Do not depend on live AWS/Cognito.** It is unreachable by design; mock it (a ready mock
  exists at `src/__mocks__/amazon-cognito-identity-js.ts` in FileManager). npm registry is reachable.
- **`/workspace` is a Windows-backed mount**, so expect CRLF/line-ending artifacts (e.g. the
  pre-existing `README.md` diff). Consider `.gitattributes`/`core.autocrlf` handling if line
  endings matter for future commits.
