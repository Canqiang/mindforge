import { describe, expect, it } from 'vitest';
import { isKnownTheme, resolveTheme, THEMES } from './themes';

describe('theme registry', () => {
  it('exposes default / mono / minimal as known themes', () => {
    expect(THEMES.map((theme) => theme.id)).toEqual(['default', 'mono', 'minimal']);
    expect(THEMES.every((theme) => theme.label.length > 0)).toBe(true);
  });

  it('isKnownTheme matches the registry exactly', () => {
    for (const theme of THEMES) {
      expect(isKnownTheme(theme.id)).toBe(true);
    }
    expect(isKnownTheme('does-not-exist')).toBe(false);
    expect(isKnownTheme(null)).toBe(false);
    expect(isKnownTheme(undefined)).toBe(false);
    expect(isKnownTheme('')).toBe(false);
  });

  it('resolveTheme falls back to default on unknown ids', () => {
    expect(resolveTheme('mono')).toBe('mono');
    expect(resolveTheme('minimal')).toBe('minimal');
    expect(resolveTheme('future-theme-from-v2-doc')).toBe('default');
    expect(resolveTheme(null)).toBe('default');
    expect(resolveTheme(undefined)).toBe('default');
  });
});
