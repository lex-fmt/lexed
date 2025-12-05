import * as monaco from 'monaco-editor';

export type ThemeMode = 'dark' | 'light';

type ColorKey = 'normal' | 'muted' | 'faint' | 'faintest' | 'background' | 'lineHighlight';
type MonacoColorPalette = Record<ColorKey, string>;

const CSS_COLOR_VARIABLES: Record<ColorKey, string> = {
  normal: '--monaco-color-normal',
  muted: '--monaco-color-muted',
  faint: '--monaco-color-faint',
  faintest: '--monaco-color-faintest',
  background: '--monaco-editor-background',
  lineHighlight: '--monaco-line-highlight',
};

const FALLBACK_COLORS: Record<ThemeMode, MonacoColorPalette> = {
  light: {
    normal: '#000000',
    muted: '#808080',
    faint: '#b3b3b3',
    faintest: '#cacaca',
    background: '#ffffff',
    lineHighlight: '#f6f6f6',
  },
  dark: {
    normal: '#e0e0e0',
    muted: '#888888',
    faint: '#666666',
    faintest: '#555555',
    background: '#0c0c0cec',
    lineHighlight: '#181818ff',
  },
};

const THEME_NAME = 'lex-monochrome';

type StylesResult = { styles: CSSStyleDeclaration; cleanup?: () => void } | null;

function resolveStylesForMode(mode: ThemeMode): StylesResult {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  const root = document.documentElement;
  if (!root) {
    return null;
  }

  if (root.getAttribute('data-theme') === mode || !document.body) {
    return { styles: getComputedStyle(root) };
  }

  const probe = document.createElement('div');
  probe.setAttribute('data-theme', mode);
  probe.style.position = 'absolute';
  probe.style.width = '0';
  probe.style.height = '0';
  probe.style.pointerEvents = 'none';
  probe.style.visibility = 'hidden';
  probe.style.opacity = '0';
  document.body.appendChild(probe);

  return {
    styles: getComputedStyle(probe),
    cleanup: () => {
      probe.remove();
    },
  };
}

function readColorsFromCss(mode: ThemeMode): MonacoColorPalette {
  const fallback = FALLBACK_COLORS[mode];
  const stylesResult = resolveStylesForMode(mode);

  if (!stylesResult) {
    return { ...fallback };
  }

  const { styles, cleanup } = stylesResult;
  const colors: MonacoColorPalette = { ...fallback };

  (Object.keys(CSS_COLOR_VARIABLES) as Array<keyof MonacoColorPalette>).forEach((key) => {
    const cssVar = CSS_COLOR_VARIABLES[key];
    const value = styles.getPropertyValue(cssVar).trim();
    if (value) {
      colors[key] = value;
    }
  });

  cleanup?.();

  return colors;
}

function defineTheme(mode: ThemeMode) {
  const colors = readColorsFromCss(mode);
  const baseTheme = mode === 'dark' ? 'vs-dark' : 'vs';
  const themeName = `${THEME_NAME}-${mode}`;

  monaco.editor.defineTheme(themeName, {
    base: baseTheme,
    inherit: true,
    rules: [
      {
        token: 'SessionTitleText',
        foreground: colors.normal.replace('#', ''),
        fontStyle: 'bold',
      },
      {
        token: 'DefinitionSubject',
        foreground: colors.normal.replace('#', ''),
        fontStyle: 'italic',
      },
      {
        token: 'DefinitionContent',
        foreground: colors.normal.replace('#', ''),
      },
      {
        token: 'InlineStrong',
        foreground: colors.normal.replace('#', ''),
        fontStyle: 'bold',
      },
      {
        token: 'InlineEmphasis',
        foreground: colors.normal.replace('#', ''),
        fontStyle: 'italic',
      },
      { token: 'InlineCode', foreground: colors.normal.replace('#', '') },
      {
        token: 'InlineMath',
        foreground: colors.normal.replace('#', ''),
        fontStyle: 'italic',
      },
      {
        token: 'VerbatimContent',
        foreground: colors.normal.replace('#', ''),
      },
      { token: 'ListItemText', foreground: colors.normal.replace('#', '') },
      {
        token: 'DocumentTitle',
        foreground: colors.muted.replace('#', ''),
        fontStyle: 'bold',
      },
      {
        token: 'SessionMarker',
        foreground: colors.muted.replace('#', ''),
        fontStyle: 'italic',
      },
      {
        token: 'ListMarker',
        foreground: colors.muted.replace('#', ''),
        fontStyle: 'italic',
      },
      {
        token: 'Reference',
        foreground: colors.muted.replace('#', ''),
        fontStyle: 'underline',
      },
      {
        token: 'ReferenceCitation',
        foreground: colors.muted.replace('#', ''),
        fontStyle: 'underline',
      },
      {
        token: 'ReferenceFootnote',
        foreground: colors.muted.replace('#', ''),
        fontStyle: 'underline',
      },
      { token: 'AnnotationLabel', foreground: colors.faint.replace('#', '') },
      {
        token: 'AnnotationParameter',
        foreground: colors.faint.replace('#', ''),
      },
      {
        token: 'AnnotationContent',
        foreground: colors.faint.replace('#', ''),
      },
      { token: 'VerbatimSubject', foreground: colors.faint.replace('#', '') },
      {
        token: 'VerbatimLanguage',
        foreground: colors.faint.replace('#', ''),
      },
      {
        token: 'VerbatimAttribute',
        foreground: colors.faint.replace('#', ''),
      },
      {
        token: 'InlineMarker_strong_start',
        foreground: colors.faintest.replace('#', ''),
        fontStyle: 'italic',
      },
      {
        token: 'InlineMarker_strong_end',
        foreground: colors.faintest.replace('#', ''),
        fontStyle: 'italic',
      },
      {
        token: 'InlineMarker_emphasis_start',
        foreground: colors.faintest.replace('#', ''),
        fontStyle: 'italic',
      },
      {
        token: 'InlineMarker_emphasis_end',
        foreground: colors.faintest.replace('#', ''),
        fontStyle: 'italic',
      },
      {
        token: 'InlineMarker_code_start',
        foreground: colors.faintest.replace('#', ''),
        fontStyle: 'italic',
      },
      {
        token: 'InlineMarker_code_end',
        foreground: colors.faintest.replace('#', ''),
        fontStyle: 'italic',
      },
      {
        token: 'InlineMarker_math_start',
        foreground: colors.faintest.replace('#', ''),
        fontStyle: 'italic',
      },
      {
        token: 'InlineMarker_math_end',
        foreground: colors.faintest.replace('#', ''),
        fontStyle: 'italic',
      },
      {
        token: 'InlineMarker_ref_start',
        foreground: colors.faintest.replace('#', ''),
        fontStyle: 'italic',
      },
      {
        token: 'InlineMarker_ref_end',
        foreground: colors.faintest.replace('#', ''),
        fontStyle: 'italic',
      },
    ],
    colors: {
      'editor.foreground': colors.normal,
      'editor.background': colors.background,
      'editor.lineHighlightBackground': colors.lineHighlight,
      'editorLineNumber.foreground': colors.faint,
      'editorLineNumber.activeForeground': colors.normal,
    },
  });

  return themeName;
}

export function applyLexTheme(mode: ThemeMode) {
  const themeName = defineTheme(mode);
  monaco.editor.setTheme(themeName);
}

export function getThemeNameForMode(mode: ThemeMode) {
  return defineTheme(mode);
}
