'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

/**
 * Stamps `data-theme` on the root element. The CSS is written so an explicit
 * stamp beats the OS preference in both directions.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const stored = window.localStorage.getItem('theme') as Theme | null;
    if (stored) setTheme(stored);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
      window.localStorage.removeItem('theme');
    } else {
      root.setAttribute('data-theme', theme);
      window.localStorage.setItem('theme', theme);
    }
  }, [theme]);

  const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
  const glyph: Record<Theme, string> = { system: '◐', light: '☀', dark: '☾' };

  return (
    <button
      type="button"
      onClick={() => setTheme(next[theme])}
      className="rounded-md border border-hairline px-2 py-1 text-xs text-ink-secondary hover:text-ink"
      title={`Theme: ${theme}. Click for ${next[theme]}.`}
    >
      <span aria-hidden>{glyph[theme]}</span>
      <span className="sr-only">Switch theme (currently {theme})</span>
    </button>
  );
}
