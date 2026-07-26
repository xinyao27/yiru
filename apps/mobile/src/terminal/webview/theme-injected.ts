// Why: the terminal document paints before React can deliver its live theme;
// this bootstrap value prevents a white WebView flash, then set-theme takes over.
export const TERMINAL_BOOTSTRAP_BACKGROUND = '#1a1b26'

// Theme normalization and page-surface painting injected into the WebView IIFE.
export const TERMINAL_WEBVIEW_THEME_JS = `
  function normalizeTerminalTheme(input) {
    var source = input && typeof input === 'object' && input.theme && typeof input.theme === 'object'
      ? input.theme
      : null;
    if (!source) return defaultTheme;
    var next = {};
    var keys = Object.keys(defaultTheme);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (typeof source[key] === 'string') next[key] = source[key];
    }
    return Object.assign({}, defaultTheme, next);
  }

  function applyTerminalTheme(input) {
    terminalThemeInput = input;
    terminalTheme = normalizeTerminalTheme(input);
    var background = terminalTheme.background || '${TERMINAL_BOOTSTRAP_BACKGROUND}';
    document.documentElement.style.background = background;
    document.body.style.background = background;
    if (term) term.options.theme = terminalTheme;
  }
`
