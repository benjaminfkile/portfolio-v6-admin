/**
 * Media library page (§6.7–6.9, §14.4). A responsive grid of CDN thumbnails with mime/size
 * metadata; orphaned assets carry a badge and their scheduled S3 deletion date (§6.9).
 * Actions: upload (the three-step direct-to-S3 flow, §6.7), delete with confirmation, and a
 * "run sweep" button that runs the GC pass on demand (`POST /api/admin/media/sweep`).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import { deleteMedia, getMedia, runSweep } from '../api/mediaApi';
import type { MediaAsset } from '../types/media';
import { isOrphaned } from '../lib/media';
import MediaGrid from '../components/media/MediaGrid';
import UploadDialog from '../components/media/UploadDialog';
import ConfirmDialog from '../components/ConfirmDialog';

export default function MediaPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState<MediaAsset | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [toast, setToast] = useState('');

  const refetch = useCallback(async () => {
    const data = await getMedia();
    setAssets([...data].sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      await refetch();
    } catch {
      setLoadError('Could not load the media library. Is the API reachable?');
    } finally {
      setLoading(false);
    }
  }, [refetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUploaded = async () => {
    setToast('Upload complete.');
    try {
      await refetch();
    } catch {
      setToast('Uploaded, but could not refresh the library.');
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMedia(deleting.id);
      setDeleting(null);
      await refetch();
    } catch {
      setDeleting(null);
      setToast('Could not delete the asset.');
    }
  };

  const handleSweep = async () => {
    setSweeping(true);
    try {
      const result = await runSweep();
      setToast(
        `Sweep complete — ${result.orphaned} orphaned, ${result.rescued} rescued, ${result.deleted} deleted.`,
      );
      await refetch();
    } catch {
      setToast('Could not run the sweep.');
    } finally {
      setSweeping(false);
    }
  };

  const orphanCount = assets.filter(isOrphaned).length;

  return (
    <Box>
      <Stack
        direction="row"
        sx={{ mb: 3, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}
      >
        <Typography variant="h4" component="h1">
          Media
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<CleaningServicesIcon />}
            onClick={() => void handleSweep()}
            disabled={sweeping}
          >
            {sweeping ? 'Sweeping…' : 'Run sweep'}
          </Button>
          <Button
            variant="contained"
            startIcon={<CloudUploadIcon />}
            onClick={() => setUploadOpen(true)}
          >
            Upload
          </Button>
        </Stack>
      </Stack>

      {!loading && !loadError && orphanCount > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {orphanCount} asset{orphanCount === 1 ? ' is' : 's are'} orphaned and scheduled for
          deletion (§6.9). Re-reference within the grace window to rescue.
        </Alert>
      )}

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

      {!loading && !loadError && assets.length === 0 && (
        <Alert severity="info">No media yet. Upload an image or video to get started.</Alert>
      )}

      {!loading && !loadError && assets.length > 0 && (
        <MediaGrid assets={assets} onDelete={(asset) => setDeleting(asset)} />
      )}

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => void handleUploaded()}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete asset?"
        message="This permanently removes the asset and its S3 object. Anything still referencing it will break."
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
