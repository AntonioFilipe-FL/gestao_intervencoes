import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { ChevronRight } from 'lucide-react'

type Section = { id: string; title: string; who?: 'admin' | 'superadmin'; body: React.ReactNode }

const H = ({ children }: { children: React.ReactNode }) => <p className="mt-3 font-bold">{children}</p>
const L = ({ items }: { items: React.ReactNode[] }) => <ul className="ml-5 list-disc space-y-1">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>

const SECTIONS: Section[] = [
  {
    id: 'perfis', title: 'Perfis de acesso',
    body: <L items={[
      <><b>User</b> — consulta intervenções, stock e relatórios.</>,
      <><b>Financeiro</b> — como o user, e marca a faturação como <i>Processado</i>.</>,
      <><b>Admin</b> — regista e edita intervenções, receções, transferências, acertos e configurações.</>,
      <><b>Super admin</b> — tudo o que o admin faz, mais: gerir utilizadores e permissões, margem do stock mínimo e atualizar matrículas/contas na Intranet.</>,
    ]} />,
  },
  {
    id: 'intervencoes', title: 'Intervenções',
    body: <>
      <L items={[
        <>Em <b>Novo registo</b> preenche-se o cliente, técnico, tipo, matrícula e IMEI. Ao escolher o IMEI, a conta e a matrícula da Intranet são preenchidas automaticamente.</>,
        <><b>Material gasto</b> (saída) e <b>material retomado</b> (entrada) movimentam o stock: o IMEI gasto sai do armazém de saída; o retomado entra no armazém de entrada.</>,
        <>Ao escolher um equipamento, os acessórios do <b>kit</b> são sugeridos (exceto em assistências, onde os acessórios ficam na viatura).</>,
        <>Nas <b>Entregas / Entradas de Material</b> podem colar-se vários IMEIs em <i>IMEIs adicionais</i>; o kit dos equipamentos entra automaticamente se não for registado à mão.</>,
        <>Editar ou eliminar uma intervenção recalcula o stock dessa intervenção.</>,
        <>Na lista, as colunas <b>Faturar</b> e <b>Processado</b> controlam a faturação; o filtro <i>Faturação</i> mostra as que estão por processar.</>,
      ]} />
      <H>Regras de stock nas intervenções</H>
      <L items={[
        <><b>Venda</b>: o equipamento instalado sai do stock. <b>Aluguer</b>: fica no armazém <i>Instalado Aluguer (Mobilizado)</i>.</>,
        <><b>Desinstalação</b> sem armazém de entrada: Aluguer → sai do Mobilizado e entra no armazém do técnico; Venda → o equipamento é do cliente e não entra no stock.</>,
      ]} />
    </>,
  },
  {
    id: 'stock', title: 'Stock material (IMEIs)', who: 'admin',
    body: <>
      <L items={[
        <>Os cartões mostram o total por armazém (Venda / Aluguer). <b>Mobilizado, Abate e Trash Bin</b> não contam no total em stock.</>,
        <>A tabela <b>Por equipamento e armazém</b> mostra quantidades; clicar num número abre a lista desses IMEIs. O equipamento é sempre o do hardware da Intranet.</>,
        <><b>IMEIs em stock</b> e <b>Últimos movimentos</b> abrem-se ao clicar no título. Clicar num IMEI mostra o histórico dele.</>,
        <><b>Exportar Excel</b> gera a lista de IMEIs (atualiza da Intranet antes, se necessário).</>,
      ]} />
      <H>Receção</H>
      <L items={[<>Material que chega (compra, fornecedor). Escolhe-se o armazém e a modalidade; o equipamento é identificado pelo hardware da Intranet.</>,
        <><b>Receção automática</b>: equipamentos novos na conta <i>Frotcom Lusitana</i> (pelo Shipped on) entram sozinhos no A1, com os acessórios do kit. Aparece um aviso aos admins.</>]} />
      <H>Transferência</H>
      <L items={[
        <>Origem <b>Automático</b>: a app vê onde está cada IMEI; pode-se escolher um ou vários armazéns de origem (com <i>ver IMEIs</i> em cada um). O destino é sempre um.</>,
        <>Do A1/A2 para um técnico, os acessórios do kit vão também.</>,
        <>Opção <b>Atualizar a matrícula na Intranet</b>: muda a matrícula para a nomenclatura do armazém de destino e, se escolhida, transfere para uma conta <i>Frotcom Lusitana…</i>.</>,
      ]} />
      <H>Acerto de stock</H>
      <L items={[
        <><b>Contagem do armazém</b>: cola-se o que está fisicamente; a app mostra o que falta e o que sobra antes de aplicar.</>,
        <><b>Retirar IMEIs</b>: perdido, avariado, devolvido, erro de registo.</>,
        <><b>Substituição RMA</b>: IMEIs antigos à esquerda, novos à direita (mesma ordem); sugere os IMEIs recentes das contas RMA / Storage Service / Installation / Refurbished.</>,
        <><b>Mudar modalidade</b>: Venda ↔ Aluguer sem mudar de armazém.</>,
      ]} />
      <H>Stock mínimo</H>
      <L items={[<>Define-se por equipamento e armazém. Na tabela: <span className="text-[#d0312d]">●</span> igual ou abaixo do mínimo, <span className="text-[#f2b600]">●</span> perto do mínimo. Os admins recebem um aviso diário ao entrar.</>]} />
      <H>Histórico de transferências</H>
      <L items={[<>Lotes de receções, transferências e acertos agrupados; um movimento manual pode ser <b>anulado</b>.</>]} />
    </>,
  },
  {
    id: 'acessorios', title: 'Stock acessórios', who: 'admin',
    body: <L items={[
      <>Quantidade por armazém = última <b>contagem</b> + receções, transferências e acessórios gastos/retomados nas intervenções.</>,
      <>Um ✓ indica que o armazém já foi contado. Valores a vermelho são negativos (gastou-se mais do que entrou): corrigem-se com uma <b>Contagem</b>.</>,
      <>Para os kits contarem, cada acessório tem de estar associado a um item em Configurações › Mapeamento de acessórios.</>,
    ]} />,
  },
  {
    id: 'config', title: 'Configurações', who: 'admin',
    body: <L items={[
      <>Tabelas de referência: técnicos, clientes (com Venda/Aluguer), equipamentos (e kits), acessórios, tipos, motivos, armazéns, bundles.</>,
      <><b>Intranet</b>: sincronização de contas e IMEIs; associar contas novas a clientes.</>,
      <><b>Email</b>: envio automático à financeira (ligar/desligar).</>,
    ]} />,
  },
  {
    id: 'superadmin', title: 'Super admin', who: 'superadmin',
    body: <L items={[
      <><b>Utilizadores</b>: adicionar/remover acessos, mudar perfis e tornar alguém super admin (retirar só por script).</>,
      <><b>Margem do stock mínimo</b> (aviso amarelo).</>,
      <><b>Matrículas na Intranet</b>: escolher armazéns e/ou IMEIs, pré-visualizar e atualizar (Testar com 1 primeiro). Formatos: <code>XX_Ay_ZZZ_12345</code> (A1/A2 → FL), <code>RMA_Ay_ZZZ12345</code>, <code>ABATE_ZZZ12345</code>, <code>Trash_123456</code>; ZZZ = NOS (PT-Optimus) / VDF (PT-Vodafone). PIN, MSISDN e operador não são alterados.</>,
      <>Aviso de <b>contas novas na Intranet</b> ao entrar, com opção de criar o cliente.</>,
    ]} />,
  },
  {
    id: 'outros', title: 'Outros',
    body: <L items={[
      <><b>Modo escuro</b>: ícone 🌙 / ☀️ na barra de topo, ao lado do email.</>,
      <>Em caso de dúvida ou erro, contacte o administrador da aplicação.</>,
    ]} />,
  },
]

export default async function HelpPage() {
  const user = await requireUser()
  const visible = SECTIONS.filter((s) => !s.who || (s.who === 'admin' ? user.role === 'admin' : user.superadmin))
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1>Ajuda</h1>
        <p className="fc-small text-fc-dark-60">Como usar a aplicação Gestão de Intervenções.</p>
      </div>
      <nav className="flex flex-wrap gap-x-4 gap-y-1 fc-small">
        {visible.map((s) => <Link key={s.id} href={`#${s.id}`} className="text-fc-light-100 hover:text-fc-light-60">{s.title}</Link>)}
      </nav>
      <div className="space-y-3">
        {visible.map((s, i) => (
          <details key={s.id} id={s.id} open={i === 0} className="group scroll-mt-4 border border-fc-dark-20 bg-white">
            <summary className="cursor-pointer list-none px-5 py-3 font-bold uppercase [&::-webkit-details-marker]:hidden">
              <ChevronRight className="mr-1 inline size-4 align-[-3px] transition-transform group-open:rotate-90" />{s.title}
            </summary>
            <div className="space-y-1 border-t border-fc-dark-10 px-5 py-4">{s.body}</div>
          </details>
        ))}
      </div>
    </div>
  )
}
