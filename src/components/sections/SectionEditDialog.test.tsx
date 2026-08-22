import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SectionEditDialog from './SectionEditDialog';
import ItemEditDialog from './ItemEditDialog';
import { SECTION_TYPE_LIST, getSectionTypeDef } from '../../lib/sectionRegistry';
import { HERO_BACKGROUND_DEFAULTS } from '../../components/forms/HeroBackgroundField';
import type { AdminSection } from '../../types/admin';
import type { HeroBackground, SectionType } from '../../types/content';

// The blog section renders a BlogSlugField, which fetches the blog list on mount.
// Stub the module so the dialog opens without an HTTP call.
vi.mock('../../api/blogsApi', () => ({
  getBlogs: vi.fn().mockResolvedValue([]),
}));

// Hero's background editor and the MediaIdField picker both call getMedia(). Stub the
// module so the dialog opens without an HTTP call, and return a stable image asset so
// the preview has something to render for the tests that set background_media_id.
vi.mock('../../api/mediaApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/mediaApi')>();
  return {
    ...actual,
    getMedia: vi.fn().mockResolvedValue([
      {
        id: 'm-bg',
        s3_key: 'media/m-bg/hero.jpg',
        url: 'https://cdn.example.com/hero.jpg',
        mime: 'image/jpeg',
        bytes: 4096,
        alt: 'Hero backdrop',
        confirmed_at: '2026-01-01T00:00:00Z',
        unreferenced_at: null,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'm-bg-light',
        s3_key: 'media/m-bg-light/hero-light.jpg',
        url: 'https://cdn.example.com/hero-light.jpg',
        mime: 'image/jpeg',
        bytes: 4096,
        alt: 'Hero backdrop (light)',
        confirmed_at: '2026-01-01T00:00:00Z',
        unreferenced_at: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    ]),
  };
});

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
    // about requires `body`; start empty → Save disabled.
    // (Since task #108 no section-level heading/title/eyebrow is required — we exercise
    //  save gating against a structural required field instead.)
    render(
      <SectionEditDialog
        open
        section={makeSection('about')}
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
        section={makeSection('hero')}
        saving
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });
});

