/**
 * Admin icons API (Icons v1.6). Two endpoints back the skills item editor's devicon picker:
 *
 *  - GET  /api/admin/icons/devicon-manifest — the devicon manifest (devicon.json), fetched
 *    server-side against a PINNED devicon release and cached in memory (~24h). Used to search
 *    and to enumerate each icon's available svg variants.
 *  - POST /api/admin/icons/import — given a `{ name, variant }` from the manifest, the API
 *    downloads the pinned SVG from jsDelivr, stores it in the site's media S3 bucket under the
 *    dedicated `icons/` prefix, and returns the media-CDN `{ url }` for it. Idempotent.
 *
 * Both ride {@link apiClient} (the authenticated gateway client) and unwrap the §4.3 envelope.
 *
 * PREVIEW URLs are built client-side from the manifest `version` + jsDelivr — see
 * {@link deviconPreviewUrl}. Those are for the picker's on-screen preview only; the value
 * actually stored in `icon_source` is always the media-CDN URL returned by the import call
 * (or a manually entered URL via the escape hatch).
 */
import apiClient from './apiClient';

/** The §4.3 success envelope. Errors come back non-2xx and are thrown by axios. */
interface Envelope<T> {
  status: 'ok' | 'error';
  error: boolean;
  data?: T;
  errorMsg?: string;
}

function unwrap<T>(resp: { data: Envelope<T> }): T {
  return resp.data.data as T;
}

/** One icon in the devicon manifest (devicon.json entry). */
export interface DeviconIcon {
  name: string;
  altnames: string[];
  tags: string[];
  /** Available svg variants: original, plain, line, original-wordmark, plain-wordmark, … */
  versions: string[];
  color: string;
}

/** GET /api/admin/icons/devicon-manifest payload. `version` is the pinned devicon release. */
export interface DeviconManifest {
  version: string;
  icons: DeviconIcon[];
}

/** GET /api/admin/icons/devicon-manifest — the pinned, server-cached devicon manifest. */
export async function getDeviconManifest(): Promise<DeviconManifest> {
  return unwrap<DeviconManifest>(await apiClient.get('/api/admin/icons/devicon-manifest'));
}

/**
 * POST /api/admin/icons/import — import a manifest icon+variant. The API validates the pair
 * against the manifest, downloads the pinned SVG, stores it under `icons/` in the media
 * bucket, and returns the media-CDN URL (idempotent: existing key → returns the same URL).
 */
export async function importIcon(name: string, variant: string): Promise<string> {
  return unwrap<{ url: string }>(
    await apiClient.post('/api/admin/icons/import', { name, variant }),
  ).url;
}

/**
 * Build a jsDelivr URL for a devicon variant — PREVIEW ONLY. The stored value is the imported
 * media-CDN URL, never this. `version` comes from the manifest so it stays pinned in lockstep
 * with what the server will actually import.
 */
export function deviconPreviewUrl(version: string, name: string, variant: string): string {
  return `https://cdn.jsdelivr.net/gh/devicons/devicon@${version}/icons/${name}/${name}-${variant}.svg`;
}

/**
 * Case-insensitive search over the manifest by name, altnames, and tags. An empty query
 * returns every icon (so the grid shows something before the user types).
 */
export function searchIcons(icons: DeviconIcon[], query: string): DeviconIcon[] {
  const q = query.trim().toLowerCase();
  if (!q) return icons;
  return icons.filter((icon) => {
    if (icon.name.toLowerCase().includes(q)) return true;
    if (icon.altnames.some((alt) => alt.toLowerCase().includes(q))) return true;
    if (icon.tags.some((tag) => tag.toLowerCase().includes(q))) return true;
    return false;
  });
}
