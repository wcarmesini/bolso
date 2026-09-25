import { Building2, ChevronDown, Plus, UserRound } from 'lucide-react'
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
import { useContacts, useSaveContact } from '../queries'

type ContactPickerProps = {
  value: string | null
  onChange: (contactId: string | null) => void
  id?: string
  label?: string
}

/**
 * Escolhe o contato do lançamento, com busca sem acento. Se o nome procurado não existe,
 * dá para criar ali mesmo — é quando a pessoa lembra do contato: lançando.
 */
function ContactPickerBase({ value, onChange, id, label = 'Contato' }: ContactPickerProps) {
  const { data: contacts = [] } = useContacts()
  const saveContact = useSaveContact()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = contacts.find((contact) => contact.id === value) ?? null
  const results = useMemo(() => {
    const key = searchKey(query)
    if (!key) return contacts
    return contacts.filter((contact) => searchKey(contact.name).includes(key))
  }, [contacts, query])

  const exato = results.some((contact) => searchKey(contact.name) === searchKey(query))

  const choose = (contactId: string | null) => {
    onChange(contactId)
    setOpen(false)
    setQuery('')
  }

  /*
   * Cria e já escolhe. O cadastro completo (tipo, documento, observação) fica em
   * Ajustes → Contatos: aqui, no meio de um lançamento, o que importa é o nome.
   */
  const criar = async (name: string) => {
    try {
      const contact = await saveContact.mutateAsync({
        values: { name, kind: 'company', document: '', notes: '' },
      })
      choose(contact.id)
      toast.success(`Contato "${contact.name}" criado`)
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível criar o contato.'))
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
        aria-label={`${label}: ${selected?.name ?? 'sem contato'}`}
        render={
          <Button variant="outline" className="w-full min-w-0 justify-between gap-2 font-normal" />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.kind === 'person' ? (
            <UserRound className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className={`truncate ${selected ? '' : 'text-muted-foreground'}`}>
            {selected?.name ?? 'Sem contato'}
          </span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={4} className="w-(--anchor-width) min-w-64 p-0">
        {/* A filtragem é nossa, para poder oferecer "criar" quando nada casa */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar contato…"
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
          <CommandList className="max-h-72">
            <CommandEmpty>Nenhum contato encontrado.</CommandEmpty>

            {!query && (
              <CommandItem value="sem-contato" onSelect={() => choose(null)}>
                Sem contato
              </CommandItem>
            )}

            {results.map((contact) => (
              <CommandItem key={contact.id} value={contact.id} onSelect={() => choose(contact.id)}>
                {contact.kind === 'person' ? <UserRound /> : <Building2 />}
                {contact.name}
              </CommandItem>
            ))}

            {query.trim() && !exato && (
              <CommandItem value="criar-contato" onSelect={() => criar(query.trim())}>
                <Plus />
                Criar “{query.trim()}”
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// Memorizado: dentro de um formulário que muda a cada tecla, ele não precisa re-renderizar
export const ContactPicker = memo(ContactPickerBase)
