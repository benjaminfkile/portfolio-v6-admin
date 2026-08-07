/**
 * The site-level publish action (§4.2, §3.10). Publish snapshots the ENTIRE
 * working set — every page and its sections — as one new version, so it lives in
 * the app bar as a global action rather than on any one editing screen (it used
 * to sit on the Sections page, where it read as "publish these sections").
 *
 * The API re-validates the whole working set first (§3.9); a refusal is surfaced
 * as a per-issue list inside the dialog rather than an opaque toast.
 */
import { useState } from 'react';
import {
  Alert,
  AlertTitle,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Snackbar,
} from '@mui/material';
import PublishIcon from '@mui/icons-material/Publish';
import { PublishValidationError, publishSite } from '../api/versionsApi';
import { serverMessage } from '../api/serverMessage';

export default function PublishSiteButton() {
  const [open, setOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [toast, setToast] = useState('');

  const handlePublish = async () => {
    setPublishing(true);
    setIssues([]);
    try {
      const version = await publishSite();
      setOpen(false);
      setToast(`Published version ${version.version}. The site is now live.`);
    } catch (err) {
      if (err instanceof PublishValidationError) {
        // Keep the dialog open and list every failure inline (§3.9).
        setIssues([err.message, ...err.issues]);
      } else {
        setOpen(false);
        setToast(serverMessage(err, 'Could not publish the site. Is the API reachable?'));
      }
    } finally {
      setPublishing(false);
    }
  };

  const close = () => {
    if (publishing) return;
    setOpen(false);
    setIssues([]);
  };

  return (
    <>
      <Button
        color="inherit"
        variant="outlined"
        startIcon={<PublishIcon />}
        onClick={() => {
          setIssues([]);
          setOpen(true);
        }}
        sx={{ mr: 1, borderColor: 'currentColor' }}
      >
        Publish site
      </Button>

      <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
        <DialogTitle>Publish the site?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This snapshots ALL pages — the entire working set, not just the screen you are
            on — as one new version and makes it live on the public site immediately
            (§4.2, §3.10). Everything is validated first; if anything on any page is
            invalid, nothing is published.
          </DialogContentText>
          {issues.length > 0 && (
            <Alert severity="error" sx={{ mt: 2 }}>
              <AlertTitle>Publish failed validation</AlertTitle>
              <List dense disablePadding>
                {issues.map((issue, i) => (
                  <ListItem key={i} disableGutters sx={{ py: 0 }}>
                    <ListItemText primary={issue} />
                  </ListItem>
                ))}
              </List>
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={publishing}>
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={<PublishIcon />}
            onClick={() => void handlePublish()}
            disabled={publishing}
          >
            {publishing ? 'Publishing…' : 'Publish now'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
}
