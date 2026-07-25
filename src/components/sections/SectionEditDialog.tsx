/**
 * Per-type section edit form (§3.4, §4.5). The fields come from the section registry, so
 * this one dialog handles every section type. Save is gated on registry validation and,
 * when it fires, the parent sends `expected_updated_at` from the loaded row for the §4.5
 * concurrency check — this component only produces the new `data` blob.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import type { AdminSection } from '../../types/admin';
import { getSectionTypeDef } from '../../lib/sectionRegistry';
import DataFieldsForm, { validateData } from '../forms/DataFieldsForm';

interface SectionEditDialogProps {
  open: boolean;
  section: AdminSection;
  saving: boolean;
  onSave: (data: Record<string, unknown>) => void;
  onClose: () => void;
}

export default function SectionEditDialog({
  open,
  section,
  saving,
  onSave,
  onClose,
}: SectionEditDialogProps) {
  const def = getSectionTypeDef(section.type);
  const [data, setData] = useState<Record<string, unknown>>(section.data ?? {});

  // Re-seed the draft whenever a different section is opened for editing.
  useEffect(() => {
    setData({ ...def.defaultData, ...(section.data ?? {}) });
  }, [section.id, section.data, def.defaultData]);

  const problems = validateData(def.fields, data);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit {def.label}</DialogTitle>
      <DialogContent>
        {def.fields.length === 0 ? (
          <Alert severity="info" sx={{ mt: 1 }}>
            This section type has no editable fields.
          </Alert>
        ) : (
          <DataFieldsForm fields={def.fields} data={data} onChange={setData} />
        )}
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
