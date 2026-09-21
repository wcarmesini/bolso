// Título discreto, sem descrição: a aba ativa na barra já diz onde a pessoa está.
// Continua existindo para orientar no celular, onde a barra de cima só mostra "Bolso".
export function PageHeader({ title }: { title: string }) {
  return (
    <header className="px-4 pt-5 md:px-6 md:pt-8">
      <h1 className="font-semibold text-lg tracking-tight">{title}</h1>
    </header>
  )
}
