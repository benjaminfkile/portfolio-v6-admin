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
  disconnectIntegration,
  getIntegrations,
  getSpotifyStatus,
  removeSpotifyListener,
  saveIntegrationValue,
  saveSpotifyListener,
} from '../api/integrationsApi';
import type {
  CredentialIntegration,
  Integration,
  SpotifyListener,
  SpotifyStatus,
} from '../api/integrationsApi';
import { serverMessage } from '../api/serverMessage';
import { formatDate } from '../lib/media';
import ConfirmDialog from '../components/ConfirmDialog';
import ApiKeysSection from '../components/apiKeys/ApiKeysSection';

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

/** Helper text under a credential field — keyed by kind, not by integration. */
const HELPER_TEXT: Record<'api_key' | 'value', string> = {
  api_key: 'Personal access token — public data only (read:user)',
  value: 'Duolingo username (public)',
};

/**
 * Source badge — which now-playing source is authoritative right now. Now-playing
 * is listener-only, so `listener` reads green ("live") and `none` reads neutral
 * ("offline").
 */
const SOURCE_BADGE: Record<
  'listener' | 'none',
  { color: 'default' | 'success'; label: string }
> = {
  listener: { color: 'success', label: 'Live (listener)' },
  none: { color: 'default', label: 'Offline' },
};

/** Human label per listener state (task 125). Unknown tags fall back to the raw tag. */
const LISTENER_STATE_LABEL: Record<string, string> = {
  idle: 'Idle',
  connecting: 'Connecting',
  connected: 'Connected',
  backoff: 'Backing off',
  credential_dead: 'Session cookie expired, replace it below',
  no_credential: 'No credential',
  unknown: 'Unknown',
};

interface SpotifyCardProps {
  status: SpotifyStatus;
  onReload: () => Promise<void>;
}

/**
 * The Spotify card — listener-only. Now-playing is driven entirely by the
 * connect-listener (a Spotify web session `sp_dc` cookie the admin pastes); the
 * card shows which source is live and the listener's health, and manages the
 * cookie credential. There is no polling, no OAuth reconnect, and no kill switch.
 */
function SpotifyCard({ status, onReload }: SpotifyCardProps) {
  const { source, listener } = status;
  const sourceBadge =
    source === 'listener' || source === 'none' ? SOURCE_BADGE[source] : null;

  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 640 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
        <MusicNoteIcon color="action" />
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          Spotify
        </Typography>
        {sourceBadge && (
          <Chip
            size="small"
            color={sourceBadge.color}
            label={sourceBadge.label}
            data-testid="spotify-source-badge"
          />
        )}
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Powers the public site&apos;s now-playing section over an event-driven
        Spotify web session — no polling.
      </Typography>

      <ListenerSection listener={listener} onReload={onReload} />
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

      <ListenerHealthRow listener={listener} />

      {present ? (
        <Stack spacing={1} sx={{ mb: 2 }}>
          <Typography variant="body2" data-testid="spotify-listener-stored">
            Credential stored.
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

/**
 * Human-readable label for a listener state tag. Known tags use the LISTENER_STATE_LABEL
 * table; anything else (an API build that added a tag we do not know yet) falls back to
 * the raw underscored tag with spaces so the row still renders instead of crashing.
 */
function formatListenerState(state: string): string {
  return LISTENER_STATE_LABEL[state] ?? state.replace(/_/g, ' ');
}

interface ListenerHealthRowProps {
  listener: SpotifyListener;
}

/**
 * Health readout for the event-driven listener (task 125). Renders the current
 * listener state as a human label, the last event as a relative time, and the
 * last error kind when one is present. `credential_dead` is escalated to a
 * warning Alert that points the admin at the cookie replacement control below,
 * since that is the only remediation for a rejected sp_dc cookie.
 */
function ListenerHealthRow({ listener }: ListenerHealthRowProps) {
  const rawState = listener.state ?? 'unknown';
  const label = formatListenerState(rawState);
  const lastEvent = listener.last_event_at ?? null;
  const errorKind = listener.error_kind ?? null;

  if (rawState === 'credential_dead') {
    return (
      <Alert severity="warning" sx={{ mb: 2 }} data-testid="spotify-listener-health">
        Session cookie expired, replace it below.
        {lastEvent ? ` Last event ${formatRelative(lastEvent)}.` : ''}
        {errorKind ? ` Error: ${errorKind}.` : ''}
      </Alert>
    );
  }

  return (
    <Stack spacing={0.5} sx={{ mb: 2 }} data-testid="spotify-listener-health">
      <Typography variant="body2" color="text.secondary">
        State: {label}
        {lastEvent ? ` · last event ${formatRelative(lastEvent)}` : ''}
      </Typography>
      {errorKind && (
        <Typography variant="caption" color="error" data-testid="spotify-listener-error-kind">
          Error: {errorKind}
        </Typography>
      )}
    </Stack>
  );
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
  const [spotify, setSpotify] = useState<SpotifyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [list, spotifyStatus] = await Promise.all([
        getIntegrations(),
        getSpotifyStatus(),
      ]);
      setIntegrations(list);
      setSpotify(spotifyStatus);
    } catch (err) {
      setLoadError(serverMessage(err, 'Could not load the integrations. Is the API reachable?'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
          External services the site depends on. Spotify now-playing runs on an
          event-driven web session (paste the sp_dc cookie); paste API keys and
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
          {spotify && <SpotifyCard status={spotify} onReload={load} />}
          {integrations.map((integration) => (
            <CredentialCard
              key={integration.key}
              integration={integration}
              onReload={load}
              onToast={setToast}
            />
          ))}
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
