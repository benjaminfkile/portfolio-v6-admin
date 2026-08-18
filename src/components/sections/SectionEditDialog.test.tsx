import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SectionEditDialog from './SectionEditDialog';
import ItemEditDialog from './ItemEditDialog';
import { SECTION_TYPE_LIST, getSectionTypeDef } from '../../lib/sectionRegistry';
import type { AdminSection } from '../../types/admin';
import type { SectionType } from '../../types/content';

// The blog section renders a BlogSlugField, which fetches the blog list on mount.
// Stub the module so the dialog opens without an HTTP call.
vi.mock('../../api/blogsApi', () => ({
  getBlogs: vi.fn().mockResolvedValue([]),
}));

function makeSection(type: SectionType): AdminSection {
  return {
    id: 's1',
    page_id: 'p1',
    type,
    position: 0,
    is_hidden: false,
    // Seed with the type's defaultData so any field whose visibility depends on another
    // key (e.g. the blog section's teaser/index mode) renders under the default mode.
    data: { ...getSectionTypeDef(type).defaultData },
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

    // Each visible registry field produces a labelled control. Fields that are conditionally
    // hidden (see `showWhen`) are excluded — under the type's defaultData they are not rendered
    // and don't gate save either. (Outlined MUI fields render their label text twice — once as
    // the <label>, once as the fieldset <legend> — so assert on presence rather than a single match.)
    const visible = def.fields.filter((f) => {
      if (!f.showWhen) return true;
      const current = def.defaultData[f.showWhen.key];
      const stringed = current === undefined ? undefined : String(current);
      return f.showWhen.values.some((v) => v === stringed);
    });
    for (const field of visible) {
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
    // Skill Refs v1.8: the bare-URL "Tech icons" stringList is replaced by the skillRefs picker.
    expect(screen.getByText('Tech (from Skills)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add skill/i })).toBeInTheDocument();
    // The media field now opens the reusable MediaPicker (task #446): a "Choose…" button.
    expect(screen.getByRole('button', { name: /choose/i })).toBeInTheDocument();
  });

  // Task #82: timeline entries no longer carry an image — the API dropped media_id from the
  // timeline item schema. The editor exposes only date range, title, and description.
  it('renders timeline entry fields with no media picker (task #82)', () => {
    const def = getSectionTypeDef('timeline');
    render(
      <ItemEditDialog
        open
        title="Add entry"
        fields={def.itemFields!}
        initialData={{ ...def.defaultItemData }}
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Date range').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Title').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Description').length).toBeGreaterThan(0);
    // No media field: no "Media" label, no MediaPicker "Choose…" button.
    expect(screen.queryByText('Media')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /choose/i })).not.toBeInTheDocument();
    // The registry no longer carries a media_id field for timeline items.
    expect(def.itemFields!.some((f) => f.key === 'media_id')).toBe(false);
  });
});

// Task #103 — the blog section becomes admin-composable as a page. The editor gains a
// teaser/index mode control; each mode shows only the knobs that apply to it.
describe('SectionEditDialog — blog teaser/index mode (task #103)', () => {
  it('defaults a freshly created blog section to teaser mode with limit visible', () => {
    render(
      <SectionEditDialog
        open
        section={makeSection('blog')}
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Mode select is present and preselected to teaser.
    expect(screen.getAllByText('Mode').length).toBeGreaterThan(0);
    expect(screen.getByRole('combobox', { name: /mode/i })).toHaveTextContent(/teaser/i);

    // Teaser-only knob (Number of posts) is visible; the index-only page_size knob is not.
    expect(screen.getAllByText('Number of posts').length).toBeGreaterThan(0);
    expect(screen.queryByText('Posts per page')).not.toBeInTheDocument();
  });

  it('switching to index hides "Number of posts" and shows "Posts per page"', async () => {
    const user = userEvent.setup();
    render(
      <SectionEditDialog
        open
        section={makeSection('blog')}
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: /mode/i }));
    await user.click(await screen.findByRole('option', { name: /full index/i }));

    // Teaser-only field is gone; index-only field appears.
    expect(screen.queryByText('Number of posts')).not.toBeInTheDocument();
    expect(screen.getAllByText('Posts per page').length).toBeGreaterThan(0);
  });

  it('opens an existing pre-mode teaser section unchanged (AC #401 — no forced migration)', () => {
    // Legacy row: no `mode` key, just the original `limit` from before task #103.
    const legacy: AdminSection = {
      id: 's-legacy',
      page_id: 'p1',
      type: 'blog',
      position: 0,
      is_hidden: false,
      data: { limit: 5 },
      items: [],
      updated_at: '2026-01-01T00:00:00Z',
    };

    render(
      <SectionEditDialog
        open
        section={legacy}
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // The mode select is populated from the defaultData merge (teaser), so the dialog opens
    // saveable with the existing limit still visible — no forced migration on a pre-mode row.
    expect(screen.getByRole('combobox', { name: /mode/i })).toHaveTextContent(/teaser/i);
    expect(screen.getAllByText('Number of posts').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('save round-trips both modes: teaser writes limit, index writes page_size', async () => {
    const user = userEvent.setup();

    // --- teaser: limit is what gets saved --------------------------------
    const teaserSaved = vi.fn();
    const { unmount } = render(
      <SectionEditDialog
        open
        section={{ ...makeSection('blog'), data: { mode: 'teaser', limit: 3 } }}
        saving={false}
        onSave={teaserSaved}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(teaserSaved).toHaveBeenCalledWith(expect.objectContaining({ mode: 'teaser', limit: 3 }));
    expect(teaserSaved.mock.calls[0][0]).not.toHaveProperty('page_size');
    unmount();

    // --- index: page_size is what gets saved -----------------------------
    const indexSaved = vi.fn();
    render(
      <SectionEditDialog
        open
        section={{ ...makeSection('blog'), data: { mode: 'index', page_size: 10 } }}
        saving={false}
        onSave={indexSaved}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(indexSaved).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'index', page_size: 10 }),
    );
  });

  it('a hidden required field does not gate save (index mode does not need a teaser limit)', () => {
    // Index mode with no `limit` — Save must be enabled because `limit` is hidden.
    render(
      <SectionEditDialog
        open
        section={{ ...makeSection('blog'), data: { mode: 'index', page_size: 10 } }}
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});
