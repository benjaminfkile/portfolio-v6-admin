/**
 * Icon picker dialog (Icons v1.6 → v1.6.1).
 *
 * The LIGHT/default field gets today's devicon-only flow: search the server-cached devicon
 * manifest, pick an icon, preview each of its `versions` (variants) on BOTH a light and a
 * dark swatch — so a black-on-transparent glyph that would vanish on dark is obvious BEFORE
 * saving — then import the chosen variant.
 *
 * The DARK-override field (`dark` prop) opens tint-FIRST, because devicon ships no light
 * variants of its monochrome logos — the dark-override flow is a dead end exactly when it is
 * needed. Two tabs:
 *   • "Tinted (recommended)" (default) — search Simple Icons, pick a logo, tint it to a light
 *     dark-theme ink (three preset chips + a free hex), preview on the dark swatch (its whole
 *     purpose), and import `{ source:'simpleicons', slug, color }`.
 *   • "Devicon" — the unchanged catalog flow above, for coloured logos that read on dark.
 *
 * Preview icons load from a CDN (jsDelivr for devicon, cdn.simpleicons.org for tints); the
 * value actually stored is always the imported media-CDN URL. Styling is MUI theme + `sx`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  deviconPreviewUrl,
  getDeviconManifest,
  getSimpleIconsManifest,
  importIcon,
  importSimpleIcon,
  isValidHexColor,
  searchIcons,
  searchSimpleIcons,
  simpleIconPreviewUrl,
  type DeviconIcon,
  type DeviconManifest,
  type SimpleIcon,
  type SimpleIconsManifest,
} from '../../api/iconsApi';
import { serverMessage } from '../../api/serverMessage';

interface IconPickerProps {
  open: boolean;
  /** Human title, e.g. "Choose icon" / "Choose dark theme icon". */
  title?: string;
  /** Dark-override field: show the tint-first flow (Simple Icons + ink presets) as a tab. */
  dark?: boolean;
  /** Pre-seed the tint search (e.g. the light icon's name, so "same logo, tinted" is one click). */
  seedSearch?: string;
  onClose: () => void;
  /** Called with the imported media-CDN URL when the user confirms. */
  onSelect: (url: string) => void;
}

/** How many search hits to render at once — the catalogs are hundreds of icons. */
const RESULT_LIMIT = 60;

/** Plain swatch chips so a glyph's contrast is visible on both themes (task spec). */
const LIGHT_SWATCH = '#f7f9fc';
const DARK_SWATCH = '#171c28';

/**
 * The public site's dark-theme ink tokens (contract): a tinted logo should read as one of
 * these. Colours are hex WITHOUT '#', the shape cdn.simpleicons.org and the import both take.
 */
const DARK_INK_PRESETS: { label: string; hex: string }[] = [
  { label: 'Text bright', hex: 'EDF1F7' },
  { label: 'Text', hex: 'C9D2E0' },
  { label: 'Amber accent', hex: 'E8A33D' },
];

type PickerTab = 'tinted' | 'devicon';

