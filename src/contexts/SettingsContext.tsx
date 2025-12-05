/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AppSettings, EditorSettings, FormatterSettings, defaultAppSettings } from '@/settings/types';
import { setSettingsSnapshot } from '@/settings/snapshot';

import { lspClient } from '@/lsp/client';
import { SpellcheckSettings } from '@/settings/types';

interface SettingsContextType {
    settings: AppSettings;
    updateEditorSettings: (settings: EditorSettings) => Promise<void>;
    updateFormatterSettings: (settings: FormatterSettings) => Promise<void>;
    updateSpellcheckSettings: (settings: SpellcheckSettings) => Promise<void>;
}

const defaultSettings: AppSettings = defaultAppSettings;

const SettingsContext = createContext<SettingsContextType | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings() {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<AppSettings>(defaultSettings);

    useEffect(() => {
        // Initial load
        window.ipcRenderer.getAppSettings().then((loadedSettings: any) => {
            setSettings(prev => {
                const next = {
                    editor: { ...prev.editor, ...(loadedSettings?.editor ?? {}) },
                    formatter: { ...prev.formatter, ...(loadedSettings?.formatter ?? {}) },
                    spellcheck: { ...prev.spellcheck, ...(loadedSettings?.spellcheck ?? {}) },
                    lastFolder: loadedSettings?.lastFolder,
                } satisfies AppSettings;
                setSettingsSnapshot(next);

                // Notify LSP on initial load if needed, but LSP usually pulls config or gets it via didChangeConfiguration
                // We should send it once we have it.
                lspClient.sendNotification('workspace/didChangeConfiguration', { settings: { spellcheck: next.spellcheck } });

                return next;
            });
        });

        // Listen for changes
        const unsubscribe = window.ipcRenderer.onSettingsChanged((newSettings: any) => {
            setSettings(prev => {
                const next = {
                    editor: { ...prev.editor, ...(newSettings?.editor ?? {}) },
                    formatter: { ...prev.formatter, ...(newSettings?.formatter ?? {}) },
                    spellcheck: { ...prev.spellcheck, ...(newSettings?.spellcheck ?? {}) },
                    lastFolder: newSettings?.lastFolder,
                } satisfies AppSettings;
                setSettingsSnapshot(next);

                // Notify LSP
                lspClient.sendNotification('workspace/didChangeConfiguration', { settings: { spellcheck: next.spellcheck } });

                return next;
            });
        });

        return unsubscribe;
    }, []);

    const updateEditorSettings = async (editorSettings: EditorSettings) => {
        await window.ipcRenderer.setEditorSettings(editorSettings);
        // Optimistic update
        setSettings(prev => {
            const next = { ...prev, editor: editorSettings } satisfies AppSettings;
            setSettingsSnapshot(next);
            return next;
        });
    };

    const updateFormatterSettings = async (formatterSettings: FormatterSettings) => {
        await window.ipcRenderer.setFormatterSettings(formatterSettings);
        setSettings(prev => {
            const next = { ...prev, formatter: formatterSettings } satisfies AppSettings;
            setSettingsSnapshot(next);
            return next;
        });
    };

    const updateSpellcheckSettings = async (spellcheckSettings: SpellcheckSettings) => {
        console.log('[SettingsContext] Updating spellcheck settings:', spellcheckSettings);
        await window.ipcRenderer.setSpellcheckSettings(spellcheckSettings);
        setSettings(prev => {
            const next = { ...prev, spellcheck: spellcheckSettings } satisfies AppSettings;
            setSettingsSnapshot(next);
            // Notify LSP
            if (lspClient) {
                console.log('[SettingsContext] Sending workspace/didChangeConfiguration to LSP');
                lspClient.sendNotification('workspace/didChangeConfiguration', {
                    settings: {
                        lex: {
                            spellcheck: next.spellcheck
                        }
                    }
                });
            }
            return next;
        });
    };

    return (
        <SettingsContext.Provider value={{ settings, updateEditorSettings, updateFormatterSettings, updateSpellcheckSettings }}>
            {children}
        </SettingsContext.Provider>
    );
}
