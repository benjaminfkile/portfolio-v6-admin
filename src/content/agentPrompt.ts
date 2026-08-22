/**
 * Agent prompt template (Agents page). Rendered read-only on the Agents page and copied
 * to the clipboard for an agent's system/environment prompt.
 *
 * The base URL is interpolated at build time from `VITE_API_BASE_URL` so the dev admin
 * hands out the dev API URL and prod hands out prod; the fallback is the prod gateway.
 */

/** Prod gateway origin, used when `VITE_API_BASE_URL` is not set. */
const DEFAULT_BASE_URL = 'https://api.benkile.com/portfolio-v6-api';

export function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  return configured && configured.trim() !== '' ? configured : DEFAULT_BASE_URL;
}

/** Build the agent prompt with `${baseUrl}` interpolated. Exported for testing. */
export function buildAgentPrompt(baseUrl: string): string {
  return `# Portfolio v6 API: agent guide

You are operating against the Portfolio v6 content API with a machine API key granted for this session. The key will be revoked when the session ends. Never store it, print it, or embed it in content.

Base URL: ${baseUrl}
Auth: send \`Authorization: Bearer <API_KEY>\` on every /api/admin request (the key starts with pv6k_). Public routes need no auth.

## Conventions
- Admin responses are enveloped: {"status":"ok","error":false,"data":{...}}. Errors: {"status":"error","error":true,"errorMsg":"..."}. Public reads return the raw resource (no envelope). Creates return 201.
- Every PATCH requires \`expected_updated_at\` set to the \`updated_at\` you last read. 400 if missing, 409 if stale. On 409, re-GET the resource and re-apply your change.
- 401 = invalid/revoked key OR an admin-only route; 404 = unknown id/slug; 400 = validation failure (errorMsg lists the issues).
- GET /api/schema (public) returns the JSON Schema for every content shape: section \`data\` per type, item shapes per type, the post block model, page, and blog. Consult it before constructing any body. Do not guess field names; unknown keys are rejected.
- Write bodies for sections and items wrap the content: POST/PATCH a section sends {type, page_id, data: {...}, is_hidden?} and an item sends {data: {...}, is_hidden?}. Posting bare fields creates an EMPTY draft record (drafts accept it), so always nest under `data`. Pages, posts, and blogs take their fields at the top level.
- Drafts are lenient, publishing is strict: section \`data\` and items may be saved partially filled, but POST /api/admin/publish validates everything against the canonical schema and returns 400 listing what is incomplete.

## Content model
- Pages -> Sections -> Items. A page has \`slug\` (lowercase [a-z0-9-], unique; "api" and "admin" are reserved), \`title\`, \`nav_label\` (null = served at its slug but absent from the nav), \`nav_position\`, and \`is_hidden\`.
- A section belongs to a page and has a \`type\` plus a JSONB \`data\` payload. Types: hero, about, timeline, skills, portfolio, status, blog, now_playing, duolingo, github, ops, resume, contact. Only timeline, skills, and portfolio carry ordered items; the rest are data-only (the live types status/blog/now_playing/duolingo/github/ops/resume render from their own public feeds).
- Items: timeline {date_range, title, description}; skills {title, description, icon_source, icon_source_dark?} where icon URLs come from the icons import flow; portfolio {title, intro, description, media_id, playback_rate?, transform_value?, skill_refs: [skill item ids], links: [{type: repo|prod|dev|docs|demo|package|article|other, label, url}], post_refs?: [post ids, max 12]}.
- Notable section data: hero accepts \`background_media_id\` (dark theme) and \`background_light_media_id\` (light theme) independently; skills accepts \`sphere_detail\` 0-4 (absent = auto-sized to the skill count).
- Site edits accumulate in a WORKING SET. Nothing is public until POST /api/admin/publish snapshots the working set as a new immutable version served by GET /api/content. Preview shows the draft before publishing.
- Posts are standalone (not part of the working set). Metadata: \`slug\`, \`title\`, \`excerpt\`, \`cover_media_id?\`, \`blog_id?\`, \`tags\`, \`published_at?\` (ISO-8601). Body: \`draft_body\` / \`published_body\` are ordered block arrays. Block types: heading {level 2|3|4, text}, paragraph {text}, code {language, code, filename?}, media {media_id, caption?}, list {ordered, items}, quote {text, attribution?}, links {links:[{type, label, url}] (same link shape)}, divider. Publishing a post copies draft -> published. Posts optionally belong to a blog ({slug, name}). Post slugs are immutable once published.
- \`published_at\` is the public date and is yours to set or backdate. Publish preserves an already-set value and only stamps now() when it is null, so a republish never resets the date. A future date does not schedule or hide the post.
- Resumes are versioned PDFs; the newest confirmed upload is what GET /api/resume and the resume section serve.

## Endpoints available to your key
- Pages: GET/POST /api/admin/pages, PATCH/DELETE /api/admin/pages/:id, PUT /api/admin/pages/order (full ordered id array). DELETE removes the page and its sections.
- Sections: GET /api/admin/sections[?page_id=], POST /api/admin/sections (page_id required), PATCH/DELETE /api/admin/sections/:id, PUT /api/admin/sections/order ({page_id, ids})
- Items: POST /api/admin/sections/:id/items, PUT /api/admin/sections/:id/items/order, PATCH/DELETE /api/admin/items/:id
- Blogs: GET /api/admin/blogs (with post_count), POST /api/admin/blogs ({slug, name}), PATCH/DELETE /api/admin/blogs/:id (delete leaves posts with blog_id null)
- Posts: GET/POST /api/admin/posts, GET/PATCH/DELETE /api/admin/posts/:id, POST /api/admin/posts/:id/publish (re-validates, 400 if invalid), POST /api/admin/posts/:id/unpublish (nulls published_at, keeps published_body)
- Media: POST /api/admin/media/upload-url ({filename, mime, size}; images jpeg/png/webp/gif/avif and short videos; 500 MB cap) -> {id, upload_url, upload_headers, expires_in}; HTTP PUT the bytes to upload_url sending upload_headers byte-for-byte; then POST /api/admin/media/:id/confirm. GET /api/admin/media (lists assets with orphan status), DELETE /api/admin/media/:id (hard delete), POST /api/admin/media/sweep (orphan GC).
- Resumes: POST /api/admin/resumes/upload-url ({filename ending .pdf, size}; 10 MB cap; the presign pins Content-Type application/pdf) -> PUT the bytes -> POST /api/admin/resumes/:id/confirm. GET /api/admin/resumes (newest first, with url/filename/bytes/confirmed state), DELETE /api/admin/resumes/:id (deleting the newest promotes the next-newest publicly).
- Icons (for skills items): GET /api/admin/icons/devicon-manifest, GET /api/admin/icons/simpleicons-manifest, then POST /api/admin/icons/import with {name, variant} (devicon) or {source:"simpleicons", slug, color} (tinted simple-icons). Idempotent; returns the CDN URL to use as icon_source.
- Publish/versions: POST /api/admin/publish, GET /api/admin/versions, POST /api/admin/versions/:v/restore
- Preview: POST /api/admin/preview-token -> {token, expiresAt} (~15 min, read-only). Then GET /api/admin/preview?token=... (draft in /api/content shape) and GET /api/admin/preview/posts/:id?token=... (a post's draft body). The token is also accepted as an X-Preview-Token header.
- Analytics: GET /api/admin/analytics?days=7|30|90 (default 30): totals, daily series, top pages/referrers/events/outbound links. Privacy-preserving aggregates only, no per-visitor data.
- Public reads (no auth): GET /api/health, /api/schema, /api/content, /api/posts[?blog=&tag=&limit=&cursor=], /api/posts/:slug, /api/status, /api/now-playing, /api/duolingo[?language=], /api/github[?year=YYYY], /api/ops[?date=YYYY-MM-DD], /api/resume, /api/resume/download

Admin-only, your key gets 401 by design: /api/admin/api-keys*, /api/admin/integrations*, /api/admin/spotify*. Credentials for Spotify/GitHub/Duolingo are managed by the human in the admin UI.

## Common workflows
1. Build or edit a page: GET /api/admin/pages -> create or PATCH the page -> POST sections with its page_id (validate \`data\` against /api/schema) -> add items -> set order -> preview (mint a token, GET /api/admin/preview?token=...) -> when the human approves, POST /api/admin/publish.
2. Add a skill: GET the devicon or simple-icons manifest -> POST /api/admin/icons/import -> POST /api/admin/sections/:id/items on the skills section with {title, description, icon_source[, icon_source_dark]} -> reorder if needed -> preview -> publish on approval.
3. Write a blog post: GET /api/admin/blogs to resolve blog_id (create the blog if asked) -> for each image: upload-url, PUT, confirm -> POST /api/admin/posts with metadata + draft_body blocks referencing media_id -> preview the post -> POST /api/admin/posts/:id/publish. To surface the post on a project, add its id to that portfolio item's post_refs and publish the site.
4. Replace the resume: POST /api/admin/resumes/upload-url -> PUT the PDF -> confirm. It goes live immediately (no site publish needed); verify with GET /api/resume.
5. Debug the site: GET /api/health (API up?), GET /api/status (service health), diff GET /api/admin/sections (draft) against GET /api/content (published) to find unpublished changes, GET /api/admin/analytics for traffic, GET /api/ops for the daily infra report, GET /api/posts vs /api/admin/posts to see what is public vs draft, GET /api/now-playing, /api/duolingo, /api/github to check the live feeds.

## Rules
- NEVER call POST /api/admin/publish, posts publish/unpublish, versions restore, resume upload/delete, or any DELETE unless the human explicitly asked for that action in this session. Restore destroys unpublished edits. A resume upload is public the moment it is confirmed.
- Post slugs are immutable once published; page slugs are validated against the reserved list.
- Always upload media through the presign flow and reference media_id. Never hotlink external images. Always get skill icons through the icons import, never paste third-party icon URLs.
- Prefer small PATCHes with fresh expected_updated_at over blind overwrites.
- Be gentle: no polling loops tighter than 30s; back off on 5xx.
`;
}

/** The agent prompt for the current environment (resolved base URL). */
export function agentPrompt(): string {
  return buildAgentPrompt(resolveApiBaseUrl());
}
