import { isCategoryColor } from '@bolso/shared'
import { Check, Pipette } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Slider, SliderIndicator, SliderThumb, SliderTrack } from '@/components/ui/slider'
import { categoryColorVar, colorGroups, hexToHsl, hslToHex } from '../colors'

type ColorPickerProps = {
  value: string
  onChange: (color: string) => void
}

/**
 * Escolhe a cor da categoria: as prontas resolvem em um toque, e quem quiser um tom próprio
 * ajusta matiz, intensidade e claridade — ou cola o hex que já usa em outro lugar.
 */
export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState(value)
  const { h, s, l } = hexToHsl(isCategoryColor(value) ? value : '#71717a')

  // A cor pode mudar por fora (outra categoria em edição): o campo acompanha
  useEffect(() => setTexto(value), [value])

  const mudarHsl = (proximo: { h?: number; s?: number; l?: number }) =>
    onChange(hslToHex(proximo.h ?? h, proximo.s ?? s, proximo.l ?? l))

  const prontas = colorGroups.flatMap((group) => group.colors)
  const ehPronta = prontas.includes(value)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {prontas.map((color) => {
          const escolhida = color === value
          return (
            <button
              key={color}
              type="button"
              aria-label={`Cor ${color}`}
              aria-pressed={escolhida}
              onClick={() => onChange(color)}
              style={categoryColorVar(color)}
              className={`cat-swatch grid size-7 place-items-center rounded-full text-[var(--cat-sobre)] outline-none ring-offset-2 ring-offset-card transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50 ${
                escolhida ? 'ring-2 ring-foreground/70' : ''
              }`}
            >
              {escolhida && <Check className="size-4" />}
            </button>
          )
        })}

        {/* A cor de fora da paleta fica visível aqui, ao lado das prontas */}
        <button
          type="button"
          aria-label="Escolher outra cor"
          aria-expanded={aberto}
          onClick={() => setAberto((atual) => !atual)}
          style={categoryColorVar(value)}
          className={`grid size-7 place-items-center rounded-full outline-none ring-offset-2 ring-offset-card transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50 ${
            ehPronta
              ? 'border border-border border-dashed text-muted-foreground'
              : 'cat-swatch text-[var(--cat-sobre)] ring-2 ring-foreground/70'
          }`}
        >
          <Pipette className="size-3.5" />
        </button>
      </div>

      {aberto && (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
          <Faixa
            label="Matiz"
            value={h}
            max={360}
            onChange={(next) => mudarHsl({ h: next })}
            trilha="linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)"
          />
          <Faixa
            label="Intensidade"
            value={s}
            max={100}
            onChange={(next) => mudarHsl({ s: next })}
            trilha={`linear-gradient(to right, ${hslToHex(h, 0, l)}, ${hslToHex(h, 100, l)})`}
          />
          <Faixa
            label="Claridade"
            value={l}
            max={100}
            onChange={(next) => mudarHsl({ l: next })}
            trilha={`linear-gradient(to right, #000000, ${hslToHex(h, s, 50)}, #ffffff)`}
          />

          <div className="flex items-center gap-2">
            <span
              style={categoryColorVar(value)}
              className="cat-swatch size-8 shrink-0 rounded-lg"
              aria-hidden
            />
            <Input
              aria-label="Cor em hexadecimal"
              value={texto}
              spellCheck={false}
              maxLength={7}
              onChange={(event) => {
                const proximo = event.target.value.startsWith('#')
                  ? event.target.value
                  : `#${event.target.value}`
                setTexto(proximo)
                if (isCategoryColor(proximo)) onChange(proximo.toLowerCase())
              }}
              onBlur={() => setTexto(value)}
              className="w-28 font-mono text-sm uppercase"
            />
          </div>
        </div>
      )}
    </div>
  )
}

type FaixaProps = {
  label: string
  value: number
  max: number
  onChange: (value: number) => void
  trilha: string
}

function Faixa({ label, value, max, onChange, trilha }: FaixaProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-muted-foreground text-xs">{label}</span>
      <Slider
        aria-label={label}
        value={value}
        max={max}
        onValueChange={(next) => onChange(Array.isArray(next) ? (next[0] ?? 0) : next)}
      >
        {/* A trilha mostra o resultado de cada posição: escolher a cor é olhar, não adivinhar */}
        <SliderTrack style={{ background: trilha }}>
          <SliderIndicator className="bg-transparent" />
          <SliderThumb />
        </SliderTrack>
      </Slider>
    </div>
  )
}
