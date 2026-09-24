/** Cabeçalho de página: título H1 (18px uppercase) + subtítulo + ações à direita */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="space-y-1">
        <h1 className="text-fc-dark-100">{title}</h1>
        {subtitle && <p className="fc-small text-fc-dark-60">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
