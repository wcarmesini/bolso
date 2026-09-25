import { z } from 'zod'

/*
 * Contato: quem recebe ou paga — o mercado, o senhorio, o cliente, a escola.
 * Serve para responder "quanto eu já gastei com fulano" sem depender da descrição digitada.
 */
export const contactKinds = ['person', 'company'] as const
export type ContactKind = (typeof contactKinds)[number]

export const isContactKind = (value: unknown): value is ContactKind =>
  value === 'person' || value === 'company'

export const contactKindLabels: Record<ContactKind, string> = {
  person: 'Pessoa',
  company: 'Empresa',
}

export const contactFormSchema = z.object({
  name: z.string().trim().min(1, 'Informe um nome').max(60, 'Use até 60 caracteres'),
  kind: z.enum(contactKinds),
  /** CPF, CNPJ ou qualquer identificação: texto livre, porque nem todo contato tem documento */
  document: z.string().trim().max(24, 'Use até 24 caracteres'),
  notes: z.string().trim().max(200, 'Use até 200 caracteres'),
})
export type ContactFormValues = z.infer<typeof contactFormSchema>

export const contactSchema = contactFormSchema.extend({
  id: z.string(),
  createdAt: z.string(),
})
export type Contact = z.infer<typeof contactSchema>
