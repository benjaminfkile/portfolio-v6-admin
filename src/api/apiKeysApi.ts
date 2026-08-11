/**
 * Admin API-keys API (API Keys v1.16). Mints, lists, and revokes the programmatic-access keys
 * that grant a narrow slice of the API — posts, media upload, and the blogs list. Every
 * function unwraps the §4.3 response envelope ({status,error,data}) and returns just the
 * payload, following the blogsApi/pagesApi conventions.
 *
 * The mint response is special: `POST /api/admin/api-keys` returns the FULL secret in `key`
 * exactly ONCE — the list endpoint never contains it — so the UI shows it once behind an
 * explicit acknowledge and can never fetch it again.
 *
 * Revoke is idempotent server-side (revoking an already-revoked key still 200s); an unknown id
 * comes back as 404. There is no optimistic-concurrency precondition here — keys are never
 * edited in place, only minted and revoked.
 */
import apiClient from './apiClient';
import type { ApiKey, MintedApiKey } from '../types/admin';

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

/**
 * GET /api/admin/api-keys — all keys, newest first, never containing full secrets. Codes
 * defensively for either a bare array in `data` or a keyed `{ api_keys: [...] }` payload,
 * matching how the admin API list endpoints vary (see blogsApi/pagesApi).
 */
export async function getApiKeys(): Promise<ApiKey[]> {
  const data = unwrap<ApiKey[] | { api_keys: ApiKey[] }>(
    await apiClient.get('/api/admin/api-keys'),
  );
  return Array.isArray(data) ? data : (data?.api_keys ?? []);
}

/**
 * POST /api/admin/api-keys — mint a new key. The returned {@link MintedApiKey} carries the
 * full secret in `key`; this is the ONLY response that ever does, so the caller must surface
 * it immediately and store nothing itself.
 */
export async function createApiKey(name: string): Promise<MintedApiKey> {
  return unwrap<MintedApiKey>(await apiClient.post('/api/admin/api-keys', { name }));
}

/**
 * POST /api/admin/api-keys/:id/revoke — revoke a key. Idempotent (re-revoking still succeeds);
 * a 404 means the id is unknown. Applications using the key stop working immediately.
 */
export async function revokeApiKey(id: string): Promise<void> {
  await apiClient.post(`/api/admin/api-keys/${id}/revoke`);
}
