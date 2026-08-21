/**
 * Hero background tweak editor (task #131). Compact "Background image" group inside the
 * hero section dialog. Shown only when `background_media_id` is set; otherwise a one-line
 * hint tells the admin to pick a background media item first.
 *
 * Every knob is number-typed on save (never a string), and any control at its default is
 * OMITTED from the saved payload so the JSON stays minimal (an empty object collapses to
 * `undefined`, which drops the whole `background` key). A live preview above the controls
 * mirrors what the public site will render, with a Dark / Light toggle that flips which
 * opacity and overlay pair applies against the matching --ground colour.
 *
 * The object-position control offers a 3x3 anchor preset grid (top-left through
 * bottom-right) that writes the matching percentage string into the free-text input.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  IconButton,
  MenuItem,
  Slider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import type { HeroBackground } from '../../types/content';
import type { MediaAsset } from '../../types/media';
import { getMedia } from '../../api/mediaApi';
import { isImage, mediaUrl } from '../../lib/media';

/**
 * Documented defaults from the shared contract. The public site renders these when a key
 * is absent, so the editor uses them both as placeholders and as the "at default" check
 * that decides whether a key is kept in the saved payload.
 */
export const HERO_BACKGROUND_DEFAULTS = {
  opacity_dark: 0.1,
  opacity_light: 0.06,
  object_fit: 'cover',
  object_position: '50% 50%',
  blur_px: 0,
  grayscale: 0,
  brightness: 1,
  contrast: 1,
  saturate: 1,
  scale: 1,
  overlay_dark: 0,
  overlay_light: 0,
} as const;

/** Ground colours used for the preview only. Rough parity with the public site tokens. */
const PREVIEW_GROUND = {
  dark: '#0f1115',
  light: '#f6f7f9',
} as const;

const OBJECT_FIT_OPTIONS: HeroBackground['object_fit'][] = [
  'cover',
  'contain',
  'fill',
  'none',
  'scale-down',
];

/** 3x3 anchor grid: label + object-position value written when the button is clicked. */
const POSITION_PRESETS: { label: string; value: string }[][] = [
  [
    { label: 'top left', value: '0% 0%' },
    { label: 'top', value: '50% 0%' },
    { label: 'top right', value: '100% 0%' },
  ],
  [
    { label: 'left', value: '0% 50%' },
    { label: 'center', value: '50% 50%' },
    { label: 'right', value: '100% 50%' },
  ],
  [
    { label: 'bottom left', value: '0% 100%' },
    { label: 'bottom', value: '50% 100%' },
    { label: 'bottom right', value: '100% 100%' },
  ],
];

/** Free-text validation for object_position (max 40 chars, safe css chars only). */
const OBJECT_POSITION_RE = /^[A-Za-z0-9\s%.\-]{0,40}$/;

export function isValidObjectPosition(value: string): boolean {
  return OBJECT_POSITION_RE.test(value);
}

interface HeroBackgroundFieldProps {
  label: string;
  /** Current `background` blob from the hero data (or undefined). */
  value: HeroBackground | undefined;
  /** Sibling `background_media_id` from the hero data (drives visibility). */
  mediaId: string | undefined;
  /**
   * Emits the next `background` object, or `undefined` when every key is at its default
   * (the parent then drops the key from the saved data blob).
   */
  onChange: (next: HeroBackground | undefined) => void;
  helperText?: string;
}

type NumberKey =
  | 'opacity_dark'
  | 'opacity_light'
  | 'blur_px'
  | 'grayscale'
  | 'brightness'
  | 'contrast'
  | 'saturate'
  | 'scale'
  | 'overlay_dark'
  | 'overlay_light';

interface NumberSpec {
  key: NumberKey;
  label: string;
  min: number;
  max: number;
  step: number;
}

const OPACITY_SPECS: NumberSpec[] = [
  { key: 'opacity_dark', label: 'Opacity (dark)', min: 0, max: 1, step: 0.01 },
  { key: 'opacity_light', label: 'Opacity (light)', min: 0, max: 1, step: 0.01 },
];

const FILTER_SPECS: NumberSpec[] = [
  { key: 'blur_px', label: 'Blur (px)', min: 0, max: 40, step: 1 },
  { key: 'grayscale', label: 'Grayscale', min: 0, max: 1, step: 0.01 },
  { key: 'brightness', label: 'Brightness', min: 0, max: 2, step: 0.01 },
  { key: 'contrast', label: 'Contrast', min: 0, max: 2, step: 0.01 },
  { key: 'saturate', label: 'Saturate', min: 0, max: 2, step: 0.01 },
  { key: 'scale', label: 'Scale', min: 1, max: 2, step: 0.01 },
];

