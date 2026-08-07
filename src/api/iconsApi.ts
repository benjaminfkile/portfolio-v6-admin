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

/* ----------------------------------------------------------------------------------------
 * Simple Icons (Icons v1.6.1) — the tint-first catalog for dark-theme overrides.
 *
 * devicon ships NO light/white variants of its monochrome logos, so the dark-override flow
 * is a dead end exactly when it is needed (a black express glyph, a dark wordmark). Simple
 * Icons provides every major brand logo as a single-path SVG, and its CDN renders any icon
 * at any colour: `https://cdn.simpleicons.org/<slug>/<hex>` (hex WITHOUT '#'). Tinting to a
 * light ink is the real fix for dark, so it is first-class here — a mirror of the devicon
 * endpoints below, pinned + server-cached the same way.
 * -------------------------------------------------------------------------------------- */

/** One icon in the Simple Icons catalog (slimmed by the server to what the picker needs). */
export interface SimpleIcon {
  slug: string;
  title: string;
}

/** GET /api/admin/icons/simpleicons-manifest payload. `version` is the pinned release. */
export interface SimpleIconsManifest {
  version: string;
  icons: SimpleIcon[];
}

/** GET /api/admin/icons/simpleicons-manifest — the pinned, server-cached Simple Icons catalog. */
export async function getSimpleIconsManifest(): Promise<SimpleIconsManifest> {
  return unwrap<SimpleIconsManifest>(
    await apiClient.get('/api/admin/icons/simpleicons-manifest'),
  );
}

/**
 * POST /api/admin/icons/import (simpleicons body shape) — import a Simple Icons logo tinted
 * to `color` (a 3/6-digit hex WITHOUT '#'). The API validates the slug against the pinned
 * catalog and the colour by regex, fetches the tinted SVG from cdn.simpleicons.org, stores
 * it at `icons/simpleicons/<slug>-<color>.svg` in the media bucket, and returns the
 * media-CDN URL (idempotent: the deterministic key means a re-import returns the same URL).
 */
export async function importSimpleIcon(slug: string, color: string): Promise<string> {
  return unwrap<{ url: string }>(
    await apiClient.post('/api/admin/icons/import', { source: 'simpleicons', slug, color }),
  ).url;
}

/**
 * Build a cdn.simpleicons.org URL for a tinted logo — PREVIEW ONLY. The CDN serves current
 * artwork at any colour; the stored value is always the imported media-CDN URL, never this.
 * `color` is a hex WITHOUT '#'.
 */
export function simpleIconPreviewUrl(slug: string, color: string): string {
  return `https://cdn.simpleicons.org/${slug}/${color}`;
}

/** Case-insensitive search over the Simple Icons catalog by title and slug. */
export function searchSimpleIcons(icons: SimpleIcon[], query: string): SimpleIcon[] {
  const q = query.trim().toLowerCase();
  if (!q) return icons;
  return icons.filter(
    (icon) =>
      icon.title.toLowerCase().includes(q) || icon.slug.toLowerCase().includes(q),
  );
}

/** 3- or 6-digit hex, WITHOUT a leading '#'. Mirrors the API's colour validation. */
export const HEX_COLOR_RE = /^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

/** Whether `color` (hex without '#') is a valid 3/6-digit hex the import will accept. */
export function isValidHexColor(color: string): boolean {
  return HEX_COLOR_RE.test(color);
}

/**
 * Best-effort devicon name from a stored icon URL, used only to PRE-SEED the tint search
 * when opening the dark picker over an item that already has a devicon-imported light icon
 * ("same logo, tinted" in one click). Devicon imports live under `icons/devicon/<name>-<variant>…`;
 * we take the segment before the first '-' (devicon names rarely contain one). Returns null
 * for non-devicon URLs (custom/self-hosted/simpleicons) — there is simply nothing to seed.
 */
export function deviconNameFromUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const m = url.match(/\/icons\/devicon\/([^/?#]+)/);
  if (!m) return null;
  const file = m[1].replace(/\.svg$/i, '').replace(/@.*$/, '');
  const name = file.split('-')[0];
  return name || null;
}
