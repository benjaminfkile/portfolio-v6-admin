/**
 * Icon-source field (Icons v1.6) — the picker-backed control for a skills item's
 * `icon_source` / `icon_source_dark`. Opens {@link IconPicker} to search devicon, preview
 * variants on light+dark swatches, and import the chosen SVG (the returned media-CDN URL is
 * written back). A manual-URL escape hatch keeps custom/self-hosted/simpleicons URLs
 * possible, and — for optional fields — a Clear button removes the value entirely (so the
 * strict API schema never sees an empty `icon_source_dark`).
 *
 * Styling is MUI theme + `sx` (§14.4).
 */
import { useState } from 'react';
import { Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import IconPicker from './IconPicker';
import { deviconNameFromUrl } from '../../api/iconsApi';

interface IconSourceFieldProps {
  label: string;
  value: string;
  required?: boolean;
  /** `undefined` removes the key (used when clearing an optional dark override). */
  onChange: (value: string | undefined) => void;
  helperText?: string;
  /** Dark-theme override field: opens the picker tint-first (Simple Icons + ink presets). */
  dark?: boolean;
  /** The sibling light/default icon URL — pre-seeds the tint search on a dark field. */
  lightIconUrl?: string;
}

/** Plain swatch chips so a dark glyph's invisibility on dark is obvious inline too. */
const LIGHT_SWATCH = '#f7f9fc';
const DARK_SWATCH = '#171c28';

export default function IconSourceField({
  label,
  value,
  required,
  onChange,
  helperText,
  dark,
  lightIconUrl,
}: IconSourceFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const showRequiredError = Boolean(required) && !value;

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        {value && (
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
            <Box sx={{ bgcolor: LIGHT_SWATCH, borderRadius: 0.5, p: 0.5, display: 'flex' }}>
              <Box component="img" crossOrigin="anonymous" src={value} alt="" sx={{ width: 24, height: 24, objectFit: 'contain' }} />
            </Box>
            <Box sx={{ bgcolor: DARK_SWATCH, borderRadius: 0.5, p: 0.5, display: 'flex' }}>
              <Box component="img" crossOrigin="anonymous" src={value} alt="" sx={{ width: 24, height: 24, objectFit: 'contain' }} />
            </Box>
          </Stack>
        )}
        <TextField
          label={label}
          required={required}
          value={value || ''}
          fullWidth
          size="small"
          error={showRequiredError}
          helperText={helperText}
          placeholder={manual ? 'https://…' : 'No icon selected'}
          onChange={(e) => {
            if (!manual) return;
            const next = e.target.value;
            onChange(next === '' ? undefined : next);
          }}
          slotProps={{ input: { readOnly: !manual } }}
        />
        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
          {value && (
            <Button size="small" color="inherit" onClick={() => onChange(undefined)}>
              Clear
            </Button>
          )}
          <Button size="small" onClick={() => setPickerOpen(true)}>
            {value ? 'Change…' : 'Choose…'}
          </Button>
        </Stack>
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
        <Link
          component="button"
          type="button"
          variant="caption"
          onClick={() => setManual((m) => !m)}
        >
          {manual ? 'Use the icon picker' : 'Enter URL manually'}
        </Link>
        {manual && ' — paste any URL (custom, self-hosted, or e.g. cdn.simpleicons.org).'}
      </Typography>

      <IconPicker
        open={pickerOpen}
        title={`Choose ${label.toLowerCase()}`}
        dark={dark}
        seedSearch={dark ? deviconNameFromUrl(lightIconUrl) ?? undefined : undefined}
        onClose={() => setPickerOpen(false)}
        onSelect={(url) => onChange(url)}
      />
    </Box>
  );
}
