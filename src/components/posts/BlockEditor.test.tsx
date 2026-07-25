import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BlockEditor from './BlockEditor';
import { BLOCK_TYPE_LIST } from '../../lib/blockRegistry';
import type { Block } from '../../types/content';

describe('BlockEditor — add-block menu covers all 8 types (§3.7)', () => {
  it('offers every block type in the add menu', async () => {
    const user = userEvent.setup();
    render(<BlockEditor value={[]} onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /add block/i }));
    const menu = screen.getByRole('menu');
    for (const def of BLOCK_TYPE_LIST) {
      expect(within(menu).getByText(def.label)).toBeInTheDocument();
    }
    expect(BLOCK_TYPE_LIST).toHaveLength(8);
  });

  it('appends a fresh block of the chosen type via onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<BlockEditor value={[]} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /add block/i }));
    await user.click(within(screen.getByRole('menu')).getByText('Code'));

    expect(onChange).toHaveBeenCalledWith([{ type: 'code', language: 'text', code: '' }]);
  });

  it('shows the empty state when there are no blocks', () => {
    render(<BlockEditor value={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/no blocks yet/i)).toBeInTheDocument();
  });
});

describe('BlockEditor — delete removes a block (§3.7)', () => {
  it('deletes the targeted block via onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const value: Block[] = [
      { type: 'heading', level: 2, text: 'A' },
      { type: 'paragraph', text: 'B' },
    ];
    render(<BlockEditor value={value} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Delete block 1' }));
    expect(onChange).toHaveBeenCalledWith([{ type: 'paragraph', text: 'B' }]);
  });

  it('renders a drag handle for each block (reorder is drag-and-drop, §14.4)', () => {
    const value: Block[] = [
      { type: 'heading', level: 2, text: 'A' },
      { type: 'divider' },
    ];
    render(<BlockEditor value={value} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Drag to reorder block 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drag to reorder block 2' })).toBeInTheDocument();
  });
});

describe('BlockEditor — bespoke per-type editors (§3.7)', () => {
  it('code block renders a language select, filename field, and monospace code area', () => {
    render(
      <BlockEditor value={[{ type: 'code', language: 'typescript', code: '' }]} onChange={vi.fn()} />,
    );
    expect(screen.getAllByText('Language').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/filename/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Code').length).toBeGreaterThan(0);
  });

  it('media block renders the MediaPicker entry point (Choose…)', () => {
    render(<BlockEditor value={[{ type: 'media', media_id: '' }]} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /choose/i })).toBeInTheDocument();
    expect(screen.getAllByText(/caption/i).length).toBeGreaterThan(0);
  });

  it('links block reuses the Link[] editor', () => {
    render(<BlockEditor value={[{ type: 'links', links: [] }]} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /add link/i })).toBeInTheDocument();
  });

  it('paragraph block notes the constrained inline-markdown subset (no HTML)', () => {
    render(<BlockEditor value={[{ type: 'paragraph', text: '' }]} onChange={vi.fn()} />);
    expect(screen.getByText(/constrained markdown subset/i)).toBeInTheDocument();
    expect(screen.getByText(/No HTML/i)).toBeInTheDocument();
  });
});
