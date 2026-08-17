/**
 * Resume version types. Mirrors the `resumes` API surface: each row is one uploaded PDF,
 * newest confirmed row is what the public site serves. Follows the media three-step
 * upload dance (§6.7) — request presigned URL → PUT to S3 → confirm — but PDF-only.
 */

/** One `resumes` row as returned by `GET /api/admin/resumes`. */
export interface ResumeVersion {
  id: string;
  /** Original filename as uploaded, kept for display and per-version downloads. */
  filename: string;
  /** `resumes/{uuid}/{filename}` — the storage key on S3. */
  s3_key: string;
  /** CDN-resolved absolute URL for opening/downloading the PDF, resolved by the API. */
  url?: string;
  bytes: number;
  /** null until the confirm step verifies the object landed. */
  confirmed_at: string | null;
  created_at: string;
}

/**
 * `POST /api/admin/resumes/upload-url` response. Follows the same shape as the media
 * upload-url response — the API pins the presigned PUT headers into the signature and the
 * client must send them back verbatim on the PUT.
 */
export interface ResumeUploadUrlResponse {
  id: string;
  s3_key: string;
  upload_url: string;
  upload_headers: Record<string, string>;
  expires_in: number;
}
