/**
 * Bespoke editor for the `code` block (§3.7). Three controls: a monospace textarea for the
 * raw code (stored raw, never escaped at rest — escaping happens once at render time), a
 * language select over the shared allowlist (`codeLanguages.ts`), and an optional filename
 * that renders as a header label above the block. Styling is MUI theme + `sx` only (§14.4).
 */
import { MenuItem, Stack, TextField } from '@mui/material';
import type { Block } from '../../../types/content';
import { CODE_LANGUAGES } from '../../../lib/codeLanguages';

type CodeBlock = Extract<Block, { type: 'code' }>;

interface CodeBlockEditorProps {
  block: CodeBlock;
  onChange: (block: CodeBlock) => void;
}

export default function CodeBlockEditor({ block, onChange }: CodeBlockEditorProps) {
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2}>
        <TextField
          select
          label="Language"
          size="small"
          value={block.language}
          onChange={(e) => onChange({ ...block, language: e.target.value })}
          sx={{ minWidth: 180 }}
          helperText="Highlighted client-side; unknown languages render as plain text."
        >
          {CODE_LANGUAGES.map((lang) => (
            <MenuItem key={lang.value} value={lang.value}>
              {lang.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Filename (optional)"
          size="small"
          fullWidth
          value={block.filename ?? ''}
          onChange={(e) => {
            const filename = e.target.value;
            const next = { ...block };
            if (filename.trim()) next.filename = filename;
            else delete next.filename;
            onChange(next);
          }}
          placeholder="src/app.ts"
        />
      </Stack>
      <TextField
        label="Code"
        multiline
        minRows={4}
        fullWidth
        value={block.code}
        onChange={(e) => onChange({ ...block, code: e.target.value })}
        slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: 'monospace' } } }}
      />
    </Stack>
  );
}
