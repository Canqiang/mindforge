/**
 * Theme registry. The single source of truth for which `doc.theme` values
 * the UI knows how to render. CSS variable overrides live in `default.css`
 * under `:root[data-theme='<id>']` selectors.
 */
export interface ThemeDefinition {
  id: string;
  label: string;
  description: string;
}

export const THEMES: readonly ThemeDefinition[] = [
  {
    id: 'default',
    label: 'Default',
    description: 'Clean panels with a blue accent.'
  },
  {
    id: 'mono',
    label: 'Mono',
    description: 'Monochrome ink-grey, no chromatic accent.'
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Hair-line borders, pure white panels.'
  }
] as const;

const KNOWN_THEME_IDS = new Set(THEMES.map((theme) => theme.id));

export function isKnownTheme(themeId: string | undefined | null): boolean {
  return typeof themeId === 'string' && KNOWN_THEME_IDS.has(themeId);
}

/**
 * Coerce an arbitrary stored theme id back to a known one. Unknown values
 * (e.g. a doc saved by a future version of the editor) fall back to 'default'
 * so the UI never renders without theme variables.
 */
export function resolveTheme(themeId: string | undefined | null): string {
  return isKnownTheme(themeId) ? (themeId as string) : 'default';
}
