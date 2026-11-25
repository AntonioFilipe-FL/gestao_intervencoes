import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { sql } from '@/lib/db'
import { Picagem } from '@/components/picagem/Picagem'

/** PWA "Picagem": picar IMEIs (câmara ou leitor) e transferir para um armazém. Instalável no telemóvel (manifesto próprio). */
export const metadata: Metadata = {
  title: 'Picagem · Frotcom',
  description: 'Picar IMEIs (QR / código de barras) e transferir entre armazéns',
  manifest: '/picagem.webmanifest',
  icons: { icon: '/icons/picagem-192.png', apple: '/icons/picagem-192.png' },
  appleWebApp: { capable: true, title: 'Picagem', statusBarStyle: 'black-translucent' },
}
export const viewport: Viewport = { themeColor: '#263646', width: 'device-width', initialScale: 1, viewportFit: 'cover' }

// armazéns só de leitura (espelham contas da Intranet): não podem ser destino nem origem de transferências
const READ_ONLY = /^\s*(tr[aâ]nsito?|suspensos)\s*$/i

export default async function PicagemPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/picagem')
  if (!can(user, 'stock', 'write')) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-fc-dark-100 p-6 text-center text-white">
        <div className="space-y-2">
          <h2 className="text-white">Sem acesso à picagem</h2>
          <p>É preciso ter permissão de escrita no Stock. Fale com o administrador.</p>
        </div>
      </div>
    )
  }
  const warehouses = await sql<{ id: string; name: string; type: string }[]>`select id, name, type from warehouses where active order by name`
  return (
    <Picagem
      destinations={warehouses.filter((w) => w.type !== 'mobilizado' && !READ_ONLY.test(w.name)).map(({ id, name }) => ({ id, name }))}
      isAdmin={user.role === 'admin'}
      userName={user.name ?? user.email}
    />
  )
}
