/**
 * Renders one registry-described field (§3.9 item 2). Given a {@link FieldDef}, the
 * current value, and an onChange, it picks the right control by `kind`. This is the
 * primitive the section and item edit forms are generated from — adding a field to a
 * type's registry entry is all it takes to get a control for it.
 */
import { FormControlLabel, MenuItem, Switch, TextField } from '@mui/material';
import type { FieldDef } from '../../lib/sectionRegistry';
import type { Link } from '../../types/content';
import LinkEditor from './LinkEditor';
import StringListField from './StringListField';
import SkillRefsField from './SkillRefsField';
import MediaIdField from './MediaIdField';
import IconSourceField from './IconSourceField';

interface FieldRendererProps {
  field: FieldDef;
  value: unknown;
  /** The full data blob this field lives in — lets a dark icon field read its light sibling. */
  data?: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export default function FieldRenderer({ field, value, data, onChange }: FieldRendererProps) {
  const set = (v: unknown) => onChange(field.key, v);

  switch (field.kind) {
    case 'text':
    case 'multiline':
      return (
        <TextField
          label={field.label}
          required={field.required}
          value={(value as string) ?? ''}
          onChange={(e) => set(e.target.value)}
          multiline={field.kind === 'multiline'}
          minRows={field.kind === 'multiline' ? 3 : undefined}
          fullWidth
          size="small"
          error={field.required ? !String(value ?? '').trim() : false}
          helperText={field.helperText}
        />
      );

    case 'number':
      return (
        <TextField
          label={field.label}
          required={field.required}
          type="number"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => set(e.target.value === '' ? undefined : Number(e.target.value))}
          fullWidth
          size="small"
          helperText={field.helperText}
          slotProps={{
            htmlInput: {
              min: field.min,
              max: field.max,
              step: field.integer ? 1 : undefined,
            },
          }}
        />
      );

    case 'boolean':
      return (
        <FormControlLabel
          control={
            <Switch checked={Boolean(value)} onChange={(e) => set(e.target.checked)} />
          }
          label={field.label}
        />
      );

    case 'select':
      return (
        <TextField
          select
          label={field.label}
          required={field.required}
          value={(value as string) ?? ''}
          onChange={(e) => set(e.target.value)}
          fullWidth
          size="small"
          helperText={field.helperText}
        >
          {(field.options ?? []).map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>
      );

    case 'stringList':
      return (
        <StringListField
          label={field.label}
          value={(value as string[]) ?? []}
          onChange={(next) => set(next)}
        />
      );

    case 'links':
      return (
        <LinkEditor value={(value as Link[]) ?? []} onChange={(next) => set(next)} />
      );

    case 'skillRefs':
      return (
        <SkillRefsField
          label={field.label}
          value={(value as string[]) ?? []}
          onChange={(next) => set(next)}
          helperText={field.helperText}
        />
      );

    case 'media':
      return (
        <MediaIdField
          label={field.label}
          required={field.required}
          value={(value as string) ?? ''}
          onChange={(id) => set(id)}
          helperText={field.helperText}
        />
      );

    case 'icon':
      return (
        <IconSourceField
          label={field.label}
          required={field.required}
          value={(value as string) ?? ''}
          onChange={(v) => set(v)}
          helperText={field.helperText}
          dark={field.dark}
          lightIconUrl={
            field.lightSourceKey ? (data?.[field.lightSourceKey] as string | undefined) : undefined
          }
        />
      );

    default:
      return null;
  }
}
