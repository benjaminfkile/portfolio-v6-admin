/**
 * Admin integrations API (§4.7). One list endpoint drives the Integrations page;
 * each integration declares its `auth_kind` so the UI renders the right control:
 *
 *  - `oauth`   — a redirect round-trip (Spotify): `connectIntegration` mints a
 *                server-side state and returns an authorize URL to navigate to;
 *                the API's callback stores the token and lands the browser back on
 *                `return_to`. No token or secret ever passes through this client.
 *  - `api_key` — a secret the admin pastes (a GitHub PAT); saved via `saveIntegrationValue`.
 *  - `value`   — a non-secret string (a Duolingo username); same save path.
 *
 * PUT never echoes the stored value back, so the page treats a saved credential as
 * write-only: it shows "connected + when" but never the value itself.
 *
 * Every function unwraps the §4.3 response envelope ({status,error,data}) and
 * returns just the payload, following the versionsApi/pagesApi conventions.
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

/** Which control the card renders — see the module note. */
export type AuthKind = 'oauth' | 'api_key' | 'value';

export type IntegrationKey = 'spotify' | 'github' | 'duolingo';

export interface Integration {
  key: IntegrationKey;
  /** Human name for the card heading, e.g. "Spotify" — supplied by the API. */
  name: string;
  auth_kind: AuthKind;
  connected: boolean;
  /**
   * "admin" = stored via this page; "secrets" = static server secret (age untracked);
   * null when not connected.
   */
  source: 'admin' | 'secrets' | null;
  /** ISO dates; known only for admin-connected credentials. */
  authorized_at: string | null;
  /** ISO expiry; only oauth credentials carry one. */
  expires_at: string | null;
}

/** GET /api/admin/integrations — every integration with its current state. */
export async function getIntegrations(): Promise<Integration[]> {
  const data = unwrap<{ integrations: Integration[] }>(
    await apiClient.get('/api/admin/integrations'),
  );
  return data?.integrations ?? [];
}

/**
 * PUT /api/admin/integrations/:key/value — store a pasted secret/value. Returns
 * 200 and never echoes the value, so callers refetch status to reflect the save.
 */
export async function saveIntegrationValue(key: string, value: string): Promise<void> {
  await apiClient.put(`/api/admin/integrations/${key}/value`, { value });
}

/**
 * POST /api/admin/integrations/:key/connect — oauth kinds only. Mints the state and
 * returns the authorize URL to navigate to; `returnTo` is where the callback sends
 * the browser afterwards (it rides in the server-side state, never in a URL).
 */
export async function connectIntegration(key: string, returnTo: string): Promise<string> {
  const data = unwrap<{ authorize_url: string }>(
    await apiClient.post(`/api/admin/integrations/${key}/connect`, { return_to: returnTo }),
  );
  return data.authorize_url;
}

/** DELETE /api/admin/integrations/:key — drop the admin-stored credential. */
export async function disconnectIntegration(key: string): Promise<void> {
  await apiClient.delete(`/api/admin/integrations/${key}`);
}
