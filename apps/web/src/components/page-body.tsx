import type { ReactNode } from 'react'

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 px-4 py-5 md:gap-6 md:px-6 md:py-6">{children}</div>
}
