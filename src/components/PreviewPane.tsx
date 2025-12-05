interface PreviewPaneProps {
    content: string;
}

export function PreviewPane({ content }: PreviewPaneProps) {
    return (
        <iframe
            srcDoc={content}
            sandbox="allow-scripts"
            className="w-full h-full border-0 bg-white"
            title="Preview"
        />
    );
}
