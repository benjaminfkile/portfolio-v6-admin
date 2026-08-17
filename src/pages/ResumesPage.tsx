/**
 * Resumes page. Lists uploaded PDF versions newest-first with a Live badge on the newest
 * confirmed row (the public site serves whichever version wears it). Delete goes through
 * an explicit confirm dialog because deleting the live row promotes the next version to
 * live — that is called out in the helper text.
 *
 * Upload runs the PDF-only three-step direct-to-S3 flow: request presigned URL → PUT →
 * confirm, matching the media library's helper.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Link,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { deleteResume, getResumes } from '../api/resumesApi';
import { serverMessage } from '../api/serverMessage';
import { formatBytes, formatDate } from '../lib/media';
import type { ResumeVersion } from '../types/resumes';
import ConfirmDialog from '../components/ConfirmDialog';
import ResumeUploadDialog from '../components/resumes/ResumeUploadDialog';

/** The "live" row is the newest CONFIRMED version — matches what the public site serves. */
function findLiveId(versions: ResumeVersion[]): string | null {
  for (const v of versions) {
    if (v.confirmed_at) return v.id;
  }
  return null;
}

export default function ResumesPage() {
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState<ResumeVersion | null>(null);
  const [toast, setToast] = useState('');

  const refetch = useCallback(async () => {
    const list = await getResumes();
    // Newest-first regardless of API order.
    setVersions([...list].sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      await refetch();
    } catch (err) {
      setLoadError(
        serverMessage(err, 'Could not load the resume versions. Is the API reachable?'),
      );
    } finally {
      setLoading(false);
    }
  }, [refetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const liveId = useMemo(() => findLiveId(versions), [versions]);

  const handleUploaded = async () => {
    setToast('Upload complete.');
    try {
      await refetch();
    } catch (err) {
      setToast(serverMessage(err, 'Uploaded, but could not refresh the list.'));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    try {
      await deleteResume(target.id);
      setDeleting(null);
      await refetch();
      setToast(
        target.id === liveId
          ? 'Deleted. The next version is now live.'
          : 'Version deleted.',
      );
    } catch (err) {
      setDeleting(null);
      setToast(serverMessage(err, 'Could not delete the version.'));
    }
  };

  return (
    <Box>
      <Stack
        direction="row"
        sx={{
          mb: 3,
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Box>
          <Typography variant="h4" component="h1">
            Resumes
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 720 }}>
            Upload a new resume PDF; the newest confirmed version is what the site serves.
            Deleting the live version promotes the next one.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<CloudUploadIcon />}
          onClick={() => setUploadOpen(true)}
        >
          Upload PDF
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

      {!loading && !loadError && versions.length === 0 && (
        <Alert severity="info">
          No resumes yet. The public site shows nothing until you upload a first PDF —
          the newest confirmed version is what gets served.
        </Alert>
      )}

      {!loading && !loadError && versions.length > 0 && (
        <TableContainer component={Paper} variant="outlined">
          <Table aria-label="Resume versions">
            <TableHead>
              <TableRow>
                <TableCell>Filename</TableCell>
                <TableCell>Uploaded</TableCell>
                <TableCell align="right">Size</TableCell>
                <TableCell align="center">Open</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {versions.map((version) => {
                const isLive = version.id === liveId;
                return (
                  <TableRow key={version.id} data-testid="resume-row" hover>
                    <TableCell>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {version.filename}
                        </Typography>
                        {isLive && (
                          <Chip
                            size="small"
                            color="success"
                            label="Live"
                            data-testid="live-badge"
                          />
                        )}
                        {!version.confirmed_at && (
                          <Chip size="small" label="Unconfirmed" />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>{formatDate(version.created_at)}</TableCell>
                    <TableCell align="right">{formatBytes(version.bytes)}</TableCell>
                    <TableCell align="center">
                      {version.url ? (
                        <Tooltip title={`Open ${version.filename}`}>
                          <Link
                            href={version.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open ${version.filename}`}
                            sx={{ display: 'inline-flex', alignItems: 'center' }}
                          >
                            <OpenInNewIcon fontSize="small" />
                          </Link>
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Delete version">
                        <IconButton
                          size="small"
                          color="error"
                          aria-label={`Delete ${version.filename}`}
                          onClick={() => setDeleting(version)}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <ResumeUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => void handleUploaded()}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete resume version?"
        message={
          deleting?.id === liveId
            ? 'This is the live version. Deleting it will promote the next version to live, ' +
              'or leave the site with no resume if there is no next version. This cannot be undone.'
            : 'This permanently removes the version and its PDF from storage. This cannot be undone.'
        }
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleting(null)}
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
