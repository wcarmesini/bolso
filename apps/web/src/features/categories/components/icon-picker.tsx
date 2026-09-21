import { type CategoryColor, type CategoryIconName, categoryIconNames } from '@bolso/shared'
import { categoryColorStyles } from '../colors'
import { categoryIcons } from '../icons'

type IconPickerProps = {
  value: CategoryIconName
  color: CategoryColor
  onChange: (icon: CategoryIconName) => void
}

export function IconPicker({ value, color, onChange }: IconPickerProps) {
  return (
    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
      {categoryIconNames.map((name) => {
        const Icon = categoryIcons[name]
        const selected = name === value
        return (
          <button
            key={name}
            type="button"
            aria-label={name}
            aria-pressed={selected}
            onClick={() => onChange(name)}
            className={`grid aspect-square place-items-center rounded-lg outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
              selected
                ? categoryColorStyles[color].badge
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon className="size-4" />
          </button>
        )
      })}
    </div>
  )
}
