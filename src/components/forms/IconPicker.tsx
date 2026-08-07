/**
 * Devicon icon picker dialog (Icons v1.6). Searches the server-cached devicon manifest,
 * shows a result grid, and — once an icon is chosen — previews each of its available
 * `versions` (variants) on BOTH a light and a dark swatch so a black-on-transparent glyph
 * that would vanish on dark is obvious BEFORE saving. Confirming imports the chosen variant
 * via POST /api/admin/icons/import and hands the returned media-CDN URL back to the caller.
 *
 * The preview icons load from jsDelivr (fine for on-screen preview); the value actually
 * stored is always the imported CDN URL. Styling is MUI theme + `sx` (§14.4).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  deviconPreviewUrl,
  getDeviconManifest,
  importIcon,
  searchIcons,
  type DeviconIcon,
  type DeviconManifest,
} from '../../api/iconsApi';
import { serverMessage } from '../../api/serverMessage';

interface IconPickerProps {
  open: boolean;
  /** Human title, e.g. "Choose icon" / "Choose dark-theme icon". */
  title?: string;
  onClose: () => void;
  /** Called with the imported media-CDN URL when the user confirms a variant. */
  onSelect: (url: string) => void;
}

/** How many search hits to render at once — the manifest is ~200 icons. */
const RESULT_LIMIT = 60;

/** Plain swatch chips so a glyph's contrast is visible on both themes (task spec). */
const LIGHT_SWATCH = '#f7f9fc';
const DARK_SWATCH = '#171c28';

export default function IconPicker({ open, title = 'Choose icon', onClose, onSelect }: IconPickerProps) {
  const [manifest, setManifest] = useState<DeviconManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<DeviconIcon | null>(null);
  const [variant, setVariant] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setManifest(await getDeviconManifest());
    } catch (err) {
      setLoadError(serverMessage(err, 'Could not load the icon manifest. Is the API reachable?'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      // Reset per-open so a reopen starts clean.
      setQuery('');
      setChosen(null);
      setVariant(null);
      setImportError('');
      void load();
    }
  }, [open, load]);

  const results = useMemo(() => {
    if (!manifest) return [];
    return searchIcons(manifest.icons, query);
  }, [manifest, query]);

  const version = manifest?.version ?? '';

  const handlePickIcon = (icon: DeviconIcon) => {
    setChosen(icon);
    setVariant(icon.versions[0] ?? null);
    setImportError('');
  };

  const handleConfirm = async () => {
    if (!chosen || !variant) return;
    setImporting(true);
    setImportError('');
    try {
      const url = await importIcon(chosen.name, variant);
      onSelect(url);
      onClose();
    } catch (err) {
      setImportError(serverMessage(err, 'Could not import the icon.'));
    } finally {
      setImporting(false);
    }
  };

  const shown = results.slice(0, RESULT_LIMIT);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <TextField
          label="Search icons"
          placeholder="Name, alt name, or tag — e.g. react, postgres, database"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          fullWidth
          size="small"
          autoFocus
          sx={{ mb: 2 }}
        />

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

        {!loading && !loadError && manifest && (
          <>
            {results.length === 0 ? (
              <Alert severity="info">No icons match “{query}”.</Alert>
            ) : (
              <Box
                data-testid="icon-results"
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))',
                  gap: 1,
                }}
              >
                {shown.map((icon) => {
                  const isChosen = chosen?.name === icon.name;
                  return (
                    <Box
                      key={icon.name}
                      component="button"
                      type="button"
                      aria-label={`Select ${icon.name}`}
                      aria-pressed={isChosen}
                      onClick={() => handlePickIcon(icon)}
                      sx={{
                        p: 1,
                        cursor: 'pointer',
                        borderRadius: 1,
                        border: 2,
                        borderColor: isChosen ? 'primary.main' : 'divider',
                        bgcolor: 'background.paper',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 0.5,
                      }}
                    >
                      <Box
                        component="img"
                        src={deviconPreviewUrl(version, icon.name, icon.versions[0])}
                        alt=""
                        sx={{ width: 32, height: 32, objectFit: 'contain' }}
                      />
                      <Typography variant="caption" noWrap sx={{ maxWidth: '100%' }}>
                        {icon.name}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            )}

            {results.length > shown.length && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Showing {shown.length} of {results.length} matches — refine your search to see the rest.
              </Typography>
            )}

            {chosen && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  {chosen.name} — pick a variant
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  Check each variant on the light and dark swatch — a dark glyph is invisible on
                  a dark background.
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  {chosen.versions.map((v) => {
                    const isVariant = variant === v;
                    const src = deviconPreviewUrl(version, chosen.name, v);
                    return (
                      <Box
                        key={v}
                        component="button"
                        type="button"
                        aria-label={`Variant ${v}`}
                        aria-pressed={isVariant}
                        onClick={() => setVariant(v)}
                        sx={{
                          p: 1,
                          cursor: 'pointer',
                          borderRadius: 1,
                          border: 2,
                          borderColor: isVariant ? 'primary.main' : 'divider',
                          bgcolor: 'background.paper',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 0.5,
                        }}
                      >
                        <Stack direction="row" spacing={0.5}>
                          <Box
                            sx={{
                              bgcolor: LIGHT_SWATCH,
                              borderRadius: 0.5,
                              p: 0.5,
                              display: 'flex',
                            }}
                          >
                            <Box component="img" src={src} alt="" sx={{ width: 28, height: 28 }} />
                          </Box>
                          <Box
                            sx={{
                              bgcolor: DARK_SWATCH,
                              borderRadius: 0.5,
                              p: 0.5,
                              display: 'flex',
                            }}
                          >
                            <Box component="img" src={src} alt="" sx={{ width: 28, height: 28 }} />
                          </Box>
                        </Stack>
                        <Typography variant="caption">{v}</Typography>
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            )}

            {importError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {importError}
              </Alert>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={importing}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!chosen || !variant || importing}
        >
          {importing ? 'Importing…' : 'Use this icon'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
