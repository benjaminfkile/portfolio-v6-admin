/**
 * Media library types (§6.7–6.9, §3.2 `media_assets`). The admin never stores an absolute
 * URL — the DB keeps `s3_key` only and URLs are resolved at read time (§6.8). The admin
 * media list resolves a CDN `url` for thumbnails; everything else mirrors the DB row.
 */

/** One `media_assets` row as returned by `GET /api/admin/media` (§4.2). */
export interface MediaAsset {
  id: string;
  /** `media/{uuid}/{filename}` — the only location reference stored (§6.4, §6.8). */
  s3_key: string;
  /** CDN-resolved absolute URL for thumbnails, resolved by the API at read time (§6.8). */
  url?: string;
  mime: string;
  bytes: number;
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
  alt?: string | null;
  /** null until the upload is verified by the confirm step (§6.7 step 4). */
  confirmed_at: string | null;
  /** Set by GC when the asset is orphaned; scheduled for S3 expiry 7 days later (§6.9). */
  unreferenced_at: string | null;
  created_at: string;
}

/**
 * `POST /api/admin/media/upload-url` response (§6.7 step 2). The API returns the presigned
 * PUT `url` plus the exact `headers` it pinned into the signature — the client MUST send
 * them back byte-for-byte on the PUT or S3 answers 403 (§6.7 gotcha). Returning the headers
 * from the API rather than hard-coding them client-side is what keeps `x-amz-tagging`
 * byte-identical to the signature no matter what the API chose.
 */
export interface UploadUrlResponse {
  /** The `media_assets` row id inserted with `confirmed_at = null`. */
  id: string;
  /** The S3 object key (`media/{uuid}/{filename}`). */
  s3_key: string;
  /** Presigned S3 PUT URL, 15-min TTL. */
  upload_url: string;
  /** Headers to send verbatim on the PUT — includes `x-amz-tagging`, `Content-Type`, `Cache-Control`. */
  upload_headers: Record<string, string>;
  /** Seconds until the presigned URL expires. */
  expires_in: number;
}

/** `POST /api/admin/media/sweep` response — a summary of what the GC pass did (§6.9). */
export interface SweepResult {
  /** Assets newly tagged orphaned this pass. */
  orphaned: number;
  /** Previously-orphaned assets rescued because they were re-referenced. */
  rescued: number;
  /** Rows deleted because their S3 object had already expired. */
  deleted: number;
}
