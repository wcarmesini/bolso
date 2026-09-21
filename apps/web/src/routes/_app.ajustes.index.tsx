import { createFileRoute, redirect } from '@tanstack/react-router'

// No computador a lista lateral já está visível, então abre direto a primeira seção.
// No celular fica aqui: o layout mostra a lista de seções.
export const Route = createFileRoute('/_app/ajustes/')({
  beforeLoad: () => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      throw redirect({ to: '/ajustes/perfil', replace: true })
    }
  },
  component: () => null,
})
