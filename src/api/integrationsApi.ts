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
 * Which now-playing feed is currently answering — the event-driven listener, the
 * polling fallback, or nothing at all. Extended by task 125 alongside the listener
 * health block; older API builds may omit it, so the card treats it as optional.
 */
export type SpotifySource = 'listener' | 'polling' | 'none';

/**
 * Listener state machine (task 125). `credential_dead` is the "sp_dc cookie has
 * been rejected by Spotify" state, which the card surfaces as a call to action
 * pointing at the cookie replacement control. The union is open on purpose: an
 * API build that returns a tag this client does not yet know must degrade to a
 * neutral label rather than crash.
 */
export type SpotifyListenerState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'backoff'
  | 'credential_dead'
  | 'no_credential'
  | 'unknown';

/**
 * The event-driven "listener" side of the Spotify integration (task 124/125). It is
 * driven by a Spotify web session cookie (`sp_dc`) the admin pastes; the API stores
 * it write-only and never echoes it back. Task 125 extends the block with a full
 * health readout: `state` reports the listener's runtime health, `last_event_at`
 * is the last event the listener received, and `error_kind` is a short machine tag
 * describing the last failure when there is one. All health fields are optional so
 * an older API build without them still deserializes cleanly.
 */
export interface SpotifyListener {
  credential_present: boolean;
  state?: SpotifyListenerState | string;
  last_event_at?: string | null;
  error_kind?: string | null;
}

/**
 * Spotify's daily API-call budget (task 125). `used`/`cap` are counts of Web API
 * calls the runtime has made against Spotify today; `resets_at` is when the counter
 * rolls over. The card renders a plain read below 80 percent and escalates to a
 * warning treatment above that. Older API builds may omit or null the block; the
 * card hides the row in that case.
 */
export interface SpotifyBudget {
  used: number;
  cap: number;
  resets_at: string;
}

/**
 * Spotify's integration shape, the state-machine contract from the §4.7 overhaul.
 * `authorized_at`/`expires_at` describe the underlying OAuth grant (Spotify refresh
 * tokens live 180 days); the card renders them as an expiry countdown independent
 * of `state`, since a grant can be present in most states. `listener` carries the
 * separate sp_dc-cookie credential the event-driven now-playing path uses; it is
 * optional so older API builds without the field still deserialize cleanly.
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
  source?: SpotifySource | string;
  listener?: SpotifyListener;
  budget?: SpotifyBudget | null;
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

/**
 * PUT /api/admin/integrations/spotify/listener, store the admin's Spotify web
 * session cookie (`sp_dc`) as the credential the event-driven listener uses. The
 * value is write-only, the API never echoes it back, and callers should not log it.
 * Returns 204, callers refetch status to reflect the save.
 */
export async function saveSpotifyListener(spDc: string): Promise<void> {
  await apiClient.put('/api/admin/integrations/spotify/listener', { sp_dc: spDc });
}

/**
 * DELETE /api/admin/integrations/spotify/listener, remove the stored listener
 * credential. The listener stops until a new `sp_dc` is saved.
 */
export async function removeSpotifyListener(): Promise<void> {
  await apiClient.delete('/api/admin/integrations/spotify/listener');
}
