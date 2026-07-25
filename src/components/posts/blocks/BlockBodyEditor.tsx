/**
 * Dispatches a block to its per-type editor (§3.7). Three types are bespoke — code, media,
 * links — and delegate to their own components; the rest (heading, paragraph, list, quote,
 * divider) are simple enough to render inline here from their shape.
 *
 * Paragraph / list / quote / heading text is a *constrained inline markdown subset* — bold,
 * italic, inline code, links, no HTML (§3.7) — surfaced in helper text so the author knows
 * what formatting is available and that raw HTML is never stored.
 */
import { Alert, FormControlLabel, MenuItem, Stack, Switch, TextField } from '@mui/material';
import type { Block } from '../../../types/content';
import { INLINE_MARKDOWN_HELP } from '../../../lib/blockRegistry';
import StringListField from '../../forms/StringListField';
import CodeBlockEditor from './CodeBlockEditor';
import MediaBlockEditor from './MediaBlockEditor';
import LinksBlockEditor from './LinksBlockEditor';

interface BlockBodyEditorProps {
  block: Block;
  onChange: (block: Block) => void;
}

export default function BlockBodyEditor({ block, onChange }: BlockBodyEditorProps) {
  switch (block.type) {
    case 'heading':
      return (
        <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
          <TextField
            select
            label="Level"
            size="small"
            value={block.level}
            onChange={(e) =>
              onChange({ ...block, level: Number(e.target.value) as 2 | 3 | 4 })
            }
            sx={{ minWidth: 100 }}
          >
            <MenuItem value={2}>H2</MenuItem>
            <MenuItem value={3}>H3</MenuItem>
            <MenuItem value={4}>H4</MenuItem>
          </TextField>
          <TextField
            label="Text"
            size="small"
            fullWidth
            required
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
          />
        </Stack>
      );

    case 'paragraph':
      return (
        <TextField
          label="Paragraph"
          multiline
          minRows={3}
          fullWidth
          size="small"
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          helperText={INLINE_MARKDOWN_HELP}
        />
      );

    case 'quote':
      return (
        <Stack spacing={2}>
          <TextField
            label="Quote"
            multiline
            minRows={2}
            fullWidth
            size="small"
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            helperText={INLINE_MARKDOWN_HELP}
          />
          <TextField
            label="Attribution (optional)"
            size="small"
            fullWidth
            value={block.attribution ?? ''}
            onChange={(e) => {
              const attribution = e.target.value;
              const next = { ...block };
              if (attribution) next.attribution = attribution;
              else delete next.attribution;
              onChange(next);
            }}
          />
        </Stack>
      );

    case 'list':
      return (
        <Stack spacing={1}>
          <FormControlLabel
            control={
              <Switch
                checked={block.ordered}
                onChange={(e) => onChange({ ...block, ordered: e.target.checked })}
              />
            }
            label="Ordered (numbered) list"
          />
          <StringListField
            label="Items"
            value={block.items}
            onChange={(items) => onChange({ ...block, items })}
          />
          <Alert severity="info" variant="outlined" sx={{ mt: 1 }}>
            {INLINE_MARKDOWN_HELP}
          </Alert>
        </Stack>
      );

    case 'code':
      return <CodeBlockEditor block={block} onChange={onChange} />;

    case 'media':
      return <MediaBlockEditor block={block} onChange={onChange} />;

    case 'links':
      return <LinksBlockEditor block={block} onChange={onChange} />;

    case 'divider':
      return (
        <Alert severity="info" variant="outlined">
          A horizontal divider. Nothing to configure.
        </Alert>
      );

    default:
      return null;
  }
}
