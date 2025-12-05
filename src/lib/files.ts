const DEFAULT_LANGUAGE = 'plaintext';

export function getLanguageForFile(path: string): string {
  const ext = path.toLowerCase().split('.').pop();
  switch (ext) {
    case 'lex':
      return 'lex';
    case 'md':
      return 'markdown';
    case 'html':
    case 'htm':
      return 'html';
    case 'txt':
      return 'plaintext';
    default:
      return DEFAULT_LANGUAGE;
  }
}

export function isLexFile(path: string | null | undefined): boolean {
  if (!path) return false;
  return path.toLowerCase().endsWith('.lex');
}
