/**
 * API keys section (API Keys v1.16) — a self-contained block reused by the Integrations and
 * Agents pages. Mints, lists, and revokes the programmatic-access keys.
 *
 * Scope is spelled out for the admin: a key grants access to the full content-editing surface
 * (pages, sections, items, blogs, posts, media, publish, versions, preview, analytics). Key
 * management and integration credentials stay admin-only — a key gets 401 on those routes.
 * Minting reveals the full secret exactly once (see {@link MintKeyDialog}); the list only ever
 * shows the 12-char prefix.
 *
 * Revoked keys render dimmed with a "revoked" chip and no actions. Revoking an active key is
 * gated behind a ConfirmDialog that warns applications using it stop working immediately, then
 * refetches. Themed via MUI only (§14.4).
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { ApiKey, MintedApiKey } from '../../types/admin';
import { createApiKey, getApiKeys, revokeApiKey } from '../../api/apiKeysApi';
import { serverMessage } from '../../api/serverMessage';
import { formatDate } from '../../lib/media';
import ConfirmDialog from '../ConfirmDialog';
import MintKeyDialog from './MintKeyDialog';

export default function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [minting, setMinting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [minted, setMinted] = useState<MintedApiKey | null>(null);

  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [toast, setToast] = useState('');

  const refetch = useCallback(async () => {
    setKeys(await getApiKeys());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      await refetch();
    } catch (err) {
      setLoadError(serverMessage(err, 'Could not load the API keys. Is the API reachable?'));
    } finally {
      setLoading(false);
    }
  }, [refetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (name: string) => {
    setSaving(true);
    setFormError('');
    try {
      const key = await createApiKey(name);
      // Switch the dialog to its show-once phase; do NOT close it — the secret shows once.
      setMinted(key);
      await refetch();
    } catch (err) {
      setFormError(serverMessage(err, 'Could not create the key. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  // The explicit "I saved the key" acknowledge — the only way to leave the show-once phase.
  const handleAcknowledge = () => {
    setMinting(false);
    setMinted(null);
    setToast('API key created.');
  };

  const handleRevoke = async () => {
    if (!revoking) return;
    setRevokeBusy(true);
    try {
      await revokeApiKey(revoking.id);
      setRevoking(null);
      await refetch();
      setToast('API key revoked.');
    } catch (err) {
      setRevoking(null);
      setToast(serverMessage(err, 'Could not revoke the key.'));
    } finally {
      setRevokeBusy(false);
    }
  };

  return (
    <Box component="section" sx={{ mt: 6 }}>
      <Stack
        direction="row"
        sx={{ mb: 2, alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Box>
          <Typography variant="h5" component="h2">
            API keys
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 640 }}>
            Keys grant programmatic access to the full content-editing surface — pages,
            sections, items, blogs, posts, media, publish, versions, preview, and analytics.
            Key management and integration credentials stay admin-only.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setFormError('');
            setMinted(null);
            setMinting(true);
          }}
        >
          Create key
        </Button>
      </Stack>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && loadError && (
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
      )}

      {!loading && !loadError && keys.length === 0 && (
        <Alert severity="info">
          No API keys yet. Create one to give a script or app programmatic access.
        </Alert>
      )}

      {!loading && !loadError && keys.length > 0 && (
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Prefix</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Last used</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {keys.map((key) => {
                const revoked = key.revoked_at != null;
                return (
                  <TableRow
                    key={key.id}
                    data-testid={`key-row-${key.id}`}
                    sx={revoked ? { opacity: 0.5 } : undefined}
                  >
                    <TableCell>{key.name}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{key.key_prefix}</TableCell>
                    <TableCell>{formatDate(key.created_at)}</TableCell>
                    <TableCell>
                      {key.last_used_at ? formatDate(key.last_used_at) : 'never'}
                    </TableCell>
                    <TableCell>
                      {revoked ? (
                        <Chip size="small" label="revoked" data-testid={`key-status-${key.id}`} />
                      ) : (
                        <Chip
                          size="small"
                          color="success"
                          label="active"
                          data-testid={`key-status-${key.id}`}
                        />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {!revoked && (
                        <Button
                          size="small"
                          color="warning"
                          onClick={() => setRevoking(key)}
                        >
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <MintKeyDialog
        open={minting}
        minted={minted}
        saving={saving}
        serverError={formError}
        onSubmit={(name) => void handleCreate(name)}
        onClose={() => {
          if (!saving) setMinting(false);
        }}
        onAcknowledge={handleAcknowledge}
      />

      <ConfirmDialog
        open={Boolean(revoking)}
        title={revoking ? `Revoke "${revoking.name}"?` : 'Revoke key?'}
        message="Applications using this key stop working immediately. This cannot be undone."
        confirmLabel={revokeBusy ? 'Revoking…' : 'Revoke key'}
        onConfirm={() => void handleRevoke()}
        onClose={() => {
          if (!revokeBusy) setRevoking(null);
        }}
      />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
