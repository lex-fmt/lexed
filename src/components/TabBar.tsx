import { useState, useCallback, DragEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Tab {
    id: string;
    path: string;
    name: string;
    type?: 'file' | 'preview';
    previewContent?: string;
    sourceFile?: string;
}

export interface TabDropData {
    tabPath: string;
    sourcePaneId: string;
    duplicate: boolean;
}

interface TabBarProps {
    tabs: Tab[];
    activeTabId: string | null;
    paneId: string;
    onTabSelect: (tabId: string) => void;
    onTabClose: (tabId: string) => void;
    onTabDrop?: (data: TabDropData) => void;
}

function truncateName(name: string, maxLength: number = 20): string {
    if (name.length <= maxLength) return name;
    return name.slice(0, maxLength - 1) + '\u2026'; // ellipsis character
}

const TAB_DRAG_TYPE = 'application/x-lex-tab';

export function TabBar({ tabs, activeTabId, paneId, onTabSelect, onTabClose, onTabDrop }: TabBarProps) {
    const [isDragOver, setIsDragOver] = useState(false);

    const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, tab: Tab) => {
        e.dataTransfer.setData(TAB_DRAG_TYPE, JSON.stringify({
            tabPath: tab.path,
            sourcePaneId: paneId,
        }));
        e.dataTransfer.effectAllowed = 'copyMove';
    }, [paneId]);

    const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
        if (e.dataTransfer.types.includes(TAB_DRAG_TYPE)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = e.altKey || e.metaKey ? 'copy' : 'move';
            setIsDragOver(true);
        }
    }, []);

    const handleDragLeave = useCallback(() => {
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);

        const rawData = e.dataTransfer.getData(TAB_DRAG_TYPE);
        if (!rawData) return;

        try {
            const data = JSON.parse(rawData) as { tabPath: string; sourcePaneId: string };
            if (data.sourcePaneId === paneId) {
                // Dropped on same pane, do nothing
                return;
            }
            onTabDrop?.({
                tabPath: data.tabPath,
                sourcePaneId: data.sourcePaneId,
                duplicate: e.altKey || e.metaKey,
            });
        } catch {
            // Invalid data, ignore
        }
    }, [paneId, onTabDrop]);

    if (tabs.length === 0) {
        return (
            <div
                className={cn(
                    "h-10 bg-panel border-b border-border shrink-0",
                    isDragOver && "bg-accent/50"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            />
        );
    }

    return (
        <div
            className={cn(
                "flex items-end bg-panel border-b border-border shrink-0 overflow-x-auto overflow-y-hidden pb-2",
                isDragOver && "bg-accent/50"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {tabs.map(tab => (
                <div
                    key={tab.id}
                    data-testid="editor-tab"
                    data-tab-id={tab.id}
                    data-tab-path={tab.path}
                    data-active={activeTabId === tab.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, tab)}
                    className={cn(
                        "group flex items-center gap-1.5 h-8 px-3 cursor-pointer border-r border-border",
                        "hover:bg-panel-hover transition-colors",
                        activeTabId === tab.id
                            ? "bg-background text-foreground"
                            : "bg-background-faintest text-muted"
                    )}
                    onClick={() => onTabSelect(tab.id)}
                >
                    <span className="text-sm whitespace-nowrap">
                        {truncateName(tab.name)}
                    </span>
                    <button
                        className={cn(
                            "p-0.5 rounded hover:bg-border transition-colors",
                            "text-muted opacity-0 group-hover:opacity-100",
                            activeTabId === tab.id && "opacity-100"
                        )}
                        onClick={(e) => {
                            e.stopPropagation();
                            onTabClose(tab.id);
                        }}
                        title="Close"
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
}
