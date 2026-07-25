/**
 * Reusable media picker dialog. Two ways in — browse the existing library or upload a new
 * asset inline — and one way out: it hands the caller a `media_id`. Wired into every media
 * field of the section/item editors (§3.4) so choosing media never means leaving the form.
 *
 * The confirm button also returns the picked asset's alt text, so the editor field can
 * capture accessible descriptions at selection time. Styling is MUI theme + `sx` (§14.4).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { getMedia } from '../../api/mediaApi';
import type { MediaAsset } from '../../types/media';
import MediaGrid from './MediaGrid';
import UploadDialog from './UploadDialog';

export interface MediaSelection {
  media_id: string;
  alt: string;
}

interface MediaPickerProps {
  open: boolean;
  /** Preselect this asset when the dialog opens (the field's current value). */
  selectedId?: string;
  onClose: () => void;
  /** Called with the chosen `media_id` (and its alt) when the user confirms. */
  onSelect: (selection: MediaSelection) => void;
}

export default function MediaPicker({ open, selectedId, onClose, onSelect }: MediaPickerProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [chosen, setChosen] = useState<MediaAsset | null>(null);
  const [alt, setAlt] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getMedia();
      // Only confirmed assets are pickable — an unconfirmed row has no landed object yet.
      const usable = data.filter((a) => a.confirmed_at);
      setAssets(usable);
      const preselected = usable.find((a) => a.id === selectedId) ?? null;
      setChosen(preselected);
      setAlt(preselected?.alt ?? '');
    } catch {
      setLoadError('Could not load the media library. Is the API reachable?');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handlePick = (asset: MediaAsset) => {
    setChosen(asset);
    setAlt(asset.alt ?? '');
  };

  const handleUploaded = (asset: MediaAsset) => {
    setUploadOpen(false);
    setAssets((prev) => [asset, ...prev.filter((a) => a.id !== asset.id)]);
    setChosen(asset);
    setAlt(asset.alt ?? '');
  };

  const handleConfirm = () => {
    if (!chosen) return;
    onSelect({ media_id: chosen.id, alt: alt.trim() });
    onClose();
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
        <DialogTitle>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            Choose media
            <Button
              startIcon={<CloudUploadIcon />}
              variant="outlined"
              size="small"
              onClick={() => setUploadOpen(true)}
            >
              Upload new
            </Button>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
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
            <Alert severity="info">
              No media yet. Use “Upload new” to add the first asset.
            </Alert>
          )}

          {!loading && !loadError && assets.length > 0 && (
            <MediaGrid assets={assets} selectedId={chosen?.id} onSelect={handlePick} />
          )}
        </DialogContent>

        <Box sx={{ px: 3, pt: 2 }}>
          <TextField
            label="Alt text"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            disabled={!chosen}
            size="small"
            fullWidth
            helperText={
              chosen
                ? 'Describe the media for accessibility. Saved with your selection.'
                : 'Select an asset to enter its alt text.'
            }
          />
          {chosen && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Selected: {chosen.s3_key.split('/').pop()}
            </Typography>
          )}
        </Box>

        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={handleConfirm} disabled={!chosen}>
            Use this media
          </Button>
        </DialogActions>
      </Dialog>

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={handleUploaded} />
    </>
  );
}
