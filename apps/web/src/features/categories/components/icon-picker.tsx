import type { CategoryIconName } from '@bolso/shared'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { categoryColorVar } from '../colors'
import { buscarIcones } from '../icon-search'
import { categoryIconGroups, categoryIconLabels, categoryIcons } from '../icons'

type IconPickerProps = {
  value: CategoryIconName
  color: string
  onChange: (icon: CategoryIconName) => void
  /** Nome que a pessoa está digitando: é dele que saem os sugeridos */
  name?: string
}

/**
 * Escolhe o ícone da categoria. São muitos, então eles vêm **em famílias** (Alimentação,
 * Casa, Transporte…) e com busca em português — "luz" acha Energia, "uber" acha Táxi.
 * No topo, os sugeridos pelo nome que está sendo digitado: quase sempre um deles serve.
 */
export function IconPicker({ value, color, onChange, name }: IconPickerProps) {
  const [query, setQuery] = useState('')

  const resultados = useMemo(() => (query.trim() ? buscarIcones(query) : null), [query])

  // Sugeridos: os que mais combinam com o nome que está sendo digitado
  const sugeridos = useMemo(() => buscarIcones(name ?? '', 12), [name])

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="-translate-y-1/2 absolute top-1/2 left-3 size-3.5 text-muted-foreground" />
        <Input
          aria-label="Buscar ícone"
          placeholder="Buscar ícone…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-9"
        />
      </div>

      <div className="-mx-1 max-h-44 overflow-y-auto px-1">
        {resultados ? (
          resultados.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground text-sm">
              Nenhum ícone com esse nome.
            </p>
          ) : (
            <Grade icons={resultados} value={value} color={color} onChange={onChange} />
          )
        ) : (
          <div className="flex flex-col gap-3">
            {sugeridos.length > 0 && (
              <Secao titulo="Sugeridos">
                <Grade icons={sugeridos} value={value} color={color} onChange={onChange} />
              </Secao>
            )}
            {categoryIconGroups.map((group) => (
              <Secao key={group.label} titulo={group.label}>
                <Grade icons={group.icons} value={value} color={color} onChange={onChange} />
              </Secao>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="px-0.5 text-muted-foreground text-xs">{titulo}</h3>
      {children}
    </section>
  )
}

type GradeProps = {
  icons: readonly CategoryIconName[]
  value: CategoryIconName
  color: string
  onChange: (icon: CategoryIconName) => void
}

function Grade({ icons, value, color, onChange }: GradeProps) {
  return (
    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
      {icons.map((name) => {
        const Icon = categoryIcons[name]
        const escolhido = name === value
        return (
          <button
            key={name}
            type="button"
            aria-label={categoryIconLabels[name]}
            title={categoryIconLabels[name]}
            aria-pressed={escolhido}
            onClick={() => onChange(name)}
            style={escolhido ? categoryColorVar(color) : undefined}
            className={`grid aspect-square place-items-center rounded-lg outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
              escolhido ? 'cat-badge' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon className="size-4" />
          </button>
        )
      })}
    </div>
  )
}
