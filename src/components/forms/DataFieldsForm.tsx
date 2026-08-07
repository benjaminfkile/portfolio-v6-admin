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
        <FieldRenderer
          key={field.key}
          field={field}
          value={data[field.key]}
          data={data}
          onChange={setField}
        />
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
    if (
      field.required &&
      (field.kind === 'text' ||
        field.kind === 'multiline' ||
        field.kind === 'select' ||
        field.kind === 'icon')
    ) {
      if (!String(value ?? '').trim()) {
        problems.push(`${field.label} is required`);
      }
    }
    if (field.required && field.kind === 'number') {
      if (value === undefined || value === null || Number.isNaN(Number(value))) {
        problems.push(`${field.label} is required`);
      }
    }
    // Bounds/integer checks for provided number values — mirrors the API's zod
    // schema so an out-of-range value (e.g. sphere detail 20) is caught in the
    // form instead of surfacing as an opaque "could not save" server reject.
    if (field.kind === 'number' && value !== undefined && value !== null) {
      const num = Number(value);
      if (!Number.isNaN(num)) {
        if (field.integer && !Number.isInteger(num)) {
          problems.push(`${field.label} must be a whole number`);
        }
        if (field.min !== undefined && num < field.min) {
          problems.push(`${field.label} must be at least ${field.min}`);
        }
        if (field.max !== undefined && num > field.max) {
          problems.push(`${field.label} must be at most ${field.max}`);
        }
      }
    }
    if (field.kind === 'links' && Array.isArray(value) && !areLinksValid(value as Link[])) {
      problems.push(`${field.label}: every link needs a label and an http(s) URL`);
    }
  }
  return problems;
}
