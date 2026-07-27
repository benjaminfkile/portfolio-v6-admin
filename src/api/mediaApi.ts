/**
 * Admin media API (§4.2, §6.7–6.9). Two axios instances are in play:
 *
 *  - `apiClient` — the authenticated gateway client. Carries `Authorization: Bearer` via
 *    its request interceptor and talks to `/api/admin/media/*`.
 *  - `s3Client` — a BARE axios instance with no interceptors. The presigned PUT goes
 *    **browser → S3 directly** (§6.7): it must NOT carry the admin bearer token, and its
 *    headers must be exactly the ones the API pinned into the signature. A dedicated
 *    instance guarantees the request interceptor never mutates that request.
 *
 * The upload is the three-step dance of §6.7: request a presigned URL, PUT the bytes to S3
 * with the pinned `x-amz-tagging`/`Content-Type`/`Cache-Control` headers byte-for-byte,
 * then confirm. A 403 on the PUT almost always means the tagging header didn't match the
 * signature (§6.7 gotcha) — {@link MediaUploadError} carries that hint.
 */
import axios from 'axios';
import apiClient from './apiClient';
import type { MediaAsset, SweepResult, UploadUrlResponse } from '../types/media';

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

/** Bare instance for the direct-to-S3 PUT — no auth interceptor, no baseURL (§6.7). */
export const s3Client = axios.create();

/** Which step of the §6.7 sequence failed, so the UI can point at the right cause. */
export type UploadStep = 'request' | 'upload' | 'confirm';

/** A typed upload failure carrying the failing step and (for the PUT) the HTTP status. */
export class MediaUploadError extends Error {
  step: UploadStep;
  status?: number;
  constructor(step: UploadStep, message: string, status?: number) {
    super(message);
    this.name = 'MediaUploadError';
    this.step = step;
    this.status = status;
  }
}

// ---- Reads -----------------------------------------------------------------

/** GET /api/admin/media — all assets, including orphan status and deletion timing (§4.2). */
export async function getMedia(): Promise<MediaAsset[]> {
  return unwrap<{ assets: MediaAsset[] }>(await apiClient.get('/api/admin/media')).assets;
}

// ---- Upload (§6.7) ---------------------------------------------------------

export interface UploadUrlRequest {
  filename: string;
  mime: string;
  size: number;
  /** Optional alt text stored on the row at creation; editable in the library later. */
  alt?: string;
}

/** Step 1 — POST /api/admin/media/upload-url. Inserts the row and returns the presigned PUT. */
export async function requestUploadUrl(req: UploadUrlRequest): Promise<UploadUrlResponse> {
  try {
    return unwrap<UploadUrlResponse>(await apiClient.post('/api/admin/media/upload-url', req));
  } catch (err) {
    throw toUploadError('request', err);
  }
}

/**
 * Step 2 — PUT the bytes straight to S3. `headers` is passed through verbatim from the
 * upload-url response so `x-amz-tagging` stays byte-identical to the signature (§6.7).
 */
export async function uploadToS3(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  try {
    await s3Client.put(url, file, {
      headers,
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      },
    });
  } catch (err) {
    throw toUploadError('upload', err);
  }
}

/** Step 3 — POST /api/admin/media/:id/confirm. Verifies the object landed, sets `confirmed_at`. */
export async function confirmUpload(id: string): Promise<MediaAsset> {
  try {
    return unwrap<MediaAsset>(await apiClient.post(`/api/admin/media/${id}/confirm`, {}));
  } catch (err) {
    throw toUploadError('confirm', err);
  }
}

/**
 * The full §6.7 sequence: request → tagged PUT → confirm. Returns the confirmed asset.
 * Any step's failure surfaces as a {@link MediaUploadError} with the step and status.
 */
export async function performUpload(
  file: File,
  opts: { alt?: string; onProgress?: (percent: number) => void } = {},
): Promise<MediaAsset> {
  const { id, upload_url, upload_headers } = await requestUploadUrl({
    filename: file.name,
    mime: file.type || 'application/octet-stream',
    size: file.size,
    alt: opts.alt,
  });
  await uploadToS3(upload_url, upload_headers, file, opts.onProgress);
  return confirmUpload(id);
}

// ---- Delete + sweep (§6.9) -------------------------------------------------

/** DELETE /api/admin/media/:id — remove the row and its S3 object (§4.2). */
export async function deleteMedia(id: string): Promise<void> {
  await apiClient.delete(`/api/admin/media/${id}`);
}

/** POST /api/admin/media/sweep — run the GC pass on demand (§6.9). */
export async function runSweep(): Promise<SweepResult> {
  return unwrap<SweepResult>(await apiClient.post('/api/admin/media/sweep', {}));
}

// ---- Error mapping ---------------------------------------------------------

function toUploadError(step: UploadStep, err: unknown): MediaUploadError {
  if (err instanceof MediaUploadError) return err;
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (step === 'upload' && status === 403) {
      return new MediaUploadError(
        'upload',
        'S3 rejected the upload (403). This almost always means the x-amz-tagging header ' +
          'did not match the value pinned into the presigned signature (§6.7).',
        status,
      );
    }
    const apiMsg = (err.response?.data as Envelope<unknown> | undefined)?.errorMsg;
    return new MediaUploadError(step, apiMsg ?? err.message, status);
  }
  return new MediaUploadError(step, err instanceof Error ? err.message : 'Upload failed');
}
