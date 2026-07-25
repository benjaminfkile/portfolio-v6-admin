/**
 * Create/edit form for a section item (§3.4) — timeline entries, skills, portfolio
 * projects. Fields come from the section type's `itemFields` registry entry, so the same
 * dialog serves every item-bearing type. On an edit, the parent supplies the item's
 * `expected_updated_at` for the §4.5 concurrency check; on a create there is nothing to
 * conflict with.
 */
import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import type { FieldDef } from '../../lib/sectionRegistry';
import DataFieldsForm, { validateData } from '../forms/DataFieldsForm';

interface ItemEditDialogProps {
  open: boolean;
  /** Human title, e.g. "Add project" / "Edit entry". */
  title: string;
  fields: FieldDef[];
  initialData: Record<string, unknown>;
  saving: boolean;
  onSave: (data: Record<string, unknown>) => void;
  onClose: () => void;
}

export default function ItemEditDialog({
  open,
  title,
  fields,
  initialData,
  saving,
  onSave,
  onClose,
}: ItemEditDialogProps) {
  const [data, setData] = useState<Record<string, unknown>>(initialData);
  const problems = validateData(fields, data);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DataFieldsForm fields={fields} data={data} onChange={setData} />
        {problems.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {problems.join('. ')}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => onSave(data)}
          disabled={saving || problems.length > 0}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
