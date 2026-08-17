/**
 * Admin resumes API. The upload flow mirrors the media three-step direct-to-S3 dance
 * (§6.7): request a presigned PUT → PUT the bytes to S3 with the pinned headers → confirm.
 * The upload is PDF-only — the `Content-Type` pinned into the signature is
 * `application/pdf`, so the client validates the file MIME/extension before it even asks
 * for a URL.
 *
 * Two axios instances are in play, same as {@link ../api/mediaApi}: `apiClient` for the
 * authenticated gateway routes and a bare `s3Client` for the direct PUT (no auth
 * interceptor, no baseURL). Reusing the media module's `s3Client` keeps a single bare
 * axios in the app.
 */
import axios from 'axios';
import apiClient from './apiClient';
import { s3Client } from './mediaApi';
import type { ResumeUploadUrlResponse, ResumeVersion } from '../types/resumes';

interface Envelope<T> {
  status: 'ok' | 'error';
  error: boolean;
  data?: T;
  errorMsg?: string;
}

function unwrap<T>(resp: { data: Envelope<T> }): T {
  return resp.data.data as T;
}

/** Which step of the upload sequence failed, so the UI can point at the right cause. */
export type ResumeUploadStep = 'request' | 'upload' | 'confirm';

/** Typed upload failure carrying the failing step and (for the PUT) the HTTP status. */
export class ResumeUploadError extends Error {
  step: ResumeUploadStep;
  status?: number;
  constructor(step: ResumeUploadStep, message: string, status?: number) {
    super(message);
    this.name = 'ResumeUploadError';
    this.step = step;
    this.status = status;
  }
}

// ---- Reads -----------------------------------------------------------------

/**
 * GET /api/admin/resumes — every uploaded resume version. Returned newest-first by the
 * API; callers can rely on that ordering (and re-sort defensively if they need to).
 */
export async function getResumes(): Promise<ResumeVersion[]> {
  return unwrap<{ resumes: ResumeVersion[] }>(await apiClient.get('/api/admin/resumes')).resumes;
}

// ---- Upload ---------------------------------------------------------------

export interface ResumeUploadUrlRequest {
  filename: string;
  size: number;
}

/** Step 1 — POST /api/admin/resumes/upload-url. Inserts the row and returns the presigned PUT. */
export async function requestResumeUploadUrl(
  req: ResumeUploadUrlRequest,
): Promise<ResumeUploadUrlResponse> {
  try {
    return unwrap<ResumeUploadUrlResponse>(
      await apiClient.post('/api/admin/resumes/upload-url', req),
    );
  } catch (err) {
    throw toUploadError('request', err);
  }
}

/**
 * Step 2 — PUT the bytes straight to S3. `headers` is passed through verbatim from the
 * upload-url response so `Content-Type: application/pdf` (and any other pinned header)
 * stays byte-identical to the signature.
 */
export async function uploadResumeToS3(
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

/** Step 3 — POST /api/admin/resumes/:id/confirm. Verifies the object landed. */
export async function confirmResumeUpload(id: string): Promise<ResumeVersion> {
  try {
    return unwrap<ResumeVersion>(await apiClient.post(`/api/admin/resumes/${id}/confirm`, {}));
  } catch (err) {
    throw toUploadError('confirm', err);
  }
}

/**
 * Full upload sequence: request → PUT → confirm. Returns the confirmed row. Any step's
 * failure surfaces as a {@link ResumeUploadError} with the step and status. Non-PDFs are
 * rejected client-side before we even ask for a URL, mirroring the server's pinned
 * `Content-Type` and giving the user a synchronous rejection.
 */
export async function performResumeUpload(
  file: File,
  opts: { onProgress?: (percent: number) => void } = {},
): Promise<ResumeVersion> {
  if (!isPdfFile(file)) {
    throw new ResumeUploadError(
      'request',
      'Resume must be a PDF. Please choose a .pdf file.',
    );
  }
  const { id, upload_url, upload_headers } = await requestResumeUploadUrl({
    filename: file.name,
    size: file.size,
  });
  await uploadResumeToS3(upload_url, upload_headers, file, opts.onProgress);
  return confirmResumeUpload(id);
}

/** True when the browser reports a PDF MIME or the filename ends in `.pdf`. */
export function isPdfFile(file: File): boolean {
  if (file.type === 'application/pdf') return true;
  // Some browsers/OSes hand back an empty type — fall back to the extension.
  return /\.pdf$/i.test(file.name);
}

// ---- Delete ---------------------------------------------------------------

/** DELETE /api/admin/resumes/:id — remove the version and its S3 object. */
export async function deleteResume(id: string): Promise<void> {
  await apiClient.delete(`/api/admin/resumes/${id}`);
}

// ---- Error mapping --------------------------------------------------------

function toUploadError(step: ResumeUploadStep, err: unknown): ResumeUploadError {
  if (err instanceof ResumeUploadError) return err;
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (step === 'upload' && status === 403) {
      return new ResumeUploadError(
        'upload',
        'S3 rejected the upload (403). The pinned Content-Type header (application/pdf) ' +
          'must match the presigned signature byte-for-byte.',
        status,
      );
    }
    const apiMsg = (err.response?.data as Envelope<unknown> | undefined)?.errorMsg;
    return new ResumeUploadError(step, apiMsg ?? err.message, status);
  }
  return new ResumeUploadError(step, err instanceof Error ? err.message : 'Upload failed');
}
