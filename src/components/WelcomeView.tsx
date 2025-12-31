import { FolderOpen, Command, FilePlus } from 'lucide-react'

export function WelcomeView() {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-background text-muted-foreground select-none">
      <div className="flex flex-col items-center gap-6 max-w-md">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-4xl font-light tracking-tight text-foreground">Lex</h1>
          <p className="text-lg">Simple. Fast. Markdown.</p>
        </div>

        <div className="w-full h-px bg-border/50" />

        <div className="flex flex-col gap-3 w-full">
          <ShortcutRow icon={<FilePlus size={16} />} label="New File" keys={['⌘', 'N']} />
          <ShortcutRow icon={<FolderOpen size={16} />} label="Open File" keys={['⌘', 'O']} />
          <ShortcutRow
            icon={<FolderOpen size={16} />}
            label="Open Folder"
            keys={['⌘', 'K', '⌘', 'O']}
          />
          <ShortcutRow
            icon={<Command size={16} />}
            label="Command Palette"
            keys={['⌘', '⇧', 'P']}
          />
        </div>
      </div>
    </div>
  )
}

function ShortcutRow({
  icon,
  label,
  keys,
}: {
  icon: React.ReactNode
  label: string
  keys: string[]
}) {
  return (
    <div className="flex items-center justify-between w-full text-sm">
      <div className="flex items-center gap-3">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-1">
        {keys.map((key, i) => (
          <span
            key={i}
            className="px-1.5 py-0.5 min-w-[20px] text-center rounded bg-muted text-foreground/70 font-mono text-xs border border-border"
          >
            {key}
          </span>
        ))}
      </div>
    </div>
  )
}
