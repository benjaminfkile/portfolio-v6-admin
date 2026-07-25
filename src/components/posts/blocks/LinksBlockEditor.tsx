/**
 * Bespoke editor for the `links` block (§3.7). Reuses the single {@link LinkEditor}
 * component — the same one the portfolio item form uses (§3.4) — so a project's links and a
 * post's links block share one implementation, validation, and drag-reorder behaviour.
 */
import type { Block } from '../../../types/content';
import type { Link } from '../../../types/content';
import LinkEditor from '../../forms/LinkEditor';

type LinksBlock = Extract<Block, { type: 'links' }>;

interface LinksBlockEditorProps {
  block: LinksBlock;
  onChange: (block: LinksBlock) => void;
}

export default function LinksBlockEditor({ block, onChange }: LinksBlockEditorProps) {
  return (
    <LinkEditor
      value={block.links}
      onChange={(links: Link[]) => onChange({ ...block, links })}
    />
  );
}
