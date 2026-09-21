import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acceptInvitation,
  activateGroup,
  createGroup,
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