export default function IconPicker({
  open,
  title = 'Choose icon',
  dark = false,
  seedSearch,
  onClose,
  onSelect,
}: IconPickerProps) {
  // Dark fields open tint-first; light fields only ever show devicon (no tabs).
  const [tab, setTab] = useState<PickerTab>(dark ? 'tinted' : 'devicon');

  // --- Devicon flow state (shared by the light field and the dark "Devicon" tab) ---
  const [manifest, setManifest] = useState<DeviconManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<DeviconIcon | null>(null);
  const [variant, setVariant] = useState<string | null>(null);

  // --- Tinted (Simple Icons) flow state ---
  const [siManifest, setSiManifest] = useState<SimpleIconsManifest | null>(null);
  const [siLoading, setSiLoading] = useState(true);
  const [siLoadError, setSiLoadError] = useState('');
  const [siQuery, setSiQuery] = useState('');
  const [siChosen, setSiChosen] = useState<SimpleIcon | null>(null);
  const [color, setColor] = useState(DARK_INK_PRESETS[0].hex);

  // --- Shared import state ---
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

  const loadSimple = useCallback(async () => {
    setSiLoading(true);
    setSiLoadError('');
    try {
      setSiManifest(await getSimpleIconsManifest());
    } catch (err) {
      setSiLoadError(
        serverMessage(err, 'Could not load the Simple Icons catalog. Is the API reachable?'),
      );
    } finally {
      setSiLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // Reset per-open so a reopen starts clean.
    setTab(dark ? 'tinted' : 'devicon');
    setQuery('');
    setChosen(null);
    setVariant(null);
    setSiQuery(seedSearch ?? '');
    setSiChosen(null);
    setColor(DARK_INK_PRESETS[0].hex);
    setImporting(false);
    setImportError('');
    void load();
    if (dark) void loadSimple();
  }, [open, dark, seedSearch, load, loadSimple]);

  const results = useMemo(() => {
    if (!manifest) return [];
    return searchIcons(manifest.icons, query);
  }, [manifest, query]);

  const siResults = useMemo(() => {
    if (!siManifest) return [];
    return searchSimpleIcons(siManifest.icons, siQuery);
  }, [siManifest, siQuery]);

  const version = manifest?.version ?? '';

  const handlePickIcon = (icon: DeviconIcon) => {
    setChosen(icon);
    setVariant(icon.versions[0] ?? null);
    setImportError('');
  };

  const handlePickSimple = (icon: SimpleIcon) => {
    setSiChosen(icon);
    setImportError('');
  };

  const colorValid = isValidHexColor(color);

  const handleConfirm = async () => {
    setImporting(true);
    setImportError('');
    try {
      let url: string;
      if (tab === 'tinted') {
        if (!siChosen || !colorValid) return;
        url = await importSimpleIcon(siChosen.slug, color);
      } else {
        if (!chosen || !variant) return;
        url = await importIcon(chosen.name, variant);
      }
      onSelect(url);
      onClose();
    } catch (err) {
      setImportError(serverMessage(err, 'Could not import the icon.'));
    } finally {
      setImporting(false);
    }
  };

  const confirmDisabled =
    importing ||
    (tab === 'tinted' ? !siChosen || !colorValid : !chosen || !variant);

  const shown = results.slice(0, RESULT_LIMIT);
  const siShown = siResults.slice(0, RESULT_LIMIT);

  // ---- Devicon tab content (also the whole body for a light field) ----
  const deviconBody = (
    <>
      <TextField
        label="Search icons"
        placeholder="Name, alt name, or tag — e.g. react, postgres, database"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        fullWidth
        size="small"
        autoFocus={!dark}
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
                      crossOrigin="anonymous"
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
                Each chip previews one variant on the light and dark theme swatches side by side —
                the two swatches are the SAME icon on both themes, a preview, not a light/dark
                choice. A dark glyph is invisible on a dark background, so prefer a variant that
                reads on both.
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
                        <Box sx={{ bgcolor: LIGHT_SWATCH, borderRadius: 0.5, p: 0.5, display: 'flex' }}>
                          <Box component="img" crossOrigin="anonymous" src={src} alt="" sx={{ width: 28, height: 28 }} />
                        </Box>
                        <Box sx={{ bgcolor: DARK_SWATCH, borderRadius: 0.5, p: 0.5, display: 'flex' }}>
                          <Box component="img" crossOrigin="anonymous" src={src} alt="" sx={{ width: 28, height: 28 }} />
                        </Box>
                      </Stack>
                      <Typography variant="caption">{v}</Typography>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          )}
        </>
      )}
    </>
  );

  // ---- Tinted (Simple Icons) tab content ----
  const tintedBody = (
    <>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
        Pick a logo, then tint it to a light dark-theme ink. The preview renders on the dark
        swatch — that is what this override is for.
      </Typography>
      <TextField
        label="Search Simple Icons"
        placeholder="Brand name or slug — e.g. express, vercel, nextdotjs"
        value={siQuery}
        onChange={(e) => setSiQuery(e.target.value)}
        fullWidth
        size="small"
        autoFocus
        sx={{ mb: 2 }}
      />

      {siLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {!siLoading && siLoadError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void loadSimple()}>
              Retry
            </Button>
          }
        >
          {siLoadError}
        </Alert>
      )}

      {!siLoading && !siLoadError && siManifest && (
        <>
          {siResults.length === 0 ? (
            <Alert severity="info">No icons match “{siQuery}”.</Alert>
          ) : (
            <Box
              data-testid="simpleicon-results"
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))',
                gap: 1,
              }}
            >
              {siShown.map((icon) => {
                const isChosen = siChosen?.slug === icon.slug;
                return (
                  <Box
                    key={icon.slug}
                    component="button"
                    type="button"
                    aria-label={`Select ${icon.title}`}
                    aria-pressed={isChosen}
                    onClick={() => handlePickSimple(icon)}
                    sx={{
                      p: 1,
                      cursor: 'pointer',
                      borderRadius: 1,
                      border: 2,
                      borderColor: isChosen ? 'primary.main' : 'divider',
                      // Preview each catalog logo tinted to the current ink on the dark swatch,
                      // so the grid already reads the way it will on the site.
                      bgcolor: DARK_SWATCH,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 0.5,
                    }}
                  >
                    <Box
                      component="img"
                      crossOrigin="anonymous"
                      src={simpleIconPreviewUrl(icon.slug, colorValid ? color : 'EDF1F7')}
                      alt=""
                      sx={{ width: 32, height: 32, objectFit: 'contain' }}
                    />
                    <Typography
                      variant="caption"
                      noWrap
                      sx={{ maxWidth: '100%', color: '#EDF1F7' }}
                    >
                      {icon.title}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          )}

          {siResults.length > siShown.length && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Showing {siShown.length} of {siResults.length} matches — refine your search to see the rest.
            </Typography>
          )}

          {siChosen && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                {siChosen.title} — pick a tint
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Tint to a dark-theme ink (preset) or type any hex. Preview is on the dark swatch.
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 2 }}>
                {DARK_INK_PRESETS.map((preset) => (
                  <Chip
                    key={preset.hex}
                    label={preset.label}
                    aria-label={`Tint ${preset.label}`}
                    aria-pressed={color.toLowerCase() === preset.hex.toLowerCase()}
                    onClick={() => setColor(preset.hex)}
                    variant={color.toLowerCase() === preset.hex.toLowerCase() ? 'filled' : 'outlined'}
                    color={color.toLowerCase() === preset.hex.toLowerCase() ? 'primary' : 'default'}
                    avatar={
                      <Box
                        sx={{
                          bgcolor: `#${preset.hex}`,
                          borderRadius: '50%',
                          border: '1px solid rgba(0,0,0,0.2)',
                        }}
                      />
                    }
                  />
                ))}
              </Stack>
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <TextField
                  label="Hex"
                  value={color}
                  onChange={(e) => setColor(e.target.value.replace(/^#/, '').trim())}
                  size="small"
                  error={!colorValid}
                  helperText={colorValid ? 'Without the #' : '3- or 6-digit hex, e.g. EDF1F7'}
                  slotProps={{ input: { startAdornment: <Box sx={{ mr: 0.5 }}>#</Box> } }}
                  sx={{ width: 160 }}
                />
                <Box
                  data-testid="tint-preview"
                  sx={{ bgcolor: DARK_SWATCH, borderRadius: 1, p: 1.5, display: 'flex' }}
                >
                  <Box
                    component="img"
                    crossOrigin="anonymous"
                    src={simpleIconPreviewUrl(siChosen.slug, colorValid ? color : 'EDF1F7')}
                    alt={`${siChosen.title} tinted preview`}
                    sx={{ width: 40, height: 40, objectFit: 'contain' }}
                  />
                </Box>
              </Stack>
            </Box>
          )}
        </>
      )}
    </>
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        {dark && (
          <Tabs
            value={tab}
            onChange={(_e, next: PickerTab) => {
              setTab(next);
              setImportError('');
            }}
            sx={{ mb: 2 }}
          >
            <Tab value="tinted" label="Tinted (recommended)" />
            <Tab value="devicon" label="Devicon" />
          </Tabs>
        )}

        {dark && tab === 'tinted' ? tintedBody : deviconBody}

        {importError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {importError}
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={importing}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleConfirm} disabled={confirmDisabled}>
          {importing ? 'Importing…' : 'Use this icon'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
