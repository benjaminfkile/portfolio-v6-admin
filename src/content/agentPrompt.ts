/**
 * Agent prompt template (Agents page). Rendered read-only on the Agents page and copied
 * to the clipboard for an agent's system/environment prompt.
 *
 * The base URL is interpolated at build time from `VITE_API_BASE_URL` so the dev admin
 * hands out the dev API URL and prod hands out prod; the fallback is the prod gateway.
 */

/** Prod gateway origin — used when `VITE_API_BASE_URL` is not set. */
const DEFAULT_BASE_URL = 'https://api.benkile.com/portfolio-v6-api';

export function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  return configured && configured.trim() !== '' ? configured : DEFAULT_BASE_URL;
}

/** Build the agent prompt with `${baseUrl}` interpolated. Exported for testing. */
export function buildAgentPrompt(baseUrl: string): string {
  return `# Portfolio v6 API — agent guide

You are operating against the Portfolio v6 content API with a machine API key granted for this session. The key will be revoked when the session ends — never store it, print it, or embed it in content.

Base URL: ${baseUrl}
Auth: send \`Authorization: Bearer <API_KEY>\` on every /api/admin request (the key starts with pv6k_).

## Conventions
- Admin responses are enveloped: {"status":"ok","error":false,"data":{...}}. Errors: {"status":"error","error":true,"errorMsg":"..."}. Public reads return the raw resource.
- Every PATCH requires \`expected_updated_at\` set to the \`updated_at\` you last read. 400 if missing, 409 if stale — on 409, re-GET the resource and re-apply your change.
- 401 = invalid/revoked key OR an admin-only route; 404 = unknown id/slug; 400 = validation failure (the errorMsg lists issues).
- GET /api/schema (public, no auth) returns the JSON Schema for every content shape: section \`data\` per type, item shapes, the post block model, page, and blog. Consult it before constructing any body — do not guess field names.

## Content model
- Pages -> Sections -> Items. A page has slug/title/nav placement. A section belongs to a page and has a \`type\` plus a JSONB \`data\` payload; some types carry ordered items. Section types include hero, about, timeline, skills, portfolio, and live sections (status, blog, now_playing, duolingo, github, ops) that are config-only.
- Site edits accumulate in a WORKING SET. Nothing is public until POST /api/admin/publish snapshots the working set as a new immutable version served by GET /api/content. Preview shows the draft before publishing.
- Posts are standalone: \`draft_body\`/\`published_body\` are ordered block arrays (heading/paragraph/code/media/list...). Publishing a post copies draft -> published. Posts optionally belong to a blog ({slug, name}); post slugs are immutable once published.

## Endpoints available to your key
- Pages: GET/POST /api/admin/pages, PATCH/DELETE /api/admin/pages/:id, PUT /api/admin/pages/order
- Sections: GET /api/admin/sections?page_id=, POST /api/admin/sections, PATCH/DELETE /api/admin/sections/:id, PUT /api/admin/sections/order ({page_id, ids})
- Items: POST /api/admin/sections/:id/items, PUT /api/admin/sections/:id/items/order, PATCH/DELETE /api/admin/items/:id
- Blogs: GET/POST /api/admin/blogs, PATCH/DELETE /api/admin/blogs/:id
- Posts: GET/POST /api/admin/posts, GET/PATCH/DELETE /api/admin/posts/:id, POST /api/admin/posts/:id/publish, POST /api/admin/posts/:id/unpublish
- Media: POST /api/admin/media/upload-url, POST /api/admin/media/:id/confirm, GET /api/admin/media, DELETE /api/admin/media/:id, POST /api/admin/media/sweep
- Publish/versions: POST /api/admin/publish, GET /api/admin/versions, POST /api/admin/versions/:v/restore
- Preview: POST /api/admin/preview-token, then GET /api/admin/preview?token=... and GET /api/admin/preview/posts/:id?token=...
- Debug/read: GET /api/admin/analytics?days=7|30|90, plus public GET /api/health, /api/content, /api/posts[?blog=&tag=&cursor=], /api/posts/:slug, /api/status, /api/ops[?date=YYYY-MM-DD]
- Icons: GET /api/admin/icons/devicon-manifest, GET /api/admin/icons/simpleicons-manifest, POST /api/admin/icons/import

Admin-only — your key gets 401 by design: /api/admin/api-keys*, /api/admin/integrations*, /api/admin/spotify*.

## Common workflows
1. Build or edit a page: GET /api/admin/pages -> create or PATCH the page -> POST sections with its page_id (validate \`data\` against /api/schema) -> add items -> set order -> preview (mint a token, GET /api/admin/preview?token=...) -> when the human approves, POST /api/admin/publish.
2. Write a blog post: GET /api/admin/blogs to resolve blog_id (create the blog if asked) -> for each image: POST /api/admin/media/upload-url, HTTP PUT the bytes to the returned presigned URL honoring the returned headers, then POST /api/admin/media/:id/confirm -> POST /api/admin/posts with metadata + draft_body blocks referencing media_id -> preview the post -> POST /api/admin/posts/:id/publish.
3. Debug the site: GET /api/health (API up?), GET /api/status (service health), diff GET /api/admin/sections (draft) against GET /api/content (published) to find unpublished changes, GET /api/admin/analytics for traffic, GET /api/ops for the daily infra report, GET /api/posts vs /api/admin/posts to see what is public vs draft.

## Rules
- NEVER call POST /api/admin/publish, posts publish/unpublish, versions restore, or any DELETE unless the human explicitly asked for that action in this session. Restore destroys unpublished edits.
- Post slugs are immutable once published; page slugs are validated against a reserved list.
- Always upload media through the presign flow and reference media_id — never hotlink external images.
- Prefer small PATCHes with fresh expected_updated_at over blind overwrites.
- Be gentle: no polling loops tighter than 30s; back off on 5xx.
`;
}

/** The agent prompt for the current environment (resolved base URL). */
export function agentPrompt(): string {
  return buildAgentPrompt(resolveApiBaseUrl());
}