const OVERLAY_SPECS: NumberSpec[] = [
  { key: 'overlay_dark', label: 'Overlay (dark)', min: 0, max: 1, step: 0.01 },
  { key: 'overlay_light', label: 'Overlay (light)', min: 0, max: 1, step: 0.01 },
];

/**
 * Merge current values over the defaults so preview + control display always have a value
 * to render, without mutating the persisted object.
 */
function effective(bg: HeroBackground | undefined): Required<HeroBackground> {
  return { ...HERO_BACKGROUND_DEFAULTS, ...(bg ?? {}) };
}

/**
 * Drop any key whose value equals the default. Returns undefined when nothing survives so
 * the parent removes the whole `background` key from the saved data blob.
 */
function pruneDefaults(bg: HeroBackground): HeroBackground | undefined {
  const out: HeroBackground = {};
  const src = bg as Record<string, unknown>;
  for (const key of Object.keys(HERO_BACKGROUND_DEFAULTS) as (keyof HeroBackground)[]) {
    const value = src[key];
    if (value === undefined) continue;
    if (value === HERO_BACKGROUND_DEFAULTS[key]) continue;
    // Persisted objects use `any` on the value; cast once via unknown to keep the shape.
    (out as Record<string, unknown>)[key] = value;
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

export default function HeroBackgroundField({
  label,
  value,
  mediaId,
  onChange,
  helperText,
}: HeroBackgroundFieldProps) {
  const [previewMode, setPreviewMode] = useState<'dark' | 'light'>('dark');
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  const [assetError, setAssetError] = useState('');
  // Local text buffer for object_position so the user can type an intermediate value
  // (e.g. "50" en route to "50% 30%") without the parent immediately rejecting it.
  const [positionDraft, setPositionDraft] = useState<string>('');
  const positionDirty = useRef(false);

  useEffect(() => {
    if (!positionDirty.current) {
      setPositionDraft(value?.object_position ?? '');
    }
  }, [value?.object_position]);

  useEffect(() => {
    if (!mediaId) {
      setAsset(null);
      setAssetError('');
      return;
    }
    let alive = true;
    setAssetError('');
    getMedia()
      .then((assets) => {
        if (!alive) return;
        const found = assets.find((a) => a.id === mediaId) ?? null;
        setAsset(found);
      })
      .catch(() => {
        if (alive) setAssetError('Could not load the background preview.');
      });
    return () => {
      alive = false;
    };
  }, [mediaId]);

  const current = value ?? {};
  const eff = effective(value);

  const patch = (next: HeroBackground) => {
    onChange(pruneDefaults(next));
  };

  const setKey = <K extends keyof HeroBackground>(key: K, next: HeroBackground[K] | undefined) => {
    const merged: HeroBackground = { ...current };
    if (next === undefined) {
      delete (merged as Record<string, unknown>)[key];
    } else {
      (merged as Record<string, unknown>)[key] = next;
    }
    patch(merged);
  };

  const resetKey = (key: keyof HeroBackground) => setKey(key, undefined);

  const commitPositionDraft = (text: string) => {
    positionDirty.current = false;
    const trimmed = text.trim();
    if (trimmed === '' || trimmed === HERO_BACKGROUND_DEFAULTS.object_position) {
      setKey('object_position', undefined);
      return;
    }
    setKey('object_position', trimmed);
  };

  const previewGround = PREVIEW_GROUND[previewMode];
  const previewOpacity = previewMode === 'dark' ? eff.opacity_dark : eff.opacity_light;
  const previewOverlay = previewMode === 'dark' ? eff.overlay_dark : eff.overlay_light;
  const previewFilter = useMemo(
    () =>
      [
        eff.blur_px !== 0 ? `blur(${eff.blur_px}px)` : '',
        eff.grayscale !== 0 ? `grayscale(${eff.grayscale})` : '',
        eff.brightness !== 1 ? `brightness(${eff.brightness})` : '',
        eff.contrast !== 1 ? `contrast(${eff.contrast})` : '',
        eff.saturate !== 1 ? `saturate(${eff.saturate})` : '',
      ]
        .filter(Boolean)
        .join(' '),
    [eff.blur_px, eff.grayscale, eff.brightness, eff.contrast, eff.saturate],
  );

  if (!mediaId) {
    return (
      <Box>
        <Typography variant="subtitle2" gutterBottom>
          {label}
        </Typography>
        <Alert severity="info" variant="outlined">
          Pick a background media item to tune it.
        </Alert>
      </Box>
    );
  }

  const positionValid = isValidObjectPosition(positionDraft);
  const imageSrc = asset && isImage(asset) ? mediaUrl(asset) : null;

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2">{label}</Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={previewMode}
          onChange={(_e, next) => next && setPreviewMode(next)}
          aria-label="Preview theme"
        >
          <ToggleButton value="dark" aria-label="Preview on dark theme">
            Dark
          </ToggleButton>
          <ToggleButton value="light" aria-label="Preview on light theme">
            Light
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Box
        data-testid="hero-background-preview"
        sx={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 5',
          overflow: 'hidden',
          borderRadius: 1,
          border: 1,
          borderColor: 'divider',
          backgroundColor: previewGround,
          mb: 2,
        }}
      >
        {imageSrc && (
          <Box
            component="img"
            src={imageSrc}
            alt=""
            data-testid="hero-background-preview-image"
            sx={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              display: 'block',
              opacity: previewOpacity,
              objectFit: eff.object_fit,
              objectPosition: eff.object_position,
              filter: previewFilter || 'none',
              transform: eff.scale !== 1 ? `scale(${eff.scale})` : 'none',
              transformOrigin: 'center',
            }}
          />
        )}
        <Box
          data-testid="hero-background-preview-overlay"
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundColor: previewGround,
            opacity: previewOverlay,
            pointerEvents: 'none',
          }}
        />
        {!imageSrc && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: previewMode === 'dark' ? 'grey.400' : 'grey.700',
              typography: 'caption',
            }}
          >
            {assetError || 'Loading preview...'}
          </Box>
        )}
      </Box>

      {helperText && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {helperText}
        </Typography>
      )}

      <Stack spacing={2}>
        <Section title="Opacity">
          {OPACITY_SPECS.map((spec) => (
            <NumberRow
              key={spec.key}
              spec={spec}
              currentValue={(current as Record<string, unknown>)[spec.key] as number | undefined}
              onChange={(next) => setKey(spec.key, next)}
              onReset={() => resetKey(spec.key)}
            />
          ))}
        </Section>

        <Section title="Fit & position">
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <TextField
              select
              size="small"
              label="Object fit"
              value={current.object_fit ?? ''}
              onChange={(e) =>
                setKey(
                  'object_fit',
                  e.target.value === ''
                    ? undefined
                    : (e.target.value as HeroBackground['object_fit']),
                )
              }
              sx={{ flex: 1 }}
              slotProps={{ select: { displayEmpty: true, renderValue: (v) => (v ? String(v) : `${HERO_BACKGROUND_DEFAULTS.object_fit} (default)`) } }}
            >
              <MenuItem value="">
                <em>{HERO_BACKGROUND_DEFAULTS.object_fit} (default)</em>
              </MenuItem>
              {OBJECT_FIT_OPTIONS.map((opt) => (
                <MenuItem key={opt} value={opt}>
                  {opt}
                </MenuItem>
              ))}
            </TextField>
            <ResetButton onReset={() => resetKey('object_fit')} disabled={current.object_fit === undefined} />
          </Stack>

          <Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <TextField
                size="small"
                label="Object position"
                placeholder={HERO_BACKGROUND_DEFAULTS.object_position}
                value={positionDraft}
                onChange={(e) => {
                  positionDirty.current = true;
                  setPositionDraft(e.target.value);
                }}
                onBlur={(e) => commitPositionDraft(e.target.value)}
                error={!positionValid}
                helperText={
                  !positionValid
                    ? 'Use letters, digits, spaces, %, ., or - (max 40 chars).'
                    : undefined
                }
                sx={{ flex: 1 }}
                slotProps={{ htmlInput: { 'aria-label': 'Object position' } }}
              />
              <ResetButton
                onReset={() => {
                  positionDirty.current = false;
                  setPositionDraft('');
                  resetKey('object_position');
                }}
                disabled={current.object_position === undefined}
              />
            </Stack>
            <Box
              data-testid="object-position-grid"
              sx={{
                mt: 1,
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 44px)',
                gridTemplateRows: 'repeat(3, 32px)',
                gap: 0.5,
              }}
            >
              {POSITION_PRESETS.flat().map((preset) => (
                <Tooltip key={preset.value} title={`${preset.label} (${preset.value})`}>
                  <Button
                    size="small"
                    variant={eff.object_position === preset.value ? 'contained' : 'outlined'}
                    onClick={() => {
                      positionDirty.current = false;
                      setPositionDraft(preset.value);
                      setKey(
                        'object_position',
                        preset.value === HERO_BACKGROUND_DEFAULTS.object_position
                          ? undefined
                          : preset.value,
                      );
                    }}
                    aria-label={`Set object position to ${preset.label}`}
                    sx={{ minWidth: 0, px: 0, py: 0 }}
                  >
                    <Box
                      aria-hidden
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor:
                          eff.object_position === preset.value ? 'primary.contrastText' : 'text.primary',
                      }}
                    />
                  </Button>
                </Tooltip>
              ))}
            </Box>
          </Box>
        </Section>

        <Section title="Filters">
          {FILTER_SPECS.map((spec) => (
            <NumberRow
              key={spec.key}
              spec={spec}
              currentValue={(current as Record<string, unknown>)[spec.key] as number | undefined}
              onChange={(next) => setKey(spec.key, next)}
              onReset={() => resetKey(spec.key)}
            />
          ))}
        </Section>

        <Section title="Overlay">
          {OVERLAY_SPECS.map((spec) => (
            <NumberRow
              key={spec.key}
              spec={spec}
              currentValue={(current as Record<string, unknown>)[spec.key] as number | undefined}
              onChange={(next) => setKey(spec.key, next)}
              onReset={() => resetKey(spec.key)}
            />
          ))}
        </Section>
      </Stack>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        {title}
      </Typography>
      <Stack spacing={1.5}>{children}</Stack>
    </Box>
  );
}

