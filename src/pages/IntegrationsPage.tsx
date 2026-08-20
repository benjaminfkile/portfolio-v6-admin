/**
 * Integrations (§4.7) — one card per integration, driven by the API's list.
 *
 * The card's `auth_kind` decides the control:
 *  - oauth (Spotify): a runtime-truthful state machine (§4.7 overhaul). The card
 *    surfaces the API's `state` verbatim — it never infers "Connected" from the
 *    mere presence of a credential; that shortcut lied for days when the token was
 *    dead and the service suspended. Connect navigates this tab to Spotify's
 *    consent page; the API's callback stores the new token and redirects back here
 *    with `?spotify=connected|error`, surfaced as a toast. Spotify refresh tokens
 *    expire 180 days after authorization, so the grant block also renders the
 *    countdown and warns inside 14 days. Disconnect drops the grant; Disable is a
 *    kill switch (the API stops calling Spotify entirely until re-enabled).
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
  Divider,
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
import BlockIcon from '@mui/icons-material/Block';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import {
  connectIntegration,
  disableSpotify,
  disconnectIntegration,
  disconnectSpotify,
  enableSpotify,
  getIntegrations,
  removeSpotifyListener,
  saveIntegrationValue,
  saveSpotifyListener,
} from '../api/integrationsApi';
import type {
  CredentialIntegration,
  Integration,
  SpotifyIntegration,
  SpotifyListener,
  SpotifyState,
} from '../api/integrationsApi';
import { serverMessage } from '../api/serverMessage';
import { formatDate } from '../lib/media';
import ConfirmDialog from '../components/ConfirmDialog';
import ApiKeysSection from '../components/apiKeys/ApiKeysSection';

/** Below this many days remaining, the grant expiry line escalates to a warning (§4.7 overhaul). */
export const GRANT_EXPIRY_WARNING_DAYS = 14;

