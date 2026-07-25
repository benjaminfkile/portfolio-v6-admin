/**
 * Media-id field — a READ-ONLY picker placeholder (per task scope). The real media
 * library and picker land in sibling task #446; until then media_id fields render the
 * stored id (if any) and cannot be changed from here.
 *
 * INTEGRATION POINT: when #446 ships, replace the disabled control below with a button
 * that opens the media picker dialog and calls `onChange(selectedMediaId)`. The `onChange`
 * prop is already threaded through so the surrounding form needs no change — only this
 * component's body does.
 */
import { Box, Button, InputAdornment, TextField, Typography } from '@mui/material';
import PermMediaIcon from '@mui/icons-material/PermMedia';

interface MediaIdFieldProps {
  label: string;
  value: string;
  required?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- wired for task #446
  onChange?: (mediaId: string) => void;
  helperText?: string;
}

export default function MediaIdField({ label, value, required, helperText }: MediaIdFieldProps) {
  return (
    <Box>
      <TextField
        label={label}
        required={required}
        value={value || ''}
        fullWidth
        size="small"
        slotProps={{
          input: {
            readOnly: true,
            startAdornment: (
              <InputAdornment position="start">
                <PermMediaIcon fontSize="small" color="disabled" />
              </InputAdornment>
            ),
            endAdornment: (
              <Button size="small" disabled>
                Choose…
              </Button>
            ),
          },
        }}
        placeholder="No media selected"
        helperText={helperText}
      />
      <Typography variant="caption" color="text.secondary">
        Media picker arrives with the media library (task #446). Read-only for now.
      </Typography>
    </Box>
  );
}
