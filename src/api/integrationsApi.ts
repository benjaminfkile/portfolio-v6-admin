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

export type IntegrationKey = 'github' | 'duolingo';

/**
 * Which now-playing source is authoritative. Now-playing is listener-only, so
 * this is `listener` when the dealer socket is live and `none` otherwise.
 */
export type SpotifySource = 'listener' | 'none';

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
 * The listener-only Spotify status contract (GET /api/admin/spotify/status).
 * Now-playing is driven entirely by the connect-listener; `source` is
 * `listener` when it is live, else `none`, and `listener` carries its health.
 */
export interface SpotifyStatus {
  source: SpotifySource;
  listener: SpotifyListener;
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

export type Integration = CredentialIntegration;

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
 * DELETE /api/admin/integrations/:key — drop the admin-stored credential. Used by
 * the GitHub / Duolingo cards.
 */
export async function disconnectIntegration(key: string): Promise<void> {
  await apiClient.delete(`/api/admin/integrations/${key}`);
}

/**
 * GET /api/admin/spotify/status — the listener-only status contract (which source
 * is authoritative + the connect-listener's health).
 */
export async function getSpotifyStatus(): Promise<SpotifyStatus> {
  return unwrap<SpotifyStatus>(await apiClient.get('/api/admin/spotify/status'));
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
