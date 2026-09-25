import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acceptInvitation,
  activateGroup,
  createGroup,
  deleteGroup,
  getGroupContents,
  inviteToGroup,
  listInvitations,
  listMembers,
  renameGroup,
} from './api'

export function useGroupMembers() {
  return useQuery({ queryKey: ['group-members'], queryFn: listMembers })
}

export function useGroupInvitations() {
  return useQuery({ queryKey: ['group-invitations'], queryFn: listInvitations })
}

export function useInviteToGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: inviteToGroup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-invitations'] }),
  })
}

export function useRenameGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: renameGroup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  })
}

// Criar grupo ou trocar de grupo muda tudo o que está na tela: recarrega o cache inteiro
export function useCreateGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createGroup,
    onSuccess: () => queryClient.invalidateQueries(),
  })
}

export function useActivateGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: activateGroup,
    onSuccess: () => queryClient.invalidateQueries(),
  })
}

export function useAcceptInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: acceptInvitation,
    onSuccess: () => queryClient.invalidateQueries(),
  })
}

// O que existe dentro de um orçamento: só é buscado quando a confirmação de exclusão abre
export function useGroupContents(id: string | null) {
  return useQuery({
    queryKey: ['group-contents', id],
    queryFn: () => getGroupContents(id ?? ''),
    enabled: id !== null,
  })
}

// Excluir derruba o orçamento inteiro e pode trocar o em uso: recarrega o cache todo
export function useDeleteGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteGroup,
    onSuccess: (_resultado, id) => {
      // Menos o conteúdo do que acabou de ser excluído: perguntar de novo daria 404
      queryClient.removeQueries({ queryKey: ['group-contents', id] })
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== 'group-contents',
      })
    },
  })
}
