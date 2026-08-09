import { describe, it, expect } from 'vitest';
import { SECTION_TYPES, getSectionTypeDef } from './sectionRegistry';

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
