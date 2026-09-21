import { KeyRound, Landmark, Smartphone, Tags, UserRound, Users } from 'lucide-react'

export const settingsSections = [
  {
    to: '/ajustes/perfil',
    title: 'Perfil',
    description: 'Seu nome e como você aparece no grupo',
    icon: UserRound,
  },
  {
    to: '/ajustes/grupo',
    title: 'Grupo',
    description: 'Pessoas que dividem o orçamento',
    icon: Users,
  },
  {
    to: '/ajustes/categorias',
    title: 'Categorias',
    description: 'Como entradas e saídas são organizadas',
    icon: Tags,
  },
  {
    to: '/ajustes/contas',
    title: 'Contas',
    description: 'Bancos, cartões e carteira',
    icon: Landmark,
  },
  {
    to: '/ajustes/chaves-api',
    title: 'Chaves de API',
    description: 'Integrações e acesso por outros apps',
    icon: KeyRound,
  },
  {
    to: '/ajustes/aplicativo',
    title: 'Aplicativo',
    description: 'Instalação no celular',
    icon: Smartphone,
  },
] as const
