/**
 * Version history with restore (§4.2, §7). Lists published snapshots newest-first and lets
 * an admin roll the live site back to any of them.
 *
 * Restore is destructive by design: `POST /api/admin/versions/:v/restore` re-publishes the
 * chosen version as a new snapshot *and* rebuilds the entire working set from it, in one
 * transaction — so any current unpublished edits to sections and items are discarded (§4.2).
 * That is exactly why this MUST go through an explicit warning confirm before it fires.
 *
 * Themed via MUI only (§14.4).
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
import RestoreIcon from '@mui/icons-material/Restore';
import type { Version } from '../types/admin';
import { getVersions, restoreVersion } from '../api/versionsApi';
import { serverMessage } from '../api/serverMessage';
import { formatDate } from '../lib/media';
import ConfirmDialog from '../components/ConfirmDialog';

export default function VersionsPage() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [target, setTarget] = useState<Version | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await getVersions();
      // Newest-first regardless of the order the API returns them in (§4.2).
      setVersions([...list].sort((a, b) => b.version - a.version));
    } catch (err) {
      setLoadError(serverMessage(err, 'Could not load the version history. Is the API reachable?'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRestore = async () => {
    if (!target) return;
    const v = target.version;
    setRestoring(true);
    try {
      await restoreVersion(v);
      setTarget(null);
      setToast(`Restored version ${v}. The working set was reset to it.`);
      await load();
    } catch (err) {
      setToast(serverMessage(err, `Could not restore version ${v}.`));
    } finally {
      setRestoring(false);
    }
  };

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
          Versions
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Every publish snapshots the page as a new version. Restore rolls the live site back
          to an earlier one — and rebuilds your working set from it (§4.2).
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
      ) : versions.length === 0 ? (
        <Alert severity="info">
          No versions yet — nothing has been published. Publishing the page creates the first
          version.
        </Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table aria-label="Version history">
            <TableHead>
              <TableRow>
                <TableCell>Version</TableCell>
                <TableCell>Published</TableCell>
                <TableCell>Published by</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {versions.map((version, index) => (
                <TableRow key={version.version} data-testid="version-row" hover>
                  <TableCell>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        v{version.version}
                      </Typography>
                      {index === 0 && <Chip size="small" color="success" label="Live" />}
                    </Stack>
                  </TableCell>
                  <TableCell>{formatDate(version.published_at)}</TableCell>
                  <TableCell>{version.published_by}</TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      color="warning"
                      startIcon={<RestoreIcon />}
                      onClick={() => setTarget(version)}
                      disabled={index === 0}
                    >
                      Restore
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <ConfirmDialog
        open={target != null}
        title={target ? `Restore version ${target.version}?` : 'Restore version?'}
        message={
          target
            ? `This re-publishes version ${target.version} as the new live version and rebuilds ` +
              'the entire working set from it. Your current unpublished edits to sections and ' +
              'items will be DISCARDED and replaced by this version. This cannot be undone.'
            : ''
        }
        confirmLabel={restoring ? 'Restoring…' : 'Discard edits & restore'}
        onConfirm={() => void handleRestore()}
        onClose={() => {
          if (!restoring) setTarget(null);
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
