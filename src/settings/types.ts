export interface EditorSettings {
    showRuler: boolean;
    rulerWidth: number;
    vimMode: boolean;
}

export interface FormatterSettings {
    sessionBlankLinesBefore: number;
    sessionBlankLinesAfter: number;
    normalizeSeqMarkers: boolean;
    unorderedSeqMarker: string;
    maxBlankLines: number;
    indentString: string;
    preserveTrailingBlanks: boolean;
    normalizeVerbatimMarkers: boolean;
    formatOnSave: boolean;
}

export interface SpellcheckSettings {
    enabled: boolean;
    language: string;
}

export interface AppSettings {
    editor: EditorSettings;
    formatter: FormatterSettings;
    spellcheck: SpellcheckSettings;
    lastFolder?: string;
}

export const defaultEditorSettings: EditorSettings = {
    showRuler: false,
    rulerWidth: 100,
    vimMode: false,
};

export const defaultFormatterSettings: FormatterSettings = {
    sessionBlankLinesBefore: 1,
    sessionBlankLinesAfter: 1,
    normalizeSeqMarkers: true,
    unorderedSeqMarker: '-',
    maxBlankLines: 2,
    indentString: '    ',
    preserveTrailingBlanks: false,
    normalizeVerbatimMarkers: true,
    formatOnSave: false,
};

export const defaultSpellcheckSettings: SpellcheckSettings = {
    enabled: true,
    language: 'en_US',
};

export const defaultAppSettings: AppSettings = {
    editor: defaultEditorSettings,
    formatter: defaultFormatterSettings,
    spellcheck: defaultSpellcheckSettings,
};
