/**
 * O selo da parcela: "2/10", do lado do nome.
 *
 * Mora num componente só porque aparece em telas diferentes — a lista de lançamentos e a
 * conferência do que veio do banco — e ali a pessoa está comparando as duas: se o selo mudar
 * de cara no meio do caminho, ela perde o fio.
 */
export function InstallmentBadge({
  installment,
}: {
  installment: { number: number; count: number } | null
}) {
  if (!installment) return null
  return (
    <span className="shrink-0 rounded bg-muted px-1 text-[11px] text-muted-foreground tabular-nums">
      {installment.number}/{installment.count}
    </span>
  )
}
