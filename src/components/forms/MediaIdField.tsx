/**
 * Media-id field — opens the reusable {@link MediaPicker} (task #446) to browse or upload
 * an asset and writes the chosen `media_id` back through `onChange`. The picker also yields
 * alt text; for a freshly uploaded asset that alt is persisted on the `media_assets` row at
 * upload time (§6.7), so accessible descriptions are captured right where media is chosen.
 *
 * Styling is MUI theme + `sx` only (§14.4).
 */
import { useState } from 'react';
import { Box, Button, InputAdornment, Stack, TextField } from '@mui/material';
import PermMediaIcon from '@mui/icons-material/PermMedia';
import MediaPicker from '../media/MediaPicker';

interface MediaIdFieldProps {
  label: string;
  value: string;
  required?: boolean;
  onChange?: (mediaId: string) => void;
  helperText?: string;
}

export default function MediaIdField({
  label,
  value,
  required,
  onChange,
  helperText,
}: MediaIdFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const showRequiredError = Boolean(required) && !value;

  return (
    <Box>
      <TextField
        label={label}
        required={required}
        value={value || ''}
        fullWidth
        size="small"
        error={showRequiredError}
        helperText={helperText}
        slotProps={{
          input: {
            readOnly: true,
            startAdornment: (
              <InputAdornment position="start">
                <PermMediaIcon fontSize="small" color={value ? 'primary' : 'disabled'} />
              </InputAdornment>
            ),
            endAdornment: (
              <Stack direction="row" spacing={0.5}>
                {value && onChange && (
                  <Button size="small" color="inherit" onClick={() => onChange('')}>
                    Clear
                  </Button>
                )}
                <Button size="small" onClick={() => setPickerOpen(true)}>
                  {value ? 'Change…' : 'Choose…'}
                </Button>
              </Stack>
            ),
          },
        }}
        placeholder="No media selected"
      />

      <MediaPicker
        open={pickerOpen}
        selectedId={value || undefined}
        onClose={() => setPickerOpen(false)}
        onSelect={({ media_id }) => onChange?.(media_id)}
      />
    </Box>
  );
}
