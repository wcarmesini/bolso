import { ptBR } from 'date-fns/locale'
import type { ComponentProps } from 'react'
import { Calendar } from '@/components/ui/calendar'

// O locale traduz dias e meses, mas os rótulos de acessibilidade vêm em inglês
const rotulos = {
  labelPrevious: () => 'Mês anterior',
  labelNext: () => 'Próximo mês',
  labelMonthDropdown: () => 'Mês',
  labelYearDropdown: () => 'Ano',
  labelNav: () => 'Navegar pelos meses',
}

// Janela de anos do seletor: o suficiente para lançar atrasado e parcelar longe
const HOJE = new Date()
const PRIMEIRO_MES = new Date(HOJE.getFullYear() - 5, 0, 1)
const ULTIMO_MES = new Date(HOJE.getFullYear() + 5, 11, 1)

/**
 * Calendário em português, pronto para uso. Vive num arquivo só dele porque é carregado
 * sob demanda: o react-day-picker e o date-fns pesam ~60 KB e só fazem falta quando
 * alguém abre uma data. Ver components/date-field.tsx.
 */
export default function CalendarPt(props: ComponentProps<typeof Calendar>) {
  return (
    <Calendar
      locale={ptBR}
      labels={rotulos}
      // Mês e ano viram listas: dá para ir a dezembro do ano passado em dois cliques
      captionLayout="dropdown"
      startMonth={PRIMEIRO_MES}
      endMonth={ULTIMO_MES}
      {...props}
    />
  )
}
