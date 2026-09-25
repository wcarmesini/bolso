import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { LogOut, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { signOut } from '@/features/auth/api'
import { useMe } from '@/features/auth/queries'
import { useDisplayName, useProfile } from '@/features/profile/queries'
import { getInitials } from '@/lib/current-user'
import { errorMessage } from '@/lib/errors'

// Segue o exemplo "Dropdown" do Avatar na documentação do shadcn (versão Base UI)
export function AccountMenu() {
  const name = useDisplayName()
  const { photo } = useProfile()
  const groupName = useMe().data?.activeGroup?.name
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const leave = async () => {
    try {
      await signOut()
      // Limpa os dados do orçamento antes de sair, para nada ficar em cache
      queryClient.clear()
      await navigate({ to: '/entrar' })
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível sair.'))
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Conta"
        title={name}
        render={<Button variant="ghost" size="icon" className="rounded-full" />}
      >
        <Avatar size="sm">
          {photo && <AvatarImage src={photo} alt="" />}
          <AvatarFallback className="bg-primary font-semibold text-primary-foreground">
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-56">
        <div className="px-1.5 py-1.5">
          <p className="truncate font-medium text-sm">{name}</p>
          <p className="truncate text-muted-foreground text-xs">{groupName ?? 'Sem orçamento'}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link to="/ajustes" />}>
            <Settings />
            Ajustes
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onClick={leave}>
            <LogOut />
            Sair
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
