/**
 * Mint dialog for an API key (API Keys v1.16). One dialog drives two phases:
 *
 *  1. NAME phase (`minted` is null): a required name field → Create key. A server rejection is
 *     surfaced inline and keeps the dialog open.
 *  2. SHOW-ONCE phase (`minted` is set): the FULL secret is shown once in a read-only monospace
 *     field with a copy button and a loud warning that this is the only time it is shown.
 *
 * The show-once phase is deliberately hard to dismiss into oblivion: there is no Cancel, no
 * backdrop-close, and no escape — the ONLY way out is the explicit "I saved the key" button,
 * so an admin cannot lose the secret by fat-fingering the backdrop. Themed via MUI only (§14.4).
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import type { MintedApiKey } from '../../types/admin';

interface MintKeyDialogProps {
  open: boolean;
  /** The freshly minted key to reveal once, or null while still collecting the name. */
  minted: MintedApiKey | null;
  saving: boolean;
  /** A server-side rejection to show inline in the name phase; '' hides it. */
  serverError?: string;
  onSubmit: (name: string) => void;
  /** Close during the name phase (Cancel / backdrop). No-op once a key is being shown. */
  onClose: () => void;
  /** The explicit "I saved the key" acknowledge — the only way out of the show-once phase. */
  onAcknowledge: () => void;
}

export default function MintKeyDialog({
  open,
  minted,
  saving,
  serverError = '',
  onSubmit,
  onClose,
  onAcknowledge,
}: MintKeyDialogProps) {
  const [name, setName] = useState('');
  const [copied, setCopied] = useState(false);

  // Reset the field/copied flag whenever the dialog (re)opens for the name phase.
  useEffect(() => {
    if (open && !minted) {
      setName('');
      setCopied(false);
    }
  }, [open, minted]);

  const nameError = name.trim() === '' ? 'A name is required.' : '';
  const canSubmit = !saving && !nameError;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(name.trim());
  };

  const handleCopy = async () => {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted.key);
      setCopied(true);
    } catch {
      // Clipboard blocked (permissions / insecure context): leave the key visible to copy by hand.
    }
  };

  // Show-once phase: reveal the full secret; the only exit is the explicit acknowledge.
  if (minted) {
    return (
      <Dialog open={open} onClose={() => {}} maxWidth="sm" fullWidth>
        <DialogTitle>Save your new API key</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="warning">
              This is the only time the key is shown. Store it now.
            </Alert>
            <TextField
              label={`Key for "${minted.name}"`}
              value={minted.key}
              fullWidth
              slotProps={{
                input: {
                  readOnly: true,
                  sx: { fontFamily: 'monospace' },
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip title={copied ? 'Copied' : 'Copy key'}>
                        <IconButton
                          onClick={() => void handleCopy()}
                          edge="end"
                          aria-label="Copy key"
                        >
                          {copied ? <CheckIcon color="success" /> : <ContentCopyIcon />}
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  ),
                },
                htmlInput: { 'data-testid': 'minted-key-value' },
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={onAcknowledge}>
            I saved the key
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  // Name phase: collect a required name, then mint.
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Create API key</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Give the key a name so you can recognise it later (e.g. the app or script that uses it).
        </DialogContentText>
        <Box component="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Stack spacing={2}>
            {serverError && <Alert severity="error">{serverError}</Alert>}
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={Boolean(name) && Boolean(nameError)}
              helperText="A label for this key. Required."
              fullWidth
              autoFocus
              slotProps={{ htmlInput: { 'data-testid': 'key-name-input' } }}
            />
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={!canSubmit}>
          {saving ? 'Creating…' : 'Create key'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
