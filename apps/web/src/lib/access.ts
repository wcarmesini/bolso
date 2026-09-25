import { canEdit, canManageAccess } from '@bolso/shared'
import { useMe } from '@/features/auth/queries'

/**
 * O que a pessoa pode fazer no orçamento em uso.
 *
 * A garantia é do servidor (ele recusa qualquer gravação de quem só vê); isto aqui é para a
 * tela não oferecer o que não vai poder ser feito. Enquanto o perfil não chegou, a resposta é
 * "não pode" — é melhor um botão aparecer um instante depois do que sumir na cara da pessoa.
 */
export function usePodeEditar() {
  const { data: me } = useMe()
  return canEdit(me?.activeGroup?.role)
}

/** Convidar, mudar o nível de alguém, tirar o acesso */
export function usePodeGerenciarAcesso() {
  const { data: me } = useMe()
  return canManageAccess(me?.activeGroup?.role)
}

/** Só enxerga: serve para os avisos de "este orçamento é só leitura para você" */
export function useSoLeitura() {
  const { data: me } = useMe()
  return me?.activeGroup?.role === 'viewer'
}
