import { describe, it, expect } from 'vitest';
import { SECTION_TYPES, SECTION_TYPE_LIST, getSectionTypeDef } from './sectionRegistry';

describe('sectionRegistry — portfolio Skill Refs v1.8', () => {
  const portfolio = SECTION_TYPES.portfolio;
  const itemFields = portfolio.itemFields ?? [];

  it('portfolio itemFields carry a skillRefs field, not a tech_icons stringList', () => {
    const skillRefs = itemFields.find((f) => f.key === 'skill_refs');
    expect(skillRefs).toBeDefined();
    expect(skillRefs?.kind).toBe('skillRefs');
    expect(skillRefs?.label).toBe('Tech (from Skills)');
    expect(skillRefs?.helperText).toMatch(/match the sphere/i);

    // The legacy bare-URL stringList is gone entirely.
    expect(itemFields.find((f) => f.key === 'tech_icons')).toBeUndefined();
    expect(itemFields.some((f) => f.kind === 'stringList')).toBe(false);
  });

  it('default portfolio item data seeds an empty skill_refs and drops tech_icons', () => {
    const seed = portfolio.defaultItemData ?? {};
    expect(seed.skill_refs).toEqual([]);
    expect('tech_icons' in seed).toBe(false);
  });

  it('getSectionTypeDef returns the same portfolio descriptor', () => {
    expect(getSectionTypeDef('portfolio')).toBe(portfolio);
  });
});

describe('sectionRegistry — blog Blogs v1.13', () => {
  const blog = SECTION_TYPES.blog;

  it('blog section carries an optional blogSlug field for the blog slug', () => {
    const field = blog.fields.find((f) => f.key === 'blog');
    expect(field).toBeDefined();
    expect(field?.kind).toBe('blogSlug');
    expect(field?.required).toBeFalsy();
    // Helper text warns that a stale slug blocks publish.
    expect(field?.helperText).toMatch(/publish fails if the selected blog slug no longer exists/i);
  });

  it('keeps the existing limit and tag controls alongside mode/page_size and the blog field', () => {
    // task #103: mode comes first so the teaser/index switch is the first knob; limit and
    // page_size are alternative teaser/index-only knobs sitting under it.
    expect(blog.fields.map((f) => f.key)).toEqual([
      'mode',
      'limit',
      'page_size',
      'blog',
      'tag',
    ]);
  });
});

describe('sectionRegistry — blog teaser/index mode (task #103)', () => {
  const blog = SECTION_TYPES.blog;

  it('exposes a required mode select with teaser and index options', () => {
    const mode = blog.fields.find((f) => f.key === 'mode');
    expect(mode).toBeDefined();
    expect(mode?.kind).toBe('select');
    expect(mode?.required).toBe(true);
    expect(mode?.options?.map((o) => o.value)).toEqual(['teaser', 'index']);
  });

  it('defaults a freshly created section to teaser mode', () => {
    expect(blog.defaultData).toMatchObject({ mode: 'teaser' });
  });

  it('hides limit in index mode and page_size in teaser mode via showWhen', () => {
    const limit = blog.fields.find((f) => f.key === 'limit');
    const pageSize = blog.fields.find((f) => f.key === 'page_size');
    // Teaser-only: also visible when mode is absent so pre-mode sections open unchanged.
    expect(limit?.showWhen).toEqual({ key: 'mode', values: ['teaser', undefined] });
    expect(pageSize?.showWhen).toEqual({ key: 'mode', values: ['index'] });
  });
});

describe('sectionRegistry — github GitHub Explorer v1.10', () => {
  const github = SECTION_TYPES.github;

  it('github section fields are heading + intro only (obsolete `weeks` dropped)', () => {
    expect(github.fields.map((f) => f.key)).toEqual(['heading', 'intro']);
    // The v1.2 window control is gone entirely — the client renders the full calendar.
    expect(github.fields.find((f) => f.key === 'weeks')).toBeUndefined();
  });

  it('default github data no longer seeds a weeks window', () => {
    expect('weeks' in github.defaultData).toBe(false);
  });
});

describe('sectionRegistry — resume (live)', () => {
  const resume = SECTION_TYPES.resume;

  it('registers a resume section type with heading + intro and no items', () => {
    expect(resume).toBeDefined();
    expect(resume.type).toBe('resume');
    expect(resume.hasItems).toBe(false);
    expect(resume.itemFields).toBeUndefined();
    expect(resume.fields.map((f) => f.key)).toEqual(['heading', 'intro']);
    // Intro is a multiline block so admins can drop in a short paragraph.
    const intro = resume.fields.find((f) => f.key === 'intro');
    expect(intro?.kind).toBe('multiline');
  });

  it('is placeable via getSectionTypeDef and appears in the ordered type list', () => {
    expect(getSectionTypeDef('resume')).toBe(resume);
    // Present in the picker list so it is placeable on a page like other live sections.
    expect(SECTION_TYPE_LIST.some((d) => d.type === 'resume')).toBe(true);
  });

  it('carries an empty default data blob (no required config)', () => {
    expect(resume.defaultData).toEqual({});
  });
});