function daysUntil(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

/**
 * Coarse "N units ago / from now" — good enough for status detail lines where the
 * exact second doesn't matter. Skips seconds under a minute (just "moments ago")
 * so refetch jitter doesn't visibly wiggle the label.
 */
function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diffMs);
  const suffix = diffMs >= 0 ? 'ago' : 'from now';
  const minutes = Math.floor(abs / 60000);
  if (minutes < 1) return `moments ${suffix}`;
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ${suffix}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ${suffix}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ${suffix}`;
}

/** Short local date+time for `rate_limited_until` — a wall-clock the admin can read. */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Helper text under a credential field — keyed by kind, not by integration. */
const HELPER_TEXT: Record<'api_key' | 'value', string> = {
  api_key: 'Personal access token — public data only (read:user)',
  value: 'Duolingo username (public)',
};

/** Chip color per Spotify state, per the §4.7 overhaul palette. */
const STATE_CHIP: Record<SpotifyState, { color: 'default' | 'success' | 'error' | 'warning'; label: string }> = {
  connected: { color: 'success', label: 'Connected' },
  auth_broken: { color: 'error', label: 'Authorization broken' },
  rate_limited: { color: 'warning', label: 'Rate limited' },
  disconnected: { color: 'default', label: 'Not connected' },
  disabled: { color: 'default', label: 'Disabled' },
};

interface OAuthCardProps {
  integration: SpotifyIntegration;
  onReload: () => Promise<void>;
  onToast: (message: string) => void;
}

/**
 * The Spotify card: renders the API's state verbatim, surfaces the underlying
 * grant's 180-day expiry countdown, and exposes Connect/Reconnect + Disconnect +
 * Disable/Enable. Buttons show/enable per state (e.g. Disconnect hidden when the
 * state is already `disconnected` or `disabled`; Reconnect hidden when disabled).
 */
function OAuthCard({ integration, onReload, onToast }: OAuthCardProps) {
  const [connecting, setConnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [toggling, setToggling] = useState(false);

  const {
    key,
    name,
    state,
    last_success_at,
    last_error,
    rate_limited_until,
    authorized_at,
    expires_at,
    listener,
  } = integration;

  const chip = STATE_CHIP[state];
  const daysLeft = expires_at ? daysUntil(expires_at) : null;
  const expired = daysLeft != null && daysLeft < 0;
  const expiryWarning =
    daysLeft != null && daysLeft >= 0 && daysLeft < GRANT_EXPIRY_WARNING_DAYS;

  const canReconnect = state !== 'disabled';
  const canDisconnect = state !== 'disconnected' && state !== 'disabled';
  const connectLabel = state === 'disconnected' ? `Connect ${name}` : `Reconnect ${name}`;

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
      await disconnectSpotify();
      setConfirmDisconnect(false);
      onToast(`${name} was disconnected.`);
      await onReload();
    } catch (err) {
      onToast(serverMessage(err, `Could not disconnect ${name}.`));
    } finally {
      setDisconnecting(false);
    }
  };

  const handleDisable = async () => {
    setToggling(true);
    try {
      await disableSpotify();
      setConfirmDisable(false);
      onToast(`${name} was disabled.`);
      await onReload();
    } catch (err) {
      onToast(serverMessage(err, `Could not disable ${name}.`));
    } finally {
      setToggling(false);
    }
  };

  const handleEnable = async () => {
    setToggling(true);
    try {
      await enableSpotify();
      onToast(`${name} was enabled.`);
      await onReload();
    } catch (err) {
      onToast(serverMessage(err, `Could not enable ${name}.`));
    } finally {
      setToggling(false);
    }
  };

  const stateDetail = renderStateDetail(state, last_success_at, last_error, rate_limited_until);

  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 640 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
        <MusicNoteIcon color="action" />
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          {name}
        </Typography>
        <Chip
          size="small"
          color={chip.color}
          label={chip.label}
          data-testid={`${key}-status-chip`}
        />
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Powers the public site&apos;s now-playing section. Reconnect when the authorization
        expires or breaks; disable to stop the API from calling Spotify at all.
      </Typography>

      <Typography
        variant="body2"
        sx={{
          mb: 2,
          color: state === 'disabled' ? 'text.disabled' : 'text.primary',
        }}
        data-testid={`${key}-state-detail`}
      >
        {stateDetail}
      </Typography>

      {authorized_at && expires_at && (
        <Alert
          severity={expired ? 'error' : expiryWarning ? 'warning' : 'info'}
          sx={{ mb: 2 }}
          data-testid={`${key}-expiry`}
        >
          Authorized {formatDate(authorized_at)} —{' '}
          {expired
            ? `expired ${formatDate(expires_at)}. Reconnect to restore access.`
            : `expires ${formatDate(expires_at)} (${daysLeft} day${daysLeft === 1 ? '' : 's'} left).`}
        </Alert>
      )}

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
        {canReconnect && (
          <Button
            variant="contained"
            onClick={() => void handleConnect()}
            disabled={connecting}
          >
            {connecting ? `Redirecting to ${name}…` : connectLabel}
          </Button>
        )}
        {canDisconnect && (
          <Button
            color="warning"
            startIcon={<LinkOffIcon />}
            onClick={() => setConfirmDisconnect(true)}
            disabled={disconnecting}
          >
            Disconnect
          </Button>
        )}
        {state === 'disabled' ? (
          <Button
            color="primary"
            startIcon={<PlayArrowIcon />}
            onClick={() => void handleEnable()}
            disabled={toggling}
          >
            {toggling ? 'Enabling…' : 'Enable'}
          </Button>
        ) : (
          <Button
            color="inherit"
            startIcon={<BlockIcon />}
            onClick={() => setConfirmDisable(true)}
            disabled={toggling}
          >
            Disable
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

      <ConfirmDialog
        open={confirmDisable}
        title={`Disable ${name}?`}
        message={
          `The API will stop calling ${name} until you re-enable it. The stored ` +
          'authorization is kept, so Enable brings it back without reconnecting.'
        }
        confirmLabel={toggling ? 'Disabling…' : 'Disable'}
        onConfirm={() => void handleDisable()}
        onClose={() => {
          if (!toggling) setConfirmDisable(false);
        }}
      />

      {listener && (
        <>
          <Divider sx={{ my: 3 }} />
          <ListenerSection listener={listener} onReload={onReload} />
        </>
      )}
    </Paper>
  );
}

interface ListenerSectionProps {
  listener: SpotifyListener;
  onReload: () => Promise<void>;
}

/**
 * The event-driven listener credential (task 124/125). The sp_dc cookie is a
 * Spotify web session credential the API uses for a push-based now-playing feed;
 * it is write-only end to end (never returned, never logged). Absent mode paints
 * an explainer + a masked paste field + Connect; present mode paints a stored
 * row plus Replace and Remove, with Remove confirmed. Errors on either mutation
 * surface inline right next to the control that raised them, never as toasts,
 * so the admin can see them without leaving the section.
 */
function ListenerSection({ listener, onReload }: ListenerSectionProps) {
  const present = listener.credential_present;
  const [replacing, setReplacing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');

  const showInput = !present || replacing;
  const canSubmit = draft.trim().length > 0 && !saving && !removing;

  const handleSave = async () => {
    const value = draft.trim();
    if (!value) return;
    setSaving(true);
    setSaveError('');
    try {
      await saveSpotifyListener(value);
      setDraft('');
      setReplacing(false);
      await onReload();
    } catch (err) {
      setSaveError(
        serverMessage(err, 'Could not save the listener credential. Is the API reachable?'),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    setRemoveError('');
    try {
      await removeSpotifyListener();
      setConfirmRemove(false);
      setDraft('');
      setReplacing(false);
      await onReload();
    } catch (err) {
      setRemoveError(serverMessage(err, 'Could not remove the listener credential.'));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Box data-testid="spotify-listener">
      <Typography variant="subtitle1" component="h3" sx={{ mb: 1 }}>
        Listener
      </Typography>

      {present ? (
        <Stack spacing={1} sx={{ mb: 2 }}>
          <Typography variant="body2" data-testid="spotify-listener-stored">
            Credential stored
            {listener.state ? ` · ${formatListenerState(listener.state)}` : ''}
          </Typography>
          {!replacing && (
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  setSaveError('');
                  setReplacing(true);
                }}
                disabled={removing}
              >
                Replace
              </Button>
              <Button
                color="warning"
                size="small"
                startIcon={<LinkOffIcon />}
                onClick={() => {
                  setRemoveError('');
                  setConfirmRemove(true);
                }}
                disabled={removing}
              >
                Remove
              </Button>
            </Stack>
          )}
          {removeError && (
            <Alert severity="error" data-testid="spotify-listener-remove-error">
              {removeError}
            </Alert>
          )}
        </Stack>
      ) : (
        <Stack spacing={1} sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Event-driven now-playing via your Spotify web session. Paste the sp_dc cookie from
            open.spotify.com.
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            How to find it: open.spotify.com while logged in, DevTools, Application, Cookies,
            copy sp_dc.
          </Typography>
        </Stack>
      )}

      {showInput && (
        <Stack spacing={1}>
          <TextField
            type="password"
            size="small"
            fullWidth
            label="sp_dc cookie"
            placeholder="••••••••"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={saving || removing}
            slotProps={{
              htmlInput: {
                'data-testid': 'spotify-listener-input',
                autoComplete: 'off',
                spellCheck: false,
                'aria-label': 'sp_dc cookie',
              },
            }}
          />
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              onClick={() => void handleSave()}
              disabled={!canSubmit}
            >
              {saving ? 'Saving…' : present ? 'Save' : 'Connect'}
            </Button>
            {replacing && (
              <Button
                onClick={() => {
                  setReplacing(false);
                  setDraft('');
                  setSaveError('');
                }}
                disabled={saving}
              >
                Cancel
              </Button>
            )}
          </Stack>
          {saveError && (
            <Alert severity="error" data-testid="spotify-listener-save-error">
              {saveError}
            </Alert>
          )}
        </Stack>
      )}

      <ConfirmDialog
        open={confirmRemove}
        title="Remove listener credential?"
        message={
          'This deletes the stored sp_dc cookie. The event-driven now-playing feed will ' +
          'stop until you paste a new one.'
        }
        confirmLabel={removing ? 'Removing…' : 'Remove'}
        onConfirm={() => void handleRemove()}
        onClose={() => {
          if (!removing) setConfirmRemove(false);
        }}
      />
    </Box>
  );
}

/** Human-readable label for a listener state tag, e.g. `never_run` → "never run". */
function formatListenerState(state: string): string {
  return state.replace(/_/g, ' ');
}

/** State-specific detail line — the human-readable read of `state` + timestamps. */
function renderStateDetail(
  state: SpotifyState,
  lastSuccessAt: string | null,
  lastError: SpotifyIntegration['last_error'],
  rateLimitedUntil: string | null,
): string {
  switch (state) {
    case 'connected':
      return lastSuccessAt
        ? `Last successful fetch ${formatRelative(lastSuccessAt)}.`
        : 'Connected.';
    case 'auth_broken':
      return lastError
        ? `Authorization broken — reconnect. Last error ${formatRelative(lastError.at)}.`
        : 'Authorization broken — reconnect.';
    case 'rate_limited':
      return rateLimitedUntil
        ? `Rate limited until ${formatDateTime(rateLimitedUntil)}.`
        : 'Rate limited.';
    case 'disconnected':
      return 'Not connected.';
    case 'disabled':
      return 'Disabled by admin.';
  }
}

interface CredentialCardProps {
  integration: CredentialIntegration;
  onReload: () => Promise<void>;
  onToast: (message: string) => void;
}

/**
 * The api_key / value card (GitHub, Duolingo): a write-only credential field (password
 * for api_key, plain text for value), Save → PUT, and a confirmed disconnect. The stored
 * value is never displayed — a connected card shows "Connected · saved <date>" instead.
 */
function CredentialCard({ integration, onReload, onToast }: CredentialCardProps) {
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

      <ApiKeysSection />

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
