/**
 * Preview-token API (§7, §4.2). `POST /api/admin/preview-token` mints an opaque,
 * single-purpose token that expires in 15 minutes and grants read-only access to draft
 * content on exactly the two preview-serialization routes — nothing else. It's safe to put
 * in an iframe URL because that is all it can do (§7).
 *
 * The token expires quickly by design, so the UI re-mints on demand (see PreviewFrame):
 * every call here returns a fresh token.
 */
import apiClient from './apiClient';

/** The §4.3 success envelope. Errors come back as non-2xx and are thrown by axios. */
interface Envelope<T> {
  status: 'ok' | 'error';
  error: boolean;
  data?: T;
  errorMsg?: string;
}

function unwrap<T>(resp: { data: Envelope<T> }): T {
  return resp.data.data as T;
}

/** Minted preview token. `expires_at` is informational — the token is opaque (§7). */
export interface PreviewToken {
  token: string;
  expires_at?: string;
}

/** POST /api/admin/preview-token — mint a fresh 15-min read-only preview token (§7). */
export async function mintPreviewToken(): Promise<PreviewToken> {
  return unwrap<PreviewToken>(await apiClient.post('/api/admin/preview-token', {}));
}
