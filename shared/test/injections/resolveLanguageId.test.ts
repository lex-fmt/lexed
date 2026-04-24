import { describe, it, expect } from 'vitest';
import { injections } from '@lex/shared';

const { resolveLanguageId } = injections;

describe('resolveLanguageId', () => {
  it('alias py → python when python is registered', () => {
    const registered = new Set(['python', 'javascript', 'rust']);
    expect(resolveLanguageId('py', registered)).toBe('python');
  });

  it('alias py returns null when python is NOT registered', () => {
    const registered = new Set(['javascript', 'rust']);
    expect(resolveLanguageId('py', registered)).toBe(null);
  });

  it('already-registered ID used directly', () => {
    const registered = new Set(['python']);
    expect(resolveLanguageId('python', registered)).toBe('python');
  });

  it('unknown alias not in registered set returns null', () => {
    const registered = new Set(['python']);
    expect(resolveLanguageId('cobol', registered)).toBe(null);
  });

  it('trims whitespace', () => {
    const registered = new Set(['rust']);
    expect(resolveLanguageId('  rust  ', registered)).toBe('rust');
  });

  it('lowercases input', () => {
    const registered = new Set(['python']);
    expect(resolveLanguageId('Python', registered)).toBe('python');
    expect(resolveLanguageId('PYTHON', registered)).toBe('python');
    expect(resolveLanguageId('PY', registered)).toBe('python');
  });

  it('empty string returns null', () => {
    const registered = new Set(['python']);
    expect(resolveLanguageId('', registered)).toBe(null);
    expect(resolveLanguageId('   ', registered)).toBe(null);
  });

  it('bash/zsh/sh all alias to shellscript', () => {
    const registered = new Set(['shellscript']);
    expect(resolveLanguageId('bash', registered)).toBe('shellscript');
    expect(resolveLanguageId('zsh', registered)).toBe('shellscript');
    expect(resolveLanguageId('sh', registered)).toBe('shellscript');
    expect(resolveLanguageId('shell', registered)).toBe('shellscript');
  });

  it('c++ aliases to cpp (special char handling)', () => {
    const registered = new Set(['cpp']);
    expect(resolveLanguageId('c++', registered)).toBe('cpp');
    expect(resolveLanguageId('cxx', registered)).toBe('cpp');
    expect(resolveLanguageId('cc', registered)).toBe('cpp');
  });

  it('jsx/tsx aliases', () => {
    const registered = new Set(['javascriptreact', 'typescriptreact']);
    expect(resolveLanguageId('jsx', registered)).toBe('javascriptreact');
    expect(resolveLanguageId('tsx', registered)).toBe('typescriptreact');
  });

  it('alias does not leak when target is not registered', () => {
    // `ts` aliases to `typescript` — if typescript is not registered but
    // `ts` is somehow in the set, the alias resolution takes precedence
    // and returns null (this is the intended behaviour).
    const registered = new Set(['ts']);
    expect(resolveLanguageId('ts', registered)).toBe(null);
  });
});
