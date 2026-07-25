/**
 * Preview iframe URL composition (§7). The admin cannot import the public site's renderers
 * across the three-repo boundary, so it embeds the *real* public site in an iframe and
 * hands it a short-lived preview token. The public bundle, seeing `?preview=`, fetches the
 * draft (`requireAdminOrPreviewToken()`, §4.2) and renders it through its normal component
 * tree — preview is the production renderer by construction.
 *
 * These two URL shapes are a hard contract the public site implements verbatim; keep them
 * exactly as written:
 *
 *   - page: `VITE_PUBLIC_SITE_URL + "/?preview=<token>"`
 *   - post: `VITE_PUBLIC_SITE_URL + "/blog/<slug>?preview=<token>&postId=<post id>"`
 *
 * The dynamic parts are percent-encoded so an odd slug or token can't break out of the URL;
 * for the normal `[a-z0-9-]` slug and opaque token this is a no-op, preserving the contract.
 */

/** `VITE_PUBLIC_SITE_URL` with any trailing slash trimmed so we never emit `//?preview=`. */
function siteBase(): string {
  return (import.meta.env.VITE_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '');
}

/** Page preview target: `<site>/?preview=<token>` (§7). */
export function pagePreviewUrl(token: string): string {
  return `${siteBase()}/?preview=${encodeURIComponent(token)}`;
}

/** Post preview target: `<site>/blog/<slug>?preview=<token>&postId=<id>` (§7). */
export function postPreviewUrl(slug: string, token: string, postId: string): string {
  return (
    `${siteBase()}/blog/${encodeURIComponent(slug)}` +
    `?preview=${encodeURIComponent(token)}&postId=${encodeURIComponent(postId)}`
  );
}
