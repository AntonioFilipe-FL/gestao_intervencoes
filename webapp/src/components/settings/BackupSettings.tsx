'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, buttonVariants } from '@/components/ui/button'
import { runBackupNow } from '@/actions/jobs'

type Status = { connected: boolean; email: string | null; last: { at: string; ok: boolean; error?: string; result?: { file?: string; mb?: number; rows?: number } } | null }

/** Super admin: cópias de segurança diárias da base de dados para o Google Drive */
export function BackupSettings({ status, ok, error }: { status: Status; ok?: boolean; error?: string }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fmt = (d: string) => new Date(d).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'short', timeStyle: 'short' })
  return (
    <div className="space-y-3">
      <div>
        <h2>Cópias de segurança</h2>
        <p className="fc-small text-fc-dark-60">
          Uma vez por dia, a app guarda todos os dados (intervenções, stock, acessórios, configurações) num ficheiro comprimido no Google Drive,
          na pasta &ldquo;Backup_Gestao_Interv&rdquo;. Ficam as 30 mais recentes; as antigas vão para o lixo do Drive.
          A app só tem acesso aos ficheiros que ela própria cria.
        </p>
      </div>
      {ok && <p className="bg-fc-success/20 px-3 py-2 text-[#4b850d]">Google Drive ligado.</p>}
      {error && <p className="bg-fc-danger/20 px-3 py-2 text-[#b31d25]">{error}</p>}
      <div className="border border-fc-dark-20 px-3 py-2">
        <p>Google Drive: {status.connected ? <b>ligado ({status.email})</b> : <b className="text-[#b31d25]">não ligado</b>}</p>
        <p>
          Última cópia:{' '}
          {!status.last ? <span className="text-[#b31d25]">ainda não foi feita nenhuma</span>
            : status.last.ok ? <span>{fmt(status.last.at)} · {status.last.result?.file} · {status.last.result?.mb} MB · {status.last.result?.rows?.toLocaleString('pt-PT')} registos</span>
            : <span className="text-[#b31d25]">{fmt(status.last.at)} · falhou: {status.last.error}</span>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a href="/auth/google?purpose=drive" className={buttonVariants({ variant: 'inverse' })}>{status.connected ? 'Voltar a ligar o Google Drive' : 'Ligar o Google Drive'}</a>
        <Button disabled={busy || !status.connected} onClick={() => start(async () => {
          setMsg(null)
          const r = await runBackupNow()
          setMsg(r.ok ? { ok: true, text: `Cópia guardada no Drive: ${r.file} (${r.mb} MB, ${r.rows.toLocaleString('pt-PT')} registos).` } : { ok: false, text: r.error })
          router.refresh()
        })}>{busy ? 'A fazer a cópia… (pode demorar um minuto)' : 'Fazer cópia agora'}</Button>
        {msg && <span className={`fc-small ${msg.ok ? 'text-[#4b850d]' : 'text-[#b31d25]'}`}>{msg.text}</span>}
      </div>
    </div>
  )
}
