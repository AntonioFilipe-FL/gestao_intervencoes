import { ExternalLink } from 'lucide-react'

const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi

/** Mostra o texto com os links (http/https/www) clicáveis, a abrir num separador novo */
export function LinkText({ value }: { value: string | null | undefined }) {
  if (!value) return <>—</>
  // formato "Texto <https://...>" (links recuperados da Google Sheet): o texto é o link
  const labelled = /^(.*?)\s*<((?:https?:\/\/)[^<>\s]+)>\s*$/.exec(value.replace(/\n/g, " "))
  if (labelled) {
    return (
      <a href={labelled[2]} target="_blank" rel="noopener noreferrer" title={labelled[2]}
        className="inline-flex items-center gap-1 text-fc-light-100 underline hover:text-fc-light-60">
        {labelled[1] || 'Abrir'}
        <ExternalLink className="size-3 shrink-0" />
      </a>
    )
  }
  const parts = value.split(URL_RE)
  return (
    <span className="break-all">
      {parts.map((p, i) =>
        /^(https?:\/\/|www\.)/i.test(p) ? (
          <a
            key={i}
            href={p.startsWith('www.') ? `https://${p}` : p}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-fc-light-100 underline hover:text-fc-light-60"
          >
            {p.length > 60 ? p.slice(0, 57) + '…' : p}
            <ExternalLink className="size-3 shrink-0" />
          </a>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </span>
  )
}

/** Primeiro link encontrado no texto (para o botão "Abrir" no formulário) */
export function firstUrl(value: string | null | undefined) {
  const m = (value ?? '').match(/(?:https?:\/\/|www\.)[^\s<>"']+/i)
  return m ? (m[0].startsWith('www.') ? `https://${m[0]}` : m[0]) : null
}
