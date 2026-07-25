/**
 * Upload dialog (§6.7). Drives the three-step direct-to-S3 upload with a progress bar and
 * explicit error states. The §6.7 gotcha — a 403 on the PUT means the `x-amz-tagging`
 * header didn't match the signature — is surfaced verbatim via {@link MediaUploadError}
 * so a confusing failure has a concrete cause rather than a generic "upload failed".
 *
 * Styling is MUI theme + `sx` only (§14.4).
 */
import { useRef, useState } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { MediaUploadError, performUpload } from '../../api/mediaApi';
import { formatBytes } from '../../lib/media';
import type { MediaAsset } from '../../types/media';

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the confirmed asset once the full §6.7 sequence completes. */
  onUploaded: (asset: MediaAsset) => void;
}

export default function UploadDialog({ open, onClose, onUploaded }: UploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<MediaUploadError | Error | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setAlt('');
    setUploading(false);
    setProgress(0);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleClose = () => {
    if (uploading) return; // don't abandon an in-flight upload from a stray backdrop click
    reset();
    onClose();
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      const asset = await performUpload(file, {
        alt: alt.trim() || undefined,
        onProgress: setProgress,
      });
      onUploaded(asset);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Upload failed'));
      setUploading(false);
    }
  };

  const stepLabel =
    error instanceof MediaUploadError
      ? { request: 'Requesting upload URL', upload: 'Uploading to S3', confirm: 'Confirming upload' }[
          error.step
        ]
      : null;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Upload media</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Button
            component="label"
            variant="outlined"
            startIcon={<CloudUploadIcon />}
            disabled={uploading}
            sx={{ alignSelf: 'flex-start' }}
          >
            {file ? 'Choose a different file' : 'Choose file'}
            <input
              ref={inputRef}
              hidden
              type="file"
              accept="image/*,video/*"
              aria-label="File to upload"
              onChange={(e) => {
                setError(null);
                setFile(e.target.files?.[0] ?? null);
              }}
            />
          </Button>

          {file && (
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {file.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {file.type || 'unknown type'} · {formatBytes(file.size)}
              </Typography>
            </Box>
          )}

          <TextField
            label="Alt text"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            disabled={uploading}
            size="small"
            fullWidth
            helperText="Describe the media for accessibility. Optional but recommended."
          />

          {uploading && (
            <Box>
              <LinearProgress
                variant="determinate"
                value={progress}
                aria-label="Upload progress"
              />
              <Typography variant="caption" color="text.secondary">
                Uploading… {progress}%
              </Typography>
            </Box>
          )}

          {error && (
            <Alert severity="error">
              {stepLabel && <AlertTitle>{stepLabel} failed</AlertTitle>}
              {error.message}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={uploading}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void handleUpload()} disabled={!file || uploading}>
          {uploading ? 'Uploading…' : 'Upload'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
