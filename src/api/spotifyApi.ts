/**
 * Spotify reconnect API (§4.6). Spotify expires refresh tokens 180 days after
 * authorization (June 2026 policy), so reconnecting is a twice-a-year admin
 * routine: `connectSpotify` asks the API for a Spotify authorize URL (with a
 * single-use state minted server-side), the browser navigates there, approves,
 * and Spotify redirects back to the API's callback — which stores the new token
 * and lands the browser back on `return_to` with `?spotify=connected|error`.
 * No token or secret ever passes through this client.
 */
import apiClient from './apiClient';

interface Envelope<T> {
  status: 'ok' | 'error';
  error: boolean;
  data?: T;
  errorMsg?: string;
}

function unwrap<T>(resp: { data: Envelope<T> }): T {
  return resp.data.data as T;
}

export interface SpotifyStatus {
  connected: boolean;
  /** "admin" = stored via the reconnect flow; "secrets" = static server secret. */
  source: 'admin' | 'secrets' | null;
  /** ISO dates; known only for admin-connected tokens. */
  authorized_at: string | null;
  expires_at: string | null;
}

/** GET /api/admin/spotify/status — connection state and the 180-day expiry. */
export async function getSpotifyStatus(): Promise<SpotifyStatus> {
  return unwrap<SpotifyStatus>(await apiClient.get('/api/admin/spotify/status'));
}

/**
 * POST /api/admin/spotify/connect — mint the state and return the Spotify
 * authorize URL to navigate to. `returnTo` is where the callback sends the
 * browser afterwards (it rides in the server-side state, never in a URL).
 */
export async function connectSpotify(returnTo: string): Promise<string> {
  const data = unwrap<{ authorize_url: string }>(
    await apiClient.post('/api/admin/spotify/connect', { return_to: returnTo }),
  );
  return data.authorize_url;
}

/** DELETE /api/admin/spotify — drop the admin-stored token. */
export async function disconnectSpotify(): Promise<void> {
  await apiClient.delete('/api/admin/spotify');
}
