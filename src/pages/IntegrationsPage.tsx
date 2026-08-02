/**
 * Integrations — the Spotify connection card (§4.6).
 *
 * Spotify expires refresh tokens 180 days after authorization (June 2026
 * policy), and the API degrades SILENTLY when that happens (now-playing just
 * shows idle, by design). This page is where that state becomes visible: it
 * shows when the current authorization expires, warns when it is close, and
 * carries the one-click reconnect. Connect navigates this tab to Spotify's
 * consent page; the API's callback stores the new token and redirects back
 * here with `?spotify=connected|error`, which surfaces as a toast.
 *
 * Themed via MUI only (§14.4).
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import { connectSpotify, disconnectSpotify, getSpotifyStatus } from '../api/spotifyApi';
import type { SpotifyStatus } from '../api/spotifyApi';
import { formatDate } from '../lib/media';
import ConfirmDialog from '../components/ConfirmDialog';

/** Below this many days remaining, the expiry line escalates to a warning. */
export const EXPIRY_WARNING_DAYS = 30;

function daysUntil(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export default function IntegrationsPage() {
  const [status, setStatus] = useState<SpotifyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [connecting, setConnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [toast, setToast] = useState('');

  const [searchParams, setSearchParams] = useSearchParams();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setStatus(await getSpotifyStatus());
    } catch {
      setLoadError('Could not load the Spotify status. Is the API reachable?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Returning from the OAuth round-trip: the API callback redirected back here
  // with ?spotify=connected|error. Toast it once, then strip the param.
  useEffect(() => {
    const result = searchParams.get('spotify');
    if (!result) return;
    setToast(
      result === 'connected'
        ? 'Spotify is connected. Now-playing is using the new authorization.'
        : 'Connecting Spotify failed — check the API logs and try again.',
    );
    const next = new URLSearchParams(searchParams);
    next.delete('spotify');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const returnTo = `${window.location.origin}/integrations`;
      const authorizeUrl = await connectSpotify(returnTo);
      // Leave the app: Spotify's consent page, then back via the API callback.
      window.location.assign(authorizeUrl);
    } catch {
      setToast('Could not start the Spotify connection. Is the API reachable?');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectSpotify();
      setConfirmDisconnect(false);
      setToast('Spotify was disconnected.');
      await load();
    } catch {
      setToast('Could not disconnect Spotify.');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  const days = status?.expires_at ? daysUntil(status.expires_at) : null;
  const expired = days != null && days < 0;

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1">
          Integrations
        </Typography>
        <Typography variant="body2" color="text.secondary">
          External services the site depends on. Spotify authorizations expire every 180
          days, so reconnect here when the expiry approaches.
        </Typography>
      </Box>

      {loadError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void load()}>
              Retry
            </Button>
          }
        >
          {loadError}
        </Alert>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, maxWidth: 640 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
            <MusicNoteIcon color="action" />
            <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
              Spotify
            </Typography>
            {status?.connected ? (
              <Chip
                size="small"
                color={expired ? 'error' : 'success'}
                label={expired ? 'Expired' : 'Connected'}
                data-testid="spotify-status-chip"
              />
            ) : (
              <Chip size="small" label="Not connected" data-testid="spotify-status-chip" />
            )}
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Powers the public site&apos;s now-playing section. When the authorization
            expires the section silently shows nothing playing — reconnecting fixes it.
          </Typography>

          {status?.source === 'admin' && status.authorized_at && status.expires_at && (
            <Alert
              severity={expired ? 'error' : days != null && days < EXPIRY_WARNING_DAYS ? 'warning' : 'info'}
              sx={{ mb: 2 }}
              data-testid="spotify-expiry"
            >
              Authorized {formatDate(status.authorized_at)} — {' '}
              {expired
                ? `expired ${formatDate(status.expires_at)}. Reconnect now to bring now-playing back.`
                : `expires ${formatDate(status.expires_at)} (${days} day${days === 1 ? '' : 's'} left).`}
            </Alert>
          )}

          {status?.source === 'secrets' && (
            <Alert severity="warning" sx={{ mb: 2 }} data-testid="spotify-expiry">
              Using the static server-secret token, whose age is not tracked — it may
              expire without warning. Reconnect here once to switch to a managed token
              with a visible expiry date.
            </Alert>
          )}

          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              onClick={() => void handleConnect()}
              disabled={connecting}
            >
              {connecting
                ? 'Redirecting to Spotify…'
                : status?.source === 'admin'
                  ? 'Reconnect Spotify'
                  : 'Connect Spotify'}
            </Button>
            {status?.source === 'admin' && (
              <Button
                color="warning"
                startIcon={<LinkOffIcon />}
                onClick={() => setConfirmDisconnect(true)}
              >
                Disconnect
              </Button>
            )}
          </Stack>
        </Paper>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect Spotify?"
        message={
          'This removes the stored Spotify authorization. The now-playing section will ' +
          'show nothing playing until you reconnect.'
        }
        confirmLabel={disconnecting ? 'Disconnecting…' : 'Disconnect'}
        onConfirm={() => void handleDisconnect()}
        onClose={() => {
          if (!disconnecting) setConfirmDisconnect(false);
        }}
      />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={6000}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
