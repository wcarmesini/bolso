import { type CategoryColor, categoryColors } from '@bolso/shared'
import { Check } from 'lucide-react'
import { categoryColorStyles } from '../colors'

type ColorPickerProps = {
  value: CategoryColor
  onChange: (color: CategoryColor) => void
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {categoryColors.map((color) => {
        const selected = color === value
        return (
          <button
            key={color}
            type="button"
            aria-label={categoryColorStyles[color].label}
            aria-pressed={selected}
            onClick={() => onChange(color)}
            className={`grid size-7 place-items-center rounded-full sm:size-8 text-white outline-none ring-offset-2 ring-offset-card transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50 ${
              categoryColorStyles[color].swatch
            } ${selected ? 'ring-2 ring-foreground/70' : ''}`}
          >
            {selected && <Check className="size-4" />}
          </button>
        )
      })}
    </div>
  )
}
