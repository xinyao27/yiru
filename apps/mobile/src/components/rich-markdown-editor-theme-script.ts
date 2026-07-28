export const MOBILE_RICH_MARKDOWN_EDITOR_THEME_SCRIPT = `
      function setTheme(nextTheme) {
        if (!nextTheme || typeof nextTheme !== 'object') return;
        var root = document.documentElement;
        function setValue(name, value) {
          if (typeof value === 'string' && value) root.style.setProperty(name, value);
        }
        function setPixels(name, value) {
          if (typeof value === 'number' && Number.isFinite(value)) {
            root.style.setProperty(name, String(value) + 'px');
          }
        }
        setValue('--background', nextTheme.background);
        setValue('--editor-surface', nextTheme.background);
        setValue('--foreground', nextTheme.foreground);
        setValue('--muted-foreground', nextTheme.mutedForeground);
        setValue('--muted', nextTheme.muted);
        setValue('--border', nextTheme.border);
        setValue('--primary', nextTheme.foreground);
        setValue('--primary-foreground', nextTheme.background);
        setValue('--accent-link', nextTheme.primary);
        setValue('--font-mono', nextTheme.monoFamily);
        setPixels('--body-font-size', nextTheme.bodyFontSize);
        setPixels('--body-line-height', nextTheme.bodyLineHeight);
        setPixels('--code-font-size', nextTheme.codeFontSize);
        setPixels('--radius-sm', nextTheme.radiusSmall);
        setPixels('--radius-md', nextTheme.radiusMedium);
        setPixels('--spacing-1', nextTheme.spacing1);
        setPixels('--spacing-2', nextTheme.spacing2);
        setPixels('--spacing-3', nextTheme.spacing3);
        setPixels('--spacing-4', nextTheme.spacing4);
        if (nextTheme.colorScheme === 'light' || nextTheme.colorScheme === 'dark') {
          root.style.colorScheme = nextTheme.colorScheme;
        }
      }
`
