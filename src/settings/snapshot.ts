import type { AppSettings, EditorSettings, FormatterSettings, SpellcheckSettings } from './types';
import { defaultAppSettings } from './types';

let currentSettings: AppSettings = {
    editor: { ...defaultAppSettings.editor },
    formatter: { ...defaultAppSettings.formatter },
    spellcheck: { ...defaultAppSettings.spellcheck },
};

const cloneEditor = (editor: EditorSettings): EditorSettings => ({
    showRuler: editor.showRuler,
    rulerWidth: editor.rulerWidth,
    vimMode: editor.vimMode,
});

const cloneFormatter = (formatter: FormatterSettings): FormatterSettings => ({
    sessionBlankLinesBefore: formatter.sessionBlankLinesBefore,
    sessionBlankLinesAfter: formatter.sessionBlankLinesAfter,
    normalizeSeqMarkers: formatter.normalizeSeqMarkers,
    unorderedSeqMarker: formatter.unorderedSeqMarker,
    maxBlankLines: formatter.maxBlankLines,
    indentString: formatter.indentString,
    preserveTrailingBlanks: formatter.preserveTrailingBlanks,
    normalizeVerbatimMarkers: formatter.normalizeVerbatimMarkers,
    formatOnSave: formatter.formatOnSave,
});

const cloneSpellcheck = (spellcheck: SpellcheckSettings): SpellcheckSettings => ({
    enabled: spellcheck.enabled,
    language: spellcheck.language,
});

const cloneSettings = (settings: AppSettings): AppSettings => ({
    editor: cloneEditor(settings.editor),
    formatter: cloneFormatter(settings.formatter),
    spellcheck: cloneSpellcheck(settings.spellcheck),
});

export function setSettingsSnapshot(settings: AppSettings): void {
    currentSettings = cloneSettings(settings);
}

export function getSettingsSnapshot(): AppSettings {
    return cloneSettings(currentSettings);
}

export function getFormatterSettingsSnapshot(): FormatterSettings {
    return cloneFormatter(currentSettings.formatter);
}

export function getEditorSettingsSnapshot(): EditorSettings {
    return cloneEditor(currentSettings.editor);
}

export function getSpellcheckSettingsSnapshot(): SpellcheckSettings {
    return cloneSpellcheck(currentSettings.spellcheck);
}
