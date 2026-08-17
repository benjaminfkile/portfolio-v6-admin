/**
 * Resume upload dialog. Drives the PDF-only three-step direct-to-S3 upload — request the
 * presigned URL, PUT the bytes, confirm — with a progress bar and explicit error states.
 * Non-PDFs are rejected client-side before we even ask for a URL.
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
  Typography,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import {
  ResumeUploadError,
  isPdfFile,
  performResumeUpload,
} from '../../api/resumesApi';
import { formatBytes } from '../../lib/media';
import type { ResumeVersion } from '../../types/resumes';

interface ResumeUploadDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the confirmed row once the full upload sequence completes. */
  onUploaded: (version: ResumeVersion) => void;
}

export default function ResumeUploadDialog({
  open,
  onClose,
  onUploaded,
}: ResumeUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setUploading(false);
    setProgress(0);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleClose = () => {
    if (uploading) return;
    reset();
    onClose();
  };

  const handleFileChange = (nextFile: File | null) => {
    setError(null);
    if (nextFile && !isPdfFile(nextFile)) {
      setFile(null);
      setError(
        new ResumeUploadError(
          'request',
          'Resume must be a PDF. Please choose a .pdf file.',
        ),
      );
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setFile(nextFile);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      const version = await performResumeUpload(file, { onProgress: setProgress });
      onUploaded(version);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Upload failed'));
      setUploading(false);
    }
  };

  const stepLabel =
    error instanceof ResumeUploadError
      ? {
          request: 'Preparing upload',
          upload: 'Uploading to S3',
          confirm: 'Confirming upload',
        }[error.step]
      : null;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Upload resume</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Button
            component="label"
            variant="outlined"
            startIcon={<CloudUploadIcon />}
            disabled={uploading}
            sx={{ alignSelf: 'flex-start' }}
          >
            {file ? 'Choose a different PDF' : 'Choose PDF'}
            <input
              ref={inputRef}
              hidden
              type="file"
              accept="application/pdf,.pdf"
              aria-label="Resume PDF to upload"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
          </Button>

          {file && (
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {file.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {file.type || 'application/pdf'} · {formatBytes(file.size)}
              </Typography>
            </Box>
          )}

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
        <Button
          variant="contained"
          onClick={() => void handleUpload()}
          disabled={!file || uploading}
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
