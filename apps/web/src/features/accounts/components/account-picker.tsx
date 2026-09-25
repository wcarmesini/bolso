import { accountTypeLabels, isCreditCard } from '@bolso/shared'
import { ChevronDown, CreditCard, Plus, Wallet } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { searchKey } from '@/features/transactions/category-options'
import { errorMessage } from '@/lib/errors'
import { useAccounts, useSaveAccount } from '../queries'

type AccountPickerProps = {
  value: string | null
  onChange: (accountId: string | null) => void
  id?: string
  label?: string
  invalid?: boolean
  /** Travado: o lançamento está conciliado, e a conta é o que identifica o movimento */
  disabled?: boolean
}

/**
 * Escolhe a conta do lançamento, com busca. Se ela ainda não existe, dá para criar ali mesmo —
 * como conta comum, que é o caso da maioria; cartão pede fechamento e vencimento, e esses
 * ficam em Ajustes → Contas.
 */
function AccountPickerBase({
  value,
  onChange,
  id,
  label = 'Conta',
  invalid,
  disabled,
}: AccountPickerProps) {
  const { data: accounts = [] } = useAccounts()
  const saveAccount = useSaveAccount()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = accounts.find((account) => account.id === value) ?? null
  const results = useMemo(() => {
    const key = searchKey(query)
    if (!key) return accounts
    return accounts.filter((account) => searchKey(account.name).includes(key))
  }, [accounts, query])

  const nome = query.trim()
  const existe = accounts.some((account) => searchKey(account.name) === searchKey(nome))

  const choose = (accountId: string | null) => {
    onChange(accountId)
    setOpen(false)
    setQuery('')
  }

  const criar = async () => {
    try {
      const account = await saveAccount.mutateAsync({
        values: {
          name: nome,
          type: 'checking',
          initialBalanceCents: 0,
          closingDay: null,
          dueDay: null,
          limitCents: null,
        },
      })
      choose(account.id)
      toast.success(`Conta "${account.name}" criada`, {
        description: 'Se for cartão, ajuste o tipo em Ajustes → Contas.',
      })
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível criar a conta.'))
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger
        id={id}
        aria-label={`${label}: ${selected?.name ?? 'sem conta'}`}
        aria-invalid={invalid}
        disabled={disabled}
        render={
          <Button
            variant="outline"
            className="w-full min-w-0 justify-between gap-2 font-normal aria-invalid:border-destructive"
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected && isCreditCard(selected.type) ? (
            <CreditCard className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Wallet className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className={`truncate ${selected ? '' : 'text-muted-foreground'}`}>
            {selected?.name ?? 'Sem conta'}
          </span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={4} className="w-(--anchor-width) min-w-64 p-0">
        {/* A filtragem é nossa, para poder oferecer "criar" quando nada casa */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar conta…"
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
          <CommandList className="max-h-72">
            <CommandEmpty>Nenhuma conta encontrada.</CommandEmpty>

            {!query && (
              <CommandItem value="sem-conta" onSelect={() => choose(null)}>
                <Wallet className="text-muted-foreground" />
                Sem conta
              </CommandItem>
            )}

            {results.map((account) => (
              <CommandItem key={account.id} value={account.id} onSelect={() => choose(account.id)}>
                {isCreditCard(account.type) ? <CreditCard /> : <Wallet />}
                {account.name}
                <span className="ml-auto text-muted-foreground text-xs">
                  {accountTypeLabels[account.type]}
                </span>
              </CommandItem>
            ))}

            {nome && !existe && (
              <CommandItem value="criar-conta" onSelect={() => void criar()}>
                <Plus />
                Criar “{nome}”
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// Memorizado: dentro de um formulário que muda a cada tecla, ele não precisa re-renderizar
export const AccountPicker = memo(AccountPickerBase)
