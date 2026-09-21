import type { LucideIcon } from 'lucide-react'

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  text: string
}

export function EmptyState({ icon: Icon, title, text }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" />
      </div>
      <p className="font-semibold">{title}</p>
      <p className="max-w-sm text-muted-foreground text-sm">{text}</p>
    </div>
  )
}
