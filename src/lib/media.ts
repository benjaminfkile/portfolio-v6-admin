/**
 * Media presentation helpers (§6.4, §6.8, §6.9). Pure functions with no MUI/JSX so they
 * can be imported by components and unit-tested directly.
 */
import type { MediaAsset } from '../types/media';

/**
 * `Cache-Control` every media object is written with (§6.4). The API pins this into the
 * presigned PUT signature; this constant documents the expected value for reference and
 * tests. The authoritative value on any given upload is whatever the API returns.
 */
export const MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** The pending-upload object tag value (§6.7 step 3, §6.9). */
export const PENDING_TAGGING = 'state=pending';

/** S3 expires an orphaned object 7 days after it is tagged `state=orphaned` (§6.9). */
export const ORPHAN_GRACE_DAYS = 7;

/**
 * Absolute URL for an asset's thumbnail. Prefers the CDN `url` the API resolved at read
 * time (§6.8); falls back to `VITE_CDN_URL` + `s3_key` when the list did not resolve one,
 * and finally to the bare key so metadata still renders even without a configured CDN.
 */
export function mediaUrl(asset: Pick<MediaAsset, 'url' | 's3_key'>): string {
  if (asset.url) return asset.url;
  const base = import.meta.env.VITE_CDN_URL;
  if (base) return `${base.replace(/\/+$/, '')}/${asset.s3_key}`;
  return asset.s3_key;
}

/** True when GC has tagged the asset orphaned and it is counting down to deletion (§6.9). */
export function isOrphaned(asset: Pick<MediaAsset, 'unreferenced_at'>): boolean {
  return Boolean(asset.unreferenced_at);
}

/**
 * Scheduled S3 deletion date for an orphaned asset — `unreferenced_at` + 7 days (§6.9).
 * Returns null for referenced assets (nothing scheduled). S3 lifecycle evaluation is
 * asynchronous (~daily), so this is the earliest date, not a hard guarantee (§6.9 caveat).
 */
export function scheduledDeletionDate(asset: Pick<MediaAsset, 'unreferenced_at'>): Date | null {
  if (!asset.unreferenced_at) return null;
  const d = new Date(asset.unreferenced_at);
  d.setDate(d.getDate() + ORPHAN_GRACE_DAYS);
  return d;
}

/** Human-readable byte size, e.g. `1.4 MB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || Number.isInteger(value) ? 0 : 1)} ${units[unit]}`;
}

/** Short local date for display, e.g. `Jul 25, 2026`. */
export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** True when the asset is an image (drives whether we render an `<img>` thumbnail). */
export function isImage(asset: Pick<MediaAsset, 'mime'>): boolean {
  return asset.mime.startsWith('image/');
}

/** True when the asset is a video. */
export function isVideo(asset: Pick<MediaAsset, 'mime'>): boolean {
  return asset.mime.startsWith('video/');
}
