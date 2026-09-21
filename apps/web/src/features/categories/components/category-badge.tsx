import type { CategoryColor, CategoryIconName } from '@bolso/shared'
import { categoryColorStyles } from '../colors'
import { categoryIcons } from '../icons'

type CategoryBadgeProps = {
  icon: CategoryIconName
  color: CategoryColor
  size?: 'default' | 'lg'
}

export function CategoryBadge({ icon, color, size = 'default' }: CategoryBadgeProps) {
  const Icon = categoryIcons[icon]
  const sizeClasses =
    size === 'lg' ? 'size-11 rounded-xl [&_svg]:size-5' : 'size-9 rounded-lg [&_svg]:size-4'

  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center ${sizeClasses} ${categoryColorStyles[color].badge}`}
    >
      <Icon />
    </span>
  )
}
