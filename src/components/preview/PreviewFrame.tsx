/**
 * Shared preview iframe (§7). Mints a preview token, composes the target URL for it, and
 * embeds the real public site so unpublished changes are seen through the production
 * renderer. Both the page-preview and per-post-preview flows use this — they differ only in
 * how the URL is built from the token (`buildUrl`).
 *
 * The token expires in 15 minutes (§7), so re-minting is a first-class action: the "Re-mint
 * token" button gets a fresh token and reloads the frame. The target URL is shown verbatim
 * with an open-in-new-tab action so the preview can also be opened outside the iframe.
 *
 * Themed via MUI only (§14.4).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import { mintPreviewToken } from '../../api/previewApi';
import { serverMessage } from '../../api/serverMessage';

interface PreviewFrameProps {
  /** Builds the iframe `src` from a freshly minted token — the §7 URL contract. */
  buildUrl: (token: string) => string;
  /** Accessible title for the iframe and its describing label. */
  title: string;
}

export default function PreviewFrame({ buildUrl, title }: PreviewFrameProps) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const mint = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const minted = await mintPreviewToken();
      setToken(minted.token);
    } catch (err) {
      setError(serverMessage(err, 'Could not mint a preview token. Is the API reachable?'));
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void mint();
  }, [mint]);

  const url = token ? buildUrl(token) : '';

  return (
    <Stack spacing={2} sx={{ flexGrow: 1, minHeight: 0 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ alignItems: { sm: 'center' } }}
      >
        <TextField
          label="Preview URL"
          value={url}
          fullWidth
          size="small"
          slotProps={{
            input: {
              readOnly: true,
              endAdornment: (
                <Tooltip title="Open preview in a new tab">
                  <span>
                    <IconButton
                      edge="end"
                      aria-label="Open preview in a new tab"
                      component="a"
                      href={url || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      disabled={!url}
                    >
                      <OpenInNewIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              ),
            },
          }}
        />
        <Tooltip title="Preview tokens expire after 15 minutes — re-mint to refresh">
          <span>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => void mint()}
              disabled={loading}
              sx={{ flexShrink: 0 }}
            >
              Re-mint token
            </Button>
          </span>
        </Tooltip>
      </Stack>

      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void mint()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <Box
        sx={{
          position: 'relative',
          flexGrow: 1,
          minHeight: 480,
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
          bgcolor: 'background.paper',
        }}
      >
        {loading && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CircularProgress />
          </Box>
        )}
        {url && (
          <Box
            component="iframe"
            data-testid="preview-iframe"
            title={title}
            src={url}
            sx={{ width: '100%', height: '100%', minHeight: 480, border: 0, display: 'block' }}
          />
        )}
      </Box>
    </Stack>
  );
}
