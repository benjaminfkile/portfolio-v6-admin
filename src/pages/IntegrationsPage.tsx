/**
 * Integrations (§4.7) — one card per integration, driven by the API's list.
 *
 * The card's `auth_kind` decides the control:
 *  - oauth (Spotify): the reconnect round-trip. Connect navigates this tab to the
 *    provider's consent page; the API's callback stores the new token and redirects
 *    back here with `?spotify=connected|error`, surfaced as a toast. Spotify expires
 *    refresh tokens 180 days after authorization and degrades SILENTLY, so this card
 *    also shows when the authorization expires, warns when it is close, and flags the
 *    untracked static-secret fallback.
 *  - api_key (GitHub): a pasted secret, entered in a password field, never prefilled.
 *  - value (Duolingo): a non-secret string, entered in a plain text field.
 *
 * Saved secrets/values are write-only (the API never echoes them), so a connected
 * credential shows "Connected · saved <date>" rather than the value.
 *
 * Per-card copy comes from the API's `name` + `auth_kind`; there are no per-integration
 * branches beyond kind rendering and the Spotify oauth specifics. Themed via MUI only (§14.4).
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
  TextField,
  Typography,
} from '@mui/material';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import PersonIcon from '@mui/icons-material/Person';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import {
  connectIntegration,
  disconnectIntegration,
  getIntegrations,
  saveIntegrationValue,
} from '../api/integrationsApi';
import type { Integration } from '../api/integrationsApi';
import { serverMessage } from '../api/serverMessage';
import { formatDate } from '../lib/media';
import ConfirmDialog from '../components/ConfirmDialog';

/** Below this many days remaining, the expiry line escalates to a warning. */
export const EXPIRY_WARNING_DAYS = 30;

