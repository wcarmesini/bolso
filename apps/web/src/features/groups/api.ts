import type { GroupContents, GroupMember } from '@bolso/shared'
import { api } from '@/lib/api-client'

export type PendingInvitation = { id: string; email: string; expiresAt: string; link: string }

export type InvitationPreview = {
  id: string
  email: string
  groupName: string
  inviterName: string
  available: boolean
  forYou: boolean
}

export function listMembers() {
  return api<GroupMember[]>('/groups/current/members')
}

export function listInvitations() {
  return api<PendingInvitation[]>('/groups/current/invitations')
}

// Sem serviço de e-mail ainda: o convite volta como link para compartilhar
export function inviteToGroup(email: string) {
  return api<PendingInvitation>('/groups/current/invitations', { method: 'POST', body: { email } })
}

export function renameGroup(name: string) {
  return api<{ id: string; name: string }>('/groups/current', { method: 'PATCH', body: { name } })
}

export function createGroup(name: string) {
  return api<{ id: string; name: string }>('/groups', { method: 'POST', body: { name } })
}

export function activateGroup(id: string) {
  return api<{ id: string }>(`/groups/${id}/activate`, { method: 'POST' })
}

export function getInvitation(id: string) {
  return api<InvitationPreview>(`/invitations/${id}`)
}

export function acceptInvitation(id: string) {
  return api<{ groupId: string }>(`/invitations/${id}/accept`, { method: 'POST' })
}

export function getGroupContents(id: string) {
  return api<GroupContents>(`/groups/${id}/contents`)
}

/** Sem volta: leva embora tudo o que era daquele orçamento. Devolve para qual a sessão foi */
export function deleteGroup(id: string) {
  return api<{ id: string; activeGroupId: string }>(`/groups/${id}`, { method: 'DELETE' })
}
