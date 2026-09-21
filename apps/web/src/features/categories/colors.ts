import type { CategoryColor } from '@bolso/shared'

/*
 * Exceção à regra "só tokens": estas são cores de DADOS (identificam cada categoria em listas
 * e gráficos), não do tema. Ficam todas aqui, com as classes escritas por extenso para o
 * Tailwind encontrá-las.
 */
export const categoryColorStyles: Record<
  CategoryColor,
  { label: string; badge: string; swatch: string }
> = {
  green: {
    label: 'Verde',
    badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    swatch: 'bg-emerald-500',
  },
  teal: {
    label: 'Turquesa',
    badge: 'bg-teal-500/15 text-teal-600 dark:text-teal-400',
    swatch: 'bg-teal-500',
  },
  blue: {
    label: 'Azul',
    badge: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
    swatch: 'bg-sky-500',
  },
  violet: {
    label: 'Roxo',
    badge: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    swatch: 'bg-violet-500',
  },
  pink: {
    label: 'Rosa',
    badge: 'bg-pink-500/15 text-pink-600 dark:text-pink-400',
    swatch: 'bg-pink-500',
  },
  red: {
    label: 'Vermelho',
    badge: 'bg-red-500/15 text-red-600 dark:text-red-400',
    swatch: 'bg-red-500',
  },
  orange: {
    label: 'Laranja',
    badge: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    swatch: 'bg-orange-500',
  },
  amber: {
    label: 'Amarelo',
    badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    swatch: 'bg-amber-500',
  },
  slate: {
    label: 'Cinza',
    badge: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
    swatch: 'bg-zinc-500',
  },
}
