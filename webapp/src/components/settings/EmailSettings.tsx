import { buttonVariants } from '@/components/ui/button'
import { getSenderStatus } from '@/lib/gmail'
import { senderEmail } from '@/lib/google'
import { billingRecipients, isBillingEmailEnabled } from '@/lib/billing-notification'
import { BillingEmailToggle } from '@/components/settings/BillingEmailToggle'
import { sql } from '@/lib/db'

const fmt = (d: Date) => d.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Lisbon' })

/** Configurações → Email: ligar a conta de onde saem os emails automáticos à financeira */
export async function EmailSettings({ ok, error }: { ok?: boolean; error?: string }) {
  const status = await getSenderStatus()
  const expected = senderEmail()
  const enabled = await isBillingEmailEnabled()
  const [changed] = await sql<{ updated_at: Date; updated_by: string | null }[]>`select updated_at, updated_by from app_settings where key = 'billing_email_enabled'`

  return (
    <div className="max-w-2xl space-y-5">
      <div className="space-y-1">
        <h2>Email automático à financeira</h2>
        <p className="fc-small text-fc-dark-60">
          Ao gravar um registo com <b>Faturar = Sim</b>, é enviado um resumo para {billingRecipients().join(', ')}.
          As respostas vão para quem registou.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 border border-fc-dark-20 px-4 py-3">
        <div className="flex-1 space-y-0.5">
          <p>
            Envio automático:{' '}
            {enabled ? <b className="text-[#4b850d]">ON</b> : <b className="text-[#b31d25]">OFF — não são enviados emails</b>}
          </p>
          {changed && (
            <p className="fc-small text-fc-dark-60">Alterado {fmt(changed.updated_at)}{changed.updated_by ? ` por ${changed.updated_by}` : ''}</p>
          )}
        </div>
        <BillingEmailToggle enabled={enabled} />
      </div>

      {ok && <p className="bg-fc-success/20 px-3 py-2 text-[#4b850d]">Conta de envio ligada com sucesso.</p>}
      {error && <p className="bg-fc-danger/20 px-3 py-2 text-[#b31d25]">{error}</p>}

      <div className="border border-fc-dark-20">
        <div className="grid grid-cols-[180px_1fr] border-b border-fc-dark-10 bg-fc-grey-80">
          <span className="px-4 py-2.5 text-fc-dark-60">Conta de envio</span>
          <span className="px-4 py-2.5">{expected}</span>
        </div>
        <div className="grid grid-cols-[180px_1fr]">
          <span className="px-4 py-2.5 text-fc-dark-60">Estado</span>
          <span className="px-4 py-2.5">
            {status.connected && status.email === expected ? (
              <span className="text-[#4b850d]">
                Ligada{status.connectedAt ? ` desde ${fmt(status.connectedAt)}` : ''}{status.connectedBy ? ` (por ${status.connectedBy})` : ''}
              </span>
            ) : (
              <span className="text-[#b31d25]">Não ligada — os emails à financeira não são enviados</span>
            )}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <a href="/auth/google?purpose=sender" className={buttonVariants({ variant: status.connected ? 'inverse' : 'default', size: 'lg' })}>
          {status.connected ? 'Voltar a ligar a conta' : `Ligar ${expected}`}
        </a>
        <p className="fc-small text-fc-dark-60">
          Abre o Google: entre com a conta <b>{expected}</b>{' '}(não com a sua) e aceite a permissão
          &ldquo;Enviar email em seu nome&rdquo;. A sua sessão na aplicação não é alterada.
        </p>
      </div>
    </div>
  )
}