interface NumberRowProps {
  spec: NumberSpec;
  currentValue: number | undefined;
  onChange: (next: number | undefined) => void;
  onReset: () => void;
}

function NumberRow({ spec, currentValue, onChange, onReset }: NumberRowProps) {
  const defaultValue = HERO_BACKGROUND_DEFAULTS[spec.key];
  const effectiveValue =
    currentValue === undefined || currentValue === null ? defaultValue : currentValue;
  const isAtDefault = currentValue === undefined;
  const decimals = spec.step >= 1 ? 0 : spec.step >= 0.1 ? 1 : 2;

  // Local text buffer so partial typing (e.g. "1" mid-way to "1.2") is not prematurely
  // collapsed to `undefined` when it happens to match the field's default value. The
  // parent only receives a change when a keystroke completes into a parseable number.
  const [textDraft, setTextDraft] = useState<string>(
    currentValue === undefined || currentValue === null ? '' : String(currentValue),
  );
  const textDirty = useRef(false);
  useEffect(() => {
    if (!textDirty.current) {
      setTextDraft(currentValue === undefined || currentValue === null ? '' : String(currentValue));
    }
  }, [currentValue]);

  const snapToDefaultOrValue = (raw: number): number | undefined => {
    const clamped = Math.min(Math.max(raw, spec.min), spec.max);
    const snapped = Number(clamped.toFixed(decimals));
    return snapped === defaultValue ? undefined : snapped;
  };

  const emitFromSlider = (raw: number) => {
    if (Number.isNaN(raw)) return;
    onChange(snapToDefaultOrValue(raw));
  };

  const emitFromText = (text: string) => {
    textDirty.current = false;
    if (text.trim() === '') {
      onChange(undefined);
      return;
    }
    const parsed = Number(text);
    if (Number.isNaN(parsed)) {
      onChange(undefined);
      return;
    }
    onChange(snapToDefaultOrValue(parsed));
  };

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Typography variant="body2" sx={{ flexBasis: 120, flexShrink: 0 }}>
        {spec.label}
      </Typography>
      <Slider
        size="small"
        value={effectiveValue}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        onChange={(_e, next) => emitFromSlider(Array.isArray(next) ? next[0] : next)}
        aria-label={spec.label}
        sx={{ flex: 1, minWidth: 80 }}
      />
      <TextField
        type="number"
        size="small"
        value={textDraft}
        placeholder={String(defaultValue)}
        onChange={(e) => {
          textDirty.current = true;
          setTextDraft(e.target.value);
        }}
        onBlur={(e) => emitFromText(e.target.value)}
        sx={{ width: 84 }}
        slotProps={{
          htmlInput: {
            min: spec.min,
            max: spec.max,
            step: spec.step,
            'aria-label': `${spec.label} value`,
          },
        }}
      />
      <ResetButton onReset={onReset} disabled={isAtDefault} />
    </Stack>
  );
}

function ResetButton({ onReset, disabled }: { onReset: () => void; disabled?: boolean }) {
  return (
    <Tooltip title={disabled ? 'At default' : 'Reset to default'}>
      <span>
        <IconButton size="small" onClick={onReset} disabled={disabled} aria-label="Reset to default">
          <RestartAltIcon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );
}
