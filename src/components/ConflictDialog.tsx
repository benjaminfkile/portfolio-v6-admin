/**
 * 409 conflict dialog (§4.5). Wholesale writes mean two open admin tabs can silently
 * overwrite each other; the API guards against it with an `expected_updated_at`
 * precondition and returns 409 on a mismatch. Rather than silently losing either copy,
 * the admin surfaces this dialog — "changed since you loaded it" — and offers to refetch
 * the current state so the edit can be re-applied against fresh data.
 */
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';

interface ConflictDialogProps {
  open: boolean;
  /** Refetch the working set and dismiss. */
  onRefetch: () => void;
  onClose: () => void;
}

export default function ConflictDialog({ open, onRefetch, onClose }: ConflictDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby="conflict-dialog-title">
      <DialogTitle id="conflict-dialog-title">This changed since you loaded it</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Someone (or another tab) saved a newer version of this content, so your change was
          not applied — the API rejected it to avoid overwriting their work. Refetch the
          latest version, then re-apply your edit.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Dismiss</Button>
        <Button variant="contained" onClick={onRefetch}>
          Refetch latest
        </Button>
      </DialogActions>
    </Dialog>
  );
}
