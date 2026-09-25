import {
  BookOpen,
  Contact2,
  KeyRound,
  Landmark,
  Plug,
  Smartphone,
  Tags,
  Trash2,
  UserRound,
} from 'lucide-react'

export const settingsSections = [
  {
    to: '/ajustes/perfil',
    title: 'Perfil',
    description: 'Seu nome e como você aparece para quem divide',
    icon: UserRound,
  },
  {
    to: '/ajustes/orcamentos',
    title: 'Orçamentos',
    description: 'Seus livros e quem divide cada um',
    icon: BookOpen,
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
    to: '/ajustes/contatos',
    title: 'Contatos',
    description: 'Quem recebe ou paga',
    icon: Contact2,
  },
  {
    to: '/ajustes/lixeira',
    title: 'Lixeira',
    description: 'Lançamentos excluídos, e como trazê-los de volta',
    icon: Trash2,
  },
  {
    to: '/ajustes/integracoes',
    title: 'Integrações',
    description: 'Bancos conectados e serviços que o Bolso usa',
    icon: Plug,
  },
  {
    to: '/ajustes/chaves-api',
    title: 'Chaves de API',
    description: 'Acesso à API do Bolso por outros programas',
    icon: KeyRound,
  },
  {
    to: '/ajustes/aplicativo',
    title: 'Aplicativo',
    description: 'Instalação no celular',
    icon: Smartphone,
  },
] as const
