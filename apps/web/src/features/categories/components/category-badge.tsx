import type { CategoryIconName } from '@bolso/shared'
import { categoryColorVar } from '../colors'
import { categoryIcons } from '../icons'

type CategoryBadgeProps = {
  icon: CategoryIconName
  /** Hex escolhido na categoria (#rrggbb) */
  color: string
  size?: 'xs' | 'default' | 'lg'
}

export function CategoryBadge({ icon, color, size = 'default' }: CategoryBadgeProps) {
  const Icon = categoryIcons[icon]
  const sizeClasses = {
    xs: 'size-5 rounded [&_svg]:size-3',
    default: 'size-9 rounded-lg [&_svg]:size-4',
    lg: 'size-11 rounded-xl [&_svg]:size-5',
  }[size]

  return (
    <span
      aria-hidden
      style={categoryColorVar(color)}
      className={`cat-badge grid shrink-0 place-items-center ${sizeClasses}`}
    >
      <Icon />
    </span>
  )
}
