import { Eye } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSoLeitura } from '@/lib/access'

// Título discreto, sem descrição: a aba ativa na barra já diz onde a pessoa está.
// Continua existindo para orientar no celular, onde a barra de cima só mostra "Bolso".
export function PageHeader({ title }: { title: string }) {
  const soLeitura = useSoLeitura()

  return (
    <header className="flex items-center gap-2 px-4 pt-5 md:px-6 md:pt-8">
      <h1 className="font-semibold text-lg tracking-tight">{title}</h1>
      {/*
       * Quem só vê precisa saber disso antes de procurar um botão que não existe. O selo fica
       * no título porque é uma condição da tela inteira, não de um lugar dela.
       */}
      {soLeitura && (
        <Tooltip>
          <TooltipTrigger
            render={<span />}
            className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs"
          >
            <Eye className="size-3" />
            Só leitura
          </TooltipTrigger>
          <TooltipContent>
            Seu acesso a este orçamento é de leitura: dá para ver tudo, e nada muda.
          </TooltipContent>
        </Tooltip>
      )}
    </header>
  )
}
