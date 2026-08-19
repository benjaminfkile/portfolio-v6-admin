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
 * Spotify carries a richer, runtime-truthful status contract (§4.7 overhaul): a
 * `state` machine plus timestamps for the last success/failure and any active rate
 * limit. The card renders those directly rather than inferring "connected" from the
 * mere presence of a credential. Spotify also exposes dedicated disconnect/disable/
 * enable endpoints; the DELETE-based `disconnectIntegration` remains for the other
 * credential kinds.
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

/**
 * The five runtime states Spotify can be in. Derived by the API from live probe
 * results (§4.7 overhaul), NOT from the presence of a credential — the previous
 * "any token present = Connected" shortcut lied for days when the token was dead.
 *
 *  - `connected`     — last probe succeeded; now-playing works.
 *  - `auth_broken`   — refresh failed (revoked/expired grant); user must reconnect.
 *  - `rate_limited`  — Spotify is throttling; back off until `rate_limited_until`.
 *  - `disconnected`  — no stored grant.
 *  - `disabled`      — admin flipped the kill switch; API will not call Spotify.
 */
export type SpotifyState =
  | 'connected'
  | 'auth_broken'
  | 'rate_limited'
  | 'disconnected'
  | 'disabled';

/** Structured last-error payload the API attaches to non-`connected` Spotify states. */
export interface SpotifyLastError {
  /** Short machine tag, e.g. `refresh_failed`, `rate_limited`, `http_5xx`. */
  kind: string;
  /** ISO timestamp of when the error was observed. */
  at: string;
}

/**
 * Spotify's integration shape — the state-machine contract from the §4.7 overhaul.
 * `authorized_at`/`expires_at` describe the underlying OAuth grant (Spotify refresh
 * tokens live 180 days); the card renders them as an expiry countdown independent
 * of `state`, since a grant can be present in most states.
 */
export interface SpotifyIntegration {
  key: 'spotify';
  name: string;
  auth_kind: 'oauth';
  state: SpotifyState;
  last_success_at: string | null;
  last_error: SpotifyLastError | null;
  rate_limited_until: string | null;
  authorized_at: string | null;
  expires_at: string | null;
}

/**
 * GitHub / Duolingo — the classic paste-a-credential contract. `source` is `admin`
 * whenever a credential was stored through this page (and `null` when nothing is
 * stored); the API no longer surfaces static-secret fallbacks here.
 */
export interface CredentialIntegration {
  key: 'github' | 'duolingo';
  name: string;
  auth_kind: 'api_key' | 'value';
  connected: boolean;
  source: 'admin' | null;
  authorized_at: string | null;
}

export type Integration = SpotifyIntegration | CredentialIntegration;

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

/**
 * DELETE /api/admin/integrations/:key — drop the admin-stored credential. Used by
 * the GitHub / Duolingo cards; Spotify has its own dedicated disconnect endpoint
 * (see {@link disconnectSpotify}).
 */
export async function disconnectIntegration(key: string): Promise<void> {
  await apiClient.delete(`/api/admin/integrations/${key}`);
}

/**
 * POST /api/admin/spotify/disconnect — remove the stored Spotify grant. Leaves the
 * integration in `disconnected` state (unless it was `disabled`, in which case it
 * stays disabled with no grant).
 */
export async function disconnectSpotify(): Promise<void> {
  await apiClient.post('/api/admin/spotify/disconnect');
}

/**
 * POST /api/admin/spotify/disable — kill switch. The API stops calling Spotify
 * until an admin re-enables; the stored grant is left intact.
 */
export async function disableSpotify(): Promise<void> {
  await apiClient.post('/api/admin/spotify/disable');
}

/** POST /api/admin/spotify/enable — clear the kill switch. */
export async function enableSpotify(): Promise<void> {
  await apiClient.post('/api/admin/spotify/enable');
}
