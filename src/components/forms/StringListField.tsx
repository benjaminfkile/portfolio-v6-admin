/**
 * Editable list of plain strings — used for `status.services` (§3.4). Rows can be edited,
 * added, and removed. Order is not semantically meaningful for these fields, so no drag
 * handle here (unlike the Link editor); a simple add/remove list is enough.
 *
 * (Portfolio's `tech_icons[]` was the other consumer until Skill Refs v1.8 replaced it with
 * a `skill_refs` picker — see {@link SkillRefsField}.)
 */
import { Box, Button, IconButton, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';

interface StringListFieldProps {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
}

export default function StringListField({ label, value, onChange }: StringListFieldProps) {
  const rows = Array.isArray(value) ? value : [];

  const setAt = (index: number, next: string) => {
    onChange(rows.map((row, i) => (i === index ? next : row)));
  };
  const removeAt = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };
  const add = () => onChange([...rows, '']);

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        {label}
      </Typography>
      <Stack spacing={1}>
        {rows.map((row, index) => (
          <Stack key={index} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <TextField
              size="small"
              fullWidth
              value={row}
              onChange={(e) => setAt(index, e.target.value)}
              slotProps={{ htmlInput: { 'aria-label': `${label} ${index + 1}` } }}
            />
            <IconButton
              aria-label={`Remove ${label} ${index + 1}`}
              size="small"
              onClick={() => removeAt(index)}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}
      </Stack>
      <Button startIcon={<AddIcon />} size="small" onClick={add} sx={{ mt: 1 }}>
        Add {label.toLowerCase()}
      </Button>
    </Box>
  );
}
