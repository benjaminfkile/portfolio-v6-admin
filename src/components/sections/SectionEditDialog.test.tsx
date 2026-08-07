import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SectionEditDialog from './SectionEditDialog';
import ItemEditDialog from './ItemEditDialog';
import { SECTION_TYPE_LIST, getSectionTypeDef } from '../../lib/sectionRegistry';
import type { AdminSection } from '../../types/admin';
import type { SectionType } from '../../types/content';

function makeSection(type: SectionType): AdminSection {
  return {
    id: 's1',
    page_id: 'p1',
    type,
    position: 0,
    is_hidden: false,
    data: {},
    items: [],
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('SectionEditDialog — renders the right fields per section type (§3.4)', () => {
  it.each(SECTION_TYPE_LIST)('renders every registry field for "$type"', (def) => {
    render(
      <SectionEditDialog
        open
        section={makeSection(def.type)}
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // The dialog title names the type.
    expect(screen.getByText(`Edit ${def.label}`)).toBeInTheDocument();

    // Each field in the registry produces a labelled control. (Outlined MUI fields
    // render their label text twice — once as the <label>, once as the fieldset
    // <legend> — so assert on presence rather than a single match.)
    for (const field of def.fields) {
      expect(screen.getAllByText(field.label).length).toBeGreaterThan(0);
    }
  });
});

// Intro v1.6b: every intro-capable section exposes an optional `intro` multiline lead-in
// rendered directly under the heading. about/contact are excluded — their `body` already is
// the text under the heading.
const INTRO_TYPES: SectionType[] = ['timeline', 'skills', 'portfolio', 'duolingo', 'github', 'ops'];

describe('SectionEditDialog — intro field under the heading (Intro v1.6b)', () => {
  it.each(INTRO_TYPES)('exposes an optional multiline "intro" field for "%s"', (type) => {
    const def = getSectionTypeDef(type);
    const headingIdx = def.fields.findIndex((f) => f.key === 'heading');
    const introIdx = def.fields.findIndex((f) => f.key === 'intro');
    const intro = def.fields[introIdx];

    // The key is exactly `intro`, the kind is multiline, and it is optional (schemas are
    // .strict(), so the key must match the zod schema — never a near-miss like `lead`).
    expect(intro).toBeDefined();
    expect(intro.kind).toBe('multiline');
    expect(intro.required).toBeFalsy();
    // Placed directly after the heading field.
    expect(introIdx).toBe(headingIdx + 1);

    render(
      <SectionEditDialog
        open
        section={makeSection(type)}
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Intro').length).toBeGreaterThan(0);
    // Optional, so Save is never gated on it.
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('saves the entered intro text under exactly the key `intro`', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <SectionEditDialog
        open
        section={makeSection('github')}
        saving={false}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Intro'), 'A quick lead-in.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ intro: 'A quick lead-in.' });
  });
});

describe('SectionEditDialog — skills sphere_detail (v1.5)', () => {
  it('exposes an optional sphere_detail field and stays saveable when it is blank', () => {
    const skills = getSectionTypeDef('skills');
    const sphereField = skills.fields.find((f) => f.key === 'sphere_detail');
    expect(sphereField).toBeDefined();
    expect(sphereField!.required).toBeFalsy();
    expect(sphereField!.kind).toBe('number');

    render(
      <SectionEditDialog
        open
        section={makeSection('skills')}
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // The section field surfaces in the editor…
    expect(screen.getAllByText(sphereField!.label).length).toBeGreaterThan(0);
    // …and since it is optional, Save is not gated on it.
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});

describe('SectionEditDialog — save gating', () => {
  it('disables Save while a required field is empty and enables it once filled', () => {
    const onSave = vi.fn();
    // hero requires `title`; start empty → Save disabled.
    render(
      <SectionEditDialog
        open
        section={makeSection('hero')}
        saving={false}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows a saving state on the Save button', () => {
    render(
      <SectionEditDialog
        open
        section={{ ...makeSection('hero'), data: { title: 'Hi' } }}
        saving
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });
});

describe('ItemEditDialog — renders item fields for item-bearing types (§3.4)', () => {
  it('renders skill item fields (title/description/icon + dark icon) with no proficiency input (v1.5)', () => {
    const def = getSectionTypeDef('skills');
    render(
      <ItemEditDialog
        open
        title="Add skill"
        fields={def.itemFields!}
        initialData={{ ...def.defaultItemData }}
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Title').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Description').length).toBeGreaterThan(0);
    // Icons v1.6: the default icon field plus the optional dark-theme override.
    expect(screen.getAllByText('Icon').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dark theme icon').length).toBeGreaterThan(0);
    // Proficiency was removed from the product in v1.5.
    expect(screen.queryByText(/proficiency/i)).not.toBeInTheDocument();
  });

  it('renders portfolio item fields including the Links editor and a media picker', () => {
    const def = getSectionTypeDef('portfolio');
    render(
      <ItemEditDialog
        open
        title="Add project"
        fields={def.itemFields!}
        initialData={{ ...def.defaultItemData }}
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Links')).toBeInTheDocument();
    expect(screen.getByText('Tech icons')).toBeInTheDocument();
    // The media field now opens the reusable MediaPicker (task #446): a "Choose…" button.
    expect(screen.getByRole('button', { name: /choose/i })).toBeInTheDocument();
  });
});