function daysUntil(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

/** Helper text under a credential field — keyed by kind, not by integration. */
const HELPER_TEXT: Record<Integration['auth_kind'], string> = {
  oauth: '',
  api_key: 'Personal access token — public data only (read:user)',
  value: 'Duolingo username (public)',
};

interface CardProps {
  integration: Integration;
  /** Refetch the whole list after a mutation. */
  onReload: () => Promise<void>;
  onToast: (message: string) => void;
}

/**
 * The oauth card (Spotify): reconnect round-trip, expiry countdown/warnings, the
 * untracked-secret flag, and a confirmed disconnect. Preserves §4.6 behavior verbatim.
 */
function OAuthCard({ integration, onReload, onToast }: CardProps) {
  const [connecting, setConnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const { key, name, connected, source, authorized_at, expires_at } = integration;
  const days = expires_at ? daysUntil(expires_at) : null;
  const expired = days != null && days < 0;

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const returnTo = `${window.location.origin}/integrations`;
      const authorizeUrl = await connectIntegration(key, returnTo);
      // Leave the app: the provider's consent page, then back via the API callback.
      window.location.assign(authorizeUrl);
    } catch (err) {
      onToast(serverMessage(err, `Could not start the ${name} connection. Is the API reachable?`));
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectIntegration(key);
      setConfirmDisconnect(false);
      onToast(`${name} was disconnected.`);
      await onReload();
    } catch (err) {
      onToast(serverMessage(err, `Could not disconnect ${name}.`));
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 640 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
        <MusicNoteIcon color="action" />
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          {name}
        </Typography>
        {connected ? (
          <Chip
            size="small"
            color={expired ? 'error' : 'success'}
            label={expired ? 'Expired' : 'Connected'}
            data-testid={`${key}-status-chip`}
          />
        ) : (
          <Chip size="small" label="Not connected" data-testid={`${key}-status-chip`} />
        )}
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Powers the public site&apos;s now-playing section. When the authorization expires
        the section silently shows nothing playing — reconnecting fixes it.
      </Typography>

      {source === 'admin' && authorized_at && expires_at && (
        <Alert
          severity={expired ? 'error' : days != null && days < EXPIRY_WARNING_DAYS ? 'warning' : 'info'}
          sx={{ mb: 2 }}
          data-testid={`${key}-expiry`}
        >
          Authorized {formatDate(authorized_at)} — {' '}
          {expired
            ? `expired ${formatDate(expires_at)}. Reconnect now to bring now-playing back.`
            : `expires ${formatDate(expires_at)} (${days} day${days === 1 ? '' : 's'} left).`}
        </Alert>
      )}

      {source === 'secrets' && (
        <Alert severity="warning" sx={{ mb: 2 }} data-testid={`${key}-expiry`}>
          Using the static server-secret token, whose age is not tracked — it may expire
          without warning. Reconnect here once to switch to a managed token with a visible
          expiry date.
        </Alert>
      )}

      <Stack direction="row" spacing={1}>
        <Button variant="contained" onClick={() => void handleConnect()} disabled={connecting}>
          {connecting
            ? `Redirecting to ${name}…`
            : source === 'admin'
              ? `Reconnect ${name}`
              : `Connect ${name}`}
        </Button>
        {source === 'admin' && (
          <Button
            color="warning"
            startIcon={<LinkOffIcon />}
            onClick={() => setConfirmDisconnect(true)}
          >
            Disconnect
          </Button>
        )}
      </Stack>

      <ConfirmDialog
        open={confirmDisconnect}
        title={`Disconnect ${name}?`}
        message={
          `This removes the stored ${name} authorization. The now-playing section will ` +
          'show nothing playing until you reconnect.'
        }
        confirmLabel={disconnecting ? 'Disconnecting…' : 'Disconnect'}
        onConfirm={() => void handleDisconnect()}
        onClose={() => {
          if (!disconnecting) setConfirmDisconnect(false);
        }}
      />
    </Paper>
  );
}

/**
 * The api_key / value card (GitHub, Duolingo): a write-only credential field (password
 * for api_key, plain text for value), Save → PUT, and a confirmed disconnect. The stored
 * value is never displayed — a connected card shows "Connected · saved <date>" instead.
 */
function CredentialCard({ integration, onReload, onToast }: CardProps) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const { key, name, auth_kind, connected, authorized_at } = integration;
  const isSecret = auth_kind === 'api_key';

  const handleSave = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await saveIntegrationValue(key, draft);
      setDraft('');
      onToast(`${name} saved.`);
      await onReload();
    } catch (err) {
      onToast(serverMessage(err, `Could not save ${name}.`));
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectIntegration(key);
      setConfirmDisconnect(false);
      onToast(`${name} was disconnected.`);
      await onReload();
    } catch (err) {
      onToast(serverMessage(err, `Could not disconnect ${name}.`));
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 640 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
        {isSecret ? <VpnKeyIcon color="action" /> : <PersonIcon color="action" />}
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          {name}
        </Typography>
        <Chip
          size="small"
          color={connected ? 'success' : 'default'}
          label={connected ? 'Connected' : 'Not connected'}
          data-testid={`${key}-status-chip`}
        />
      </Stack>

      {connected && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }} data-testid={`${key}-saved`}>
          Connected{authorized_at ? ` · saved ${formatDate(authorized_at)}` : ''}
        </Typography>
      )}

      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <TextField
          type={isSecret ? 'password' : 'text'}
          size="small"
          fullWidth
          label={connected ? `Replace ${name}` : name}
          placeholder={isSecret ? '••••••••' : ''}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          helperText={HELPER_TEXT[auth_kind]}
          // Never prefilled and never echoing a stored secret.
          slotProps={{ htmlInput: { 'data-testid': `${key}-input`, autoComplete: 'off' } }}
        />
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button
          variant="contained"
          onClick={() => void handleSave()}
          disabled={saving || !draft.trim()}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {connected && (
          <Button
            color="warning"
            startIcon={<LinkOffIcon />}
            onClick={() => setConfirmDisconnect(true)}
          >
            Disconnect
          </Button>
        )}
      </Stack>

      <ConfirmDialog
        open={confirmDisconnect}
        title={`Disconnect ${name}?`}
        message={`This removes the stored ${name} credential. Save a new one to reconnect.`}
        confirmLabel={disconnecting ? 'Disconnecting…' : 'Disconnect'}
        onConfirm={() => void handleDisconnect()}
        onClose={() => {
          if (!disconnecting) setConfirmDisconnect(false);
        }}
      />
    </Paper>
  );
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState('');

  const [searchParams, setSearchParams] = useSearchParams();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setIntegrations(await getIntegrations());
    } catch (err) {
      setLoadError(serverMessage(err, 'Could not load the integrations. Is the API reachable?'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Returning from the OAuth round-trip: the API callback redirected back here with
  // ?spotify=connected|error. Toast it once, then strip the param.
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

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1">
          Integrations
        </Typography>
        <Typography variant="body2" color="text.secondary">
          External services the site depends on. OAuth authorizations (like Spotify&apos;s)
          expire periodically — reconnect here when the expiry approaches; paste API keys and
          public values for the rest.
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
        <Stack spacing={2}>
          {integrations.map((integration) =>
            integration.auth_kind === 'oauth' ? (
              <OAuthCard
                key={integration.key}
                integration={integration}
                onReload={load}
                onToast={setToast}
              />
            ) : (
              <CredentialCard
                key={integration.key}
                integration={integration}
                onReload={load}
                onToast={setToast}
              />
            ),
          )}
        </Stack>
      )}

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