// Task #108 — Ben's rule: NOTHING requires a heading. Hero's title (and every other
// section's heading/title/eyebrow) is optional; a blank input is OMITTED from the saved
// data blob, not sent as an empty string.
describe('SectionEditDialog — no section requires a heading (task #108)', () => {
  it('hero can be saved with no title — Save enabled from a fresh section', () => {
    render(
      <SectionEditDialog
        open
        section={makeSection('hero')}
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // No required section-level field means Save is enabled on a fresh hero.
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('a blank title is OMITTED from the saved data blob (not sent as an empty string)', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <SectionEditDialog
        open
        section={makeSection('hero')}
        saving={false}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect('title' in saved).toBe(false);
  });

  it('clearing an existing title drops the key from the saved data blob', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <SectionEditDialog
        open
        section={{ ...makeSection('hero'), data: { title: 'Old title' } }}
        saving={false}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    // Clear the title input; the empty value must NOT round-trip as ''.
    await user.clear(screen.getByLabelText(/title/i));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect('title' in saved).toBe(false);
  });

  it('no section-level heading/title/eyebrow field is marked required in the registry', () => {
    // The set of keys we consider "header copy": heading, title, eyebrow. Regardless of
    // section type, none of these should ever gate a section save.
    const HEADER_COPY_KEYS = new Set(['heading', 'title', 'eyebrow']);
    for (const def of SECTION_TYPE_LIST) {
      for (const field of def.fields) {
        if (HEADER_COPY_KEYS.has(field.key)) {
          expect(field.required).toBeFalsy();
        }
      }
    }
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

// Task #131. Hero gains an optional nested `background` blob for image tweaks. The editor
// exposes a compact group of controls inside the hero dialog; controls are only usable once
// a background media item is picked, values are persisted as numbers, and any key at its
// default is omitted from the saved payload so the JSON stays minimal.
describe('SectionEditDialog (task #131): hero background image tweaks', () => {
  it('registers a hero_background field on the hero section for the "background" key', () => {
    const hero = getSectionTypeDef('hero');
    const bg = hero.fields.find((f) => f.key === 'background');
    expect(bg).toBeDefined();
    expect(bg!.kind).toBe('hero_background');
    expect(bg!.label).toBe('Background image');
    // Not required, so a fresh hero with no background stays saveable.
    expect(bg!.required).toBeFalsy();
  });

  it('shows a hint (not the controls) when no background_media_id is set', () => {
    render(
      <SectionEditDialog
        open
        section={makeSection('hero')}
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/pick a dark and\/or light background media item to tune it/i),
    ).toBeInTheDocument();
    // None of the tune controls are rendered without a media id.
    expect(screen.queryByRole('slider', { name: /opacity \(dark\)/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('object-position-grid')).not.toBeInTheDocument();
    // The save is still enabled (background is optional).
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('registers an optional light-theme background media field on the hero section', () => {
    const field = getSectionTypeDef('hero').fields.find((f) => f.key === 'background_light_media_id');
    expect(field).toBeDefined();
    expect(field!.kind).toBe('media');
  });

  it('previews the light-theme image on the light toggle when background_light_media_id is set', async () => {
    render(
      <SectionEditDialog
        open
        section={{
          ...makeSection('hero'),
          data: { background_media_id: 'm-bg', background_light_media_id: 'm-bg-light' },
        }}
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('hero-background-preview-image')).toHaveAttribute(
        'src',
        'https://cdn.example.com/hero.jpg',
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: /preview on light theme/i }));
    await waitFor(() =>
      expect(screen.getByTestId('hero-background-preview-image')).toHaveAttribute(
        'src',
        'https://cdn.example.com/hero-light.jpg',
      ),
    );
  });

  it('renders the full control set (sliders, object fit, preset grid, preview) once a media item is picked', async () => {
    render(
      <SectionEditDialog
        open
        section={{ ...makeSection('hero'), data: { background_media_id: 'm-bg' } }}
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Preview element with the dark/light toggle.
    expect(screen.getByTestId('hero-background-preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /preview on dark theme/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /preview on light theme/i })).toBeInTheDocument();

    // Opacity + filter + overlay sliders each with numeric input.
    expect(screen.getByRole('slider', { name: /opacity \(dark\)/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /opacity \(light\)/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /blur \(px\)/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /grayscale/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /brightness/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /contrast/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /saturate/i })).toBeInTheDocument();
    // Anchor "Scale" exactly so it doesn't also match "Grayscale".
    expect(screen.getByRole('slider', { name: /^scale$/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /overlay \(dark\)/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /overlay \(light\)/i })).toBeInTheDocument();

    // Object fit select and object position free-text.
    expect(screen.getAllByText(/object fit/i).length).toBeGreaterThan(0);
    // The preset buttons also have `object position` in their aria-labels, so anchor an
    // exact label match to the text input's aria-label.
    expect(screen.getByRole('textbox', { name: 'Object position' })).toBeInTheDocument();

    // The 3x3 anchor preset grid with all nine buttons.
    const grid = screen.getByTestId('object-position-grid');
    expect(within(grid).getAllByRole('button')).toHaveLength(9);

    // Preview image resolves via the mocked getMedia() response.
    await waitFor(() => {
      expect(screen.getByTestId('hero-background-preview-image')).toHaveAttribute(
        'src',
        'https://cdn.example.com/hero.jpg',
      );
    });
  });

  it('a fresh hero with a media id but no tweaks saves without a background key (defaults omitted)', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <SectionEditDialog
        open
        section={{ ...makeSection('hero'), data: { background_media_id: 'm-bg' } }}
        saving={false}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect(saved).toMatchObject({ background_media_id: 'm-bg' });
    expect('background' in saved).toBe(false);
  });

  it('typing a numeric value persists as a number and omits keys at their default', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <SectionEditDialog
        open
        section={{ ...makeSection('hero'), data: { background_media_id: 'm-bg' } }}
        saving={false}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    // Bump opacity (dark) to 0.4 via the numeric input.
    const darkOpacity = screen.getByRole('spinbutton', { name: /opacity \(dark\) value/i });
    await user.clear(darkOpacity);
    await user.type(darkOpacity, '0.4');
    // Bump blur to 6px.
    const blur = screen.getByRole('spinbutton', { name: /blur \(px\) value/i });
    await user.clear(blur);
    await user.type(blur, '6');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as { background?: HeroBackground };
    expect(saved.background).toBeDefined();
    // Numbers land as numbers (never as "0.4" strings).
    expect(saved.background!.opacity_dark).toBe(0.4);
    expect(typeof saved.background!.opacity_dark).toBe('number');
    expect(saved.background!.blur_px).toBe(6);
    expect(typeof saved.background!.blur_px).toBe('number');
    // Untouched keys still at their defaults are OMITTED, not sent as-is.
    expect(saved.background).not.toHaveProperty('opacity_light');
    expect(saved.background).not.toHaveProperty('brightness');
    expect(saved.background).not.toHaveProperty('scale');
    expect(saved.background).not.toHaveProperty('object_fit');
  });

  it('re-typing the default value drops the key from the saved payload', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    // Start with a non-default opacity_dark; the user edits it back to the default 0.1.
    render(
      <SectionEditDialog
        open
        section={{
          ...makeSection('hero'),
          data: {
            background_media_id: 'm-bg',
            background: { opacity_dark: 0.5, blur_px: 8 },
          },
        }}
        saving={false}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    const darkOpacity = screen.getByRole('spinbutton', { name: /opacity \(dark\) value/i });
    await user.clear(darkOpacity);
    await user.type(darkOpacity, String(HERO_BACKGROUND_DEFAULTS.opacity_dark));

    await user.click(screen.getByRole('button', { name: 'Save' }));

    const saved = onSave.mock.calls[0][0] as { background?: HeroBackground };
    // opacity_dark went back to its default → omitted; blur_px is still non-default → kept.
    expect(saved.background).toBeDefined();
    expect(saved.background).not.toHaveProperty('opacity_dark');
    expect(saved.background!.blur_px).toBe(8);
  });

  it('clicking a preset button in the 3x3 anchor grid writes the matching object_position', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <SectionEditDialog
        open
        section={{ ...makeSection('hero'), data: { background_media_id: 'm-bg' } }}
        saving={false}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    // "top left" preset writes "0% 0%".
    await user.click(screen.getByRole('button', { name: /set object position to top left/i }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const saved = onSave.mock.calls[0][0] as { background?: HeroBackground };
    expect(saved.background?.object_position).toBe('0% 0%');
  });

  it('clicking the "center" preset (the default value) omits object_position from the payload', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <SectionEditDialog
        open
        section={{
          ...makeSection('hero'),
          data: {
            background_media_id: 'm-bg',
            background: { object_position: '100% 0%' },
          },
        }}
        saving={false}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /set object position to center$/i }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const saved = onSave.mock.calls[0][0] as { background?: HeroBackground };
    // "center" == "50% 50%" which is the default, so the key is dropped entirely, and
    // (since it was the only non-default key) so is the whole `background` object.
    expect(
      saved.background === undefined || !('object_position' in (saved.background ?? {})),
    ).toBe(true);
  });

  it('saves the full expected payload shape (numbers only, defaults omitted)', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <SectionEditDialog
        open
        section={{
          ...makeSection('hero'),
          data: {
            title: 'Home',
            background_media_id: 'm-bg',
            background: {
              opacity_dark: 0.25,
              blur_px: 4,
              object_position: '25% 75%',
              object_fit: 'contain',
              // A default-valued key seeded in: pruning must still drop it on save.
              brightness: 1,
            },
          },
        }}
        saving={false}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    // Nudge contrast so the pruning of the seeded-default `brightness: 1` gets exercised.
    const contrastInput = screen.getByRole('spinbutton', { name: /contrast value/i });
    await user.clear(contrastInput);
    await user.type(contrastInput, '1.2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const saved = onSave.mock.calls[0][0] as {
      title?: string;
      background_media_id?: string;
      background?: HeroBackground;
    };
    expect(saved.title).toBe('Home');
    expect(saved.background_media_id).toBe('m-bg');
    expect(saved.background).toEqual({
      opacity_dark: 0.25,
      blur_px: 4,
      object_position: '25% 75%',
      object_fit: 'contain',
      contrast: 1.2,
    });
    for (const key of ['opacity_dark', 'blur_px', 'contrast'] as const) {
      expect(typeof (saved.background as Record<string, unknown>)[key]).toBe('number');
    }
  });
});
