/**
 * Create-section dialog — a type picker over the section registry (§3.4). Adding a
 * *section instance* is data, not code (§3.1): pick one of the registered types and the
 * API inserts a row seeded with that type's default `data`.
 */
import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from '@mui/material';
import type { SectionType } from '../../types/content';
import { SECTION_TYPE_LIST } from '../../lib/sectionRegistry';

interface CreateSectionDialogProps {
  open: boolean;
  onCreate: (type: SectionType) => void;
  onClose: () => void;
}

export default function CreateSectionDialog({ open, onCreate, onClose }: CreateSectionDialogProps) {
  const [type, setType] = useState<SectionType>('hero');

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Add a section</DialogTitle>
      <DialogContent>
        <TextField
          select
          label="Section type"
          value={type}
          onChange={(e) => setType(e.target.value as SectionType)}
          fullWidth
          sx={{ mt: 1 }}
        >
          {SECTION_TYPE_LIST.map((def) => (
            <MenuItem key={def.type} value={def.type}>
              {def.label}
            </MenuItem>
          ))}
        </TextField>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => onCreate(type)}>
          Add section
        </Button>
      </DialogActions>
    </Dialog>
  );
}
