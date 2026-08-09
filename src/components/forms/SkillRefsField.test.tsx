import { useState } from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import apiClient from '../../api/apiClient';
import SkillRefsField from './SkillRefsField';
import ItemEditDialog from '../sections/ItemEditDialog';
import { SECTION_TYPES } from '../../lib/sectionRegistry';
import { getIdToken } from '../../lib/cognitoClient';

vi.mock('../../lib/cognitoClient');
vi.mocked(getIdToken).mockResolvedValue('test-token');

const mock = new MockAdapter(apiClient);
const ok = <T,>(data: T) => ({ status: 'ok', error: false, data });

/** Two pages: p1 owns a visible skills section (React visible, Vue item-hidden, Node visible)
 *  plus a portfolio section (to prove non-skills sections are filtered out); p2 owns a
 *  HIDDEN skills section (Postgres). */
const PAGES = [
  { id: 'p1', slug: 'home' },
  { id: 'p2', slug: 'work' },
];

const P1_SECTIONS = [
  {
    id: 's1',
    page_id: 'p1',
    type: 'skills',
    position: 0,
    is_hidden: false,
    updated_at: 't',
    items: [
      { id: 'sk-react', position: 0, is_hidden: false, updated_at: 't', data: { title: 'React', icon_source: 'https://cdn.example.com/react.svg' } },
      { id: 'sk-vue', position: 1, is_hidden: true, updated_at: 't', data: { title: 'Vue', icon_source: 'https://cdn.example.com/vue.svg' } },
      { id: 'sk-node', position: 2, is_hidden: false, updated_at: 't', data: { title: 'Node.js', icon_source: 'https://cdn.example.com/node.svg' } },
    ],
  },
  {
    id: 's2',
    page_id: 'p1',
    type: 'portfolio',
    position: 1,
    is_hidden: false,
    updated_at: 't',
    items: [{ id: 'proj-1', position: 0, is_hidden: false, updated_at: 't', data: { title: 'A project' } }],
  },
];

const P2_SECTIONS = [
  {
    id: 's3',
    page_id: 'p2',
    type: 'skills',
    position: 0,
    is_hidden: true,
    updated_at: 't',
    items: [{ id: 'sk-pg', position: 0, is_hidden: false, updated_at: 't', data: { title: 'Postgres', icon_source: 'https://cdn.example.com/pg.svg' } }],
  },
];

beforeEach(() => {
  mock.onGet('/api/admin/pages').reply(200, ok({ pages: PAGES }));
  mock.onGet('/api/admin/sections').reply((config) => {
    const pageId = config.params?.page_id;
    if (pageId === 'p1') return [200, ok({ sections: P1_SECTIONS })];
    if (pageId === 'p2') return [200, ok({ sections: P2_SECTIONS })];
    return [200, ok({ sections: [] })];
  });
});

afterEach(() => {
  mock.reset();
  vi.clearAllMocks();
  vi.mocked(getIdToken).mockResolvedValue('test-token');
});

/** Stateful wrapper so reorder/remove/add reflect in the controlled `value`. */
function Harness({ initial, onChange }: { initial: string[]; onChange: (v: string[]) => void }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <SkillRefsField
      label="Tech (from Skills)"
      value={value}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
    />
  );
}

describe('SkillRefsField (Skill Refs v1.8)', () => {
  it('resolves referenced ids to the skill title + icon', async () => {
    render(<Harness initial={['sk-react']} onChange={vi.fn()} />);
    expect(await screen.findByText('React')).toBeInTheDocument();
    expect(screen.getByAltText('React')).toHaveAttribute('src', 'https://cdn.example.com/react.svg');
  });

  it('Add skill… lists only not-yet-referenced skills, searchable by title, and appends the id', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={['sk-react']} onChange={onChange} />);

    // Wait for the catalog to load (React chip resolved) so the button is enabled.
    await screen.findByText('React');
    await user.click(screen.getByRole('button', { name: /add skill/i }));

    // Already-referenced React is absent from the menu; Node.js and (hidden) Postgres are present.
    expect(screen.queryByRole('button', { name: 'Add React' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Node.js' })).toBeInTheDocument();

    // Search narrows by title.
    await user.type(screen.getByLabelText(/search skills/i), 'node');
    expect(screen.queryByRole('button', { name: 'Add Postgres' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add Node.js' }));
    expect(onChange).toHaveBeenLastCalledWith(['sk-react', 'sk-node']);
  });

  it('remove drops the ref', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={['sk-react']} onChange={onChange} />);

    await user.click(await screen.findByRole('button', { name: 'Remove React' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('up/down controls reorder (selection order = render order)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={['sk-react', 'sk-node']} onChange={onChange} />);

    await user.click(await screen.findByRole('button', { name: 'Move Node.js up' }));
    expect(onChange).toHaveBeenLastCalledWith(['sk-node', 'sk-react']);
  });

  it('an unresolvable ref renders a removable error chip', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={['sk-ghost']} onChange={onChange} />);

    expect(await screen.findByText(/unknown skill — will block publish/i)).toBeInTheDocument();
    // Still removable so a broken ref can be fixed.
    await user.click(screen.getByRole('button', { name: /remove sk-ghost/i }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('a ref to a hidden skill (or hidden section) renders a warning chip', async () => {
    render(<Harness initial={['sk-vue', 'sk-pg']} onChange={vi.fn()} />);
    // sk-vue = hidden item, sk-pg = item under a hidden section — both warn.
    const warnings = await screen.findAllByText(/hidden — will block publish/i);
    expect(warnings).toHaveLength(2);
    expect(screen.getByText('Vue')).toBeInTheDocument();
    expect(screen.getByText('Postgres')).toBeInTheDocument();
  });

  it('the portfolio item dialog stays saveable with an empty skill_refs list', async () => {
    const fields = SECTION_TYPES.portfolio.itemFields ?? [];
    render(
      <ItemEditDialog
        open
        title="Add project"
        fields={fields}
        initialData={{ title: 'T', intro: '', description: 'D', media_id: 'm1', skill_refs: [], links: [] }}
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // No skills referenced yet, and the dialog is still saveable — publish is the gate, not draft save.
    expect(await screen.findByText(/no skills referenced yet/i)).toBeInTheDocument();
    const save = screen.getByRole('button', { name: /^save$/i });
    await waitFor(() => expect(save).toBeEnabled());
  });
});
