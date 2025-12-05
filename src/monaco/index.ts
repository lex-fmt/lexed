import { configureMonacoEnvironment } from './environment';
import { applyLexTheme, ThemeMode } from './theme';
import { registerLexLanguage } from './lex';

let initialized = false;

export function initializeMonaco() {
  if (initialized) return;
  configureMonacoEnvironment();
  registerLexLanguage();
  initialized = true;
}

export function applyTheme(mode: ThemeMode) {
  applyLexTheme(mode);
}

export type { ThemeMode } from './theme';
