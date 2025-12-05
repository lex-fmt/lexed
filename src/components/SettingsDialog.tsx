import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettings } from '@/contexts/SettingsContext';

interface SettingsDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
    const { settings, updateEditorSettings, updateFormatterSettings, updateSpellcheckSettings } = useSettings();
    const [localEditorSettings, setLocalEditorSettings] = useState(settings.editor);
    const [localFormatterSettings, setLocalFormatterSettings] = useState(settings.formatter);
    const [localSpellcheckSettings, setLocalSpellcheckSettings] = useState(settings.spellcheck);
    const [activeTab, setActiveTab] = useState<'ui' | 'formatter' | 'spellcheck'>('ui');
    const tabs = [
        { id: 'ui' as const, label: 'UI' },
        { id: 'formatter' as const, label: 'Formatter' },
        { id: 'spellcheck' as const, label: 'Spellcheck' },
    ];
    const indentSpaces = Math.max(1, localFormatterSettings.indentString.length || 4);

    useEffect(() => {
        if (isOpen) {
            setActiveTab('ui');
            setLocalEditorSettings(settings.editor);
            setLocalFormatterSettings(settings.formatter);
            setLocalSpellcheckSettings(settings.spellcheck);
        }
    }, [settings.editor, settings.formatter, settings.spellcheck, isOpen]);

    if (!isOpen) return null;

    const handleSave = async () => {
        await Promise.all([
            updateEditorSettings(localEditorSettings),
            updateFormatterSettings(localFormatterSettings),
            updateSpellcheckSettings(localSpellcheckSettings),
        ]);
        onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'var(--locked-content-overlay)' }}
        >
            <div className="w-[720px] bg-panel border border-border rounded-lg shadow-xl flex flex-col max-h-[80vh]">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <h2 className="text-sm font-semibold">Settings</h2>
                    <button onClick={onClose} className="p-1 hover:bg-panel-hover rounded">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex flex-1 min-h-0">
                    <div className="w-40 border-r border-border bg-panel/80">
                        <div className="flex flex-col">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    className={cn(
                                        'text-left px-4 py-2 text-sm transition-colors',
                                        activeTab === tab.id ? 'bg-panel-hover text-foreground' : 'text-muted-foreground hover:text-foreground'
                                    )}
                                    onClick={() => setActiveTab(tab.id)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto space-y-6">
                        {activeTab === 'ui' && (
                            <div className="space-y-6">
                                <div className="space-y-4">
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Editor</h3>

                                    <div className="flex items-center justify-between">
                                        <label htmlFor="show-ruler" className="text-sm">Show vertical col width ruler</label>
                                        <input
                                            id="show-ruler"
                                            type="checkbox"
                                            checked={localEditorSettings.showRuler}
                                            onChange={(e) => setLocalEditorSettings(prev => ({ ...prev, showRuler: e.target.checked }))}
                                            className="accent-primary"
                                        />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <label htmlFor="ruler-width" className={cn("text-sm", !localEditorSettings.showRuler && "opacity-50")}>
                                            Ruler width
                                        </label>
                                        <input
                                            id="ruler-width"
                                            type="number"
                                            min={1}
                                            value={localEditorSettings.rulerWidth}
                                            disabled={!localEditorSettings.showRuler}
                                            onChange={(e) => setLocalEditorSettings(prev => ({ ...prev, rulerWidth: parseInt(e.target.value) || 0 }))}
                                            className="w-20 px-2 py-1 text-sm bg-input border border-border rounded focus:outline-none focus:border-primary disabled:opacity-50"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <label htmlFor="vim-mode" className="text-sm">Enable Vim Mode</label>
                                    <input
                                        type="checkbox"
                                        id="vim-mode"
                                        checked={localEditorSettings.vimMode}
                                        onChange={(e) => setLocalEditorSettings(prev => ({ ...prev, vimMode: e.target.checked }))}
                                        className="accent-primary"
                                    />
                                </div>
                            </div>
                        )}

                        {activeTab === 'formatter' && (
                            <div className="space-y-6">
                                <div className="space-y-4">
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Spacing</h3>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="session-before" className="text-xs text-muted-foreground uppercase tracking-wide">Session blank lines before</label>
                                            <input
                                                id="session-before"
                                                type="number"
                                                min={1}
                                                value={localFormatterSettings.sessionBlankLinesBefore}
                                                onChange={(e) => setLocalFormatterSettings(prev => ({ ...prev, sessionBlankLinesBefore: Math.max(1, parseInt(e.target.value) || 1) }))}
                                                className="mt-1 w-full px-2 py-1 text-sm bg-input border border-border rounded focus:outline-none focus:border-primary"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="session-after" className="text-xs text-muted-foreground uppercase tracking-wide">Session blank lines after</label>
                                            <input
                                                id="session-after"
                                                type="number"
                                                min={1}
                                                value={localFormatterSettings.sessionBlankLinesAfter}
                                                onChange={(e) => setLocalFormatterSettings(prev => ({ ...prev, sessionBlankLinesAfter: Math.max(1, parseInt(e.target.value) || 1) }))}
                                                className="mt-1 w-full px-2 py-1 text-sm bg-input border border-border rounded focus:outline-none focus:border-primary"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="max-blank-lines" className="text-xs text-muted-foreground uppercase tracking-wide">Max consecutive blank lines</label>
                                            <input
                                                id="max-blank-lines"
                                                type="number"
                                                min={1}
                                                value={localFormatterSettings.maxBlankLines}
                                                onChange={(e) => setLocalFormatterSettings(prev => ({ ...prev, maxBlankLines: Math.max(1, parseInt(e.target.value) || 1) }))}
                                                className="mt-1 w-full px-2 py-1 text-sm bg-input border border-border rounded focus:outline-none focus:border-primary"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="indent-spaces" className="text-xs text-muted-foreground uppercase tracking-wide">Indent spaces</label>
                                            <input
                                                id="indent-spaces"
                                                type="number"
                                                min={1}
                                                value={indentSpaces}
                                                onChange={(e) => {
                                                    const next = Math.max(1, parseInt(e.target.value) || 1);
                                                    setLocalFormatterSettings(prev => ({ ...prev, indentString: ' '.repeat(next) }));
                                                }}
                                                className="mt-1 w-full px-2 py-1 text-sm bg-input border border-border rounded focus:outline-none focus:border-primary"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lists & Verbatim</h3>

                                    <div className="max-w-xs">
                                        <label htmlFor="unordered-marker" className="text-xs text-muted-foreground uppercase tracking-wide">Unordered list marker</label>
                                        <input
                                            id="unordered-marker"
                                            type="text"
                                            maxLength={1}
                                            value={localFormatterSettings.unorderedSeqMarker}
                                            onChange={(e) => setLocalFormatterSettings(prev => ({ ...prev, unorderedSeqMarker: e.target.value.slice(0, 1) }))}
                                            className="mt-1 w-full px-2 py-1 text-sm bg-input border border-border rounded focus:outline-none focus:border-primary"
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <label className="flex items-center justify-between text-sm">
                                            <span>Normalize list markers</span>
                                            <input
                                                type="checkbox"
                                                checked={localFormatterSettings.normalizeSeqMarkers}
                                                onChange={(e) => setLocalFormatterSettings(prev => ({ ...prev, normalizeSeqMarkers: e.target.checked }))}
                                                className="accent-primary"
                                            />
                                        </label>
                                        <label className="flex items-center justify-between text-sm">
                                            <span>Normalize verbatim markers</span>
                                            <input
                                                type="checkbox"
                                                checked={localFormatterSettings.normalizeVerbatimMarkers}
                                                onChange={(e) => setLocalFormatterSettings(prev => ({ ...prev, normalizeVerbatimMarkers: e.target.checked }))}
                                                className="accent-primary"
                                            />
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Whitespace</h3>
                                    <label className="flex items-center justify-between text-sm">
                                        <span>Preserve trailing blank lines</span>
                                        <input
                                            type="checkbox"
                                            checked={localFormatterSettings.preserveTrailingBlanks}
                                            onChange={(e) => setLocalFormatterSettings(prev => ({ ...prev, preserveTrailingBlanks: e.target.checked }))}
                                            className="accent-primary"
                                        />
                                    </label>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Automation</h3>
                                    <label className="flex items-center justify-between text-sm">
                                        <span>Format automatically on save</span>
                                        <input
                                            type="checkbox"
                                            checked={localFormatterSettings.formatOnSave}
                                            onChange={(e) => setLocalFormatterSettings(prev => ({ ...prev, formatOnSave: e.target.checked }))}
                                            className="accent-primary"
                                        />
                                    </label>
                                </div>
                            </div>
                        )}

                        {activeTab === 'spellcheck' && (
                            <div className="space-y-6">
                                <div className="space-y-4">
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Spellcheck</h3>

                                    <div className="flex items-center justify-between">
                                        <label htmlFor="spellcheck-enabled" className="text-sm">Enable Spellcheck</label>
                                        <input
                                            type="checkbox"
                                            id="spellcheck-enabled"
                                            checked={localSpellcheckSettings.enabled}
                                            onChange={(e) => setLocalSpellcheckSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                                            className="accent-primary"
                                        />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <label htmlFor="spellcheck-language" className={cn("text-sm", !localSpellcheckSettings.enabled && "opacity-50")}>
                                            Language
                                        </label>
                                        <select
                                            id="spellcheck-language"
                                            value={localSpellcheckSettings.language}
                                            disabled={!localSpellcheckSettings.enabled}
                                            onChange={(e) => setLocalSpellcheckSettings(prev => ({ ...prev, language: e.target.value }))}
                                            className="w-40 px-2 py-1 text-sm bg-input border border-border rounded focus:outline-none focus:border-primary disabled:opacity-50"
                                        >
                                            <option value="en_US">English (US)</option>
                                            <option value="en_GB">English (UK)</option>
                                            <option value="es_ES">Spanish</option>
                                            <option value="fr_FR">French</option>
                                            <option value="de_DE">German</option>
                                            <option value="pt_BR">Portuguese (BR)</option>
                                            <option value="it_IT">Italian</option>
                                            <option value="ru_RU">Russian</option>
                                            <option value="nl_NL">Dutch</option>
                                            <option value="pl_PL">Polish</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-panel-hover/30">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm hover:bg-panel-hover rounded"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => { void handleSave(); }}
                        className="px-3 py-1.5 text-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded"
                    >
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}
