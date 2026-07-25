/**
 * Renders a full set of registry fields against a `data` blob and reports edits back as
 * a new blob. Shared by the section edit form and the item edit form — both are just a
 * list of {@link FieldRenderer}s over their respective field descriptors (§3.9 item 2).
 */
import { Stack } from '@mui/material';
import type { FieldDef } from '../../lib/sectionRegistry';
import type { Link } from '../../types/content';
import { areLinksValid } from '../../lib/reorder';
import FieldRenderer from './FieldRenderer';

interface DataFieldsFormProps {
  fields: FieldDef[];
  data: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

export default function DataFieldsForm({ fields, data, onChange }: DataFieldsFormProps) {
  const setField = (key: string, value: unknown) => {
    const next = { ...data };
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onChange(next);
  };

  return (
    <Stack spacing={2.5} sx={{ mt: 1 }}>
      {fields.map((field) => (
        <FieldRenderer key={field.key} field={field} value={data[field.key]} onChange={setField} />
      ))}
    </Stack>
  );
}

/**
 * Validate a data blob against its field descriptors: required text/select fields must be
 * non-empty, and any `links` field must pass {@link areLinksValid}. Returns a list of
 * human-readable problems; empty means the form can be saved.
 */
export function validateData(fields: FieldDef[], data: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const field of fields) {
    const value = data[field.key];
    if (field.required && (field.kind === 'text' || field.kind === 'multiline' || field.kind === 'select')) {
      if (!String(value ?? '').trim()) {
        problems.push(`${field.label} is required`);
      }
    }
    if (field.required && field.kind === 'number') {
      if (value === undefined || value === null || Number.isNaN(Number(value))) {
        problems.push(`${field.label} is required`);
      }
    }
    if (field.kind === 'links' && Array.isArray(value) && !areLinksValid(value as Link[])) {
      problems.push(`${field.label}: every link needs a label and an http(s) URL`);
    }
  }
  return problems;
}
