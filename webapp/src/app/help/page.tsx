import { can, type Module } from '@/lib/permissions'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { ChevronRight } from 'lucide-react'

type Section = { id: string; title: string; who?: Module | 'superadmin'; body: React.ReactNode }

const H = ({ children }: { children: React.ReactNode }) => <p className="mt-3 font-bold">{children}</p>
const L = ({ items }: { items: React.ReactNode[] }) => <ul className="ml-5 list-disc space-y-1">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>

const SECTIONS: Section[] = [
  {
    id: 'perfis', title: 'Perfis de acesso',
    body: <L items={[
      <><b>User</b> — consulta intervenções e relatórios; pede atualizações de firmware/CAN chip (Atualização Equipamento).</>,
      <><b>Financeiro</b> — como o user, e marca a faturação como <i>Processado</i>.</>,
      <><b>Admin</b> — regista e edita intervenções, receções, transferências, acertos e configurações.</>,
      <><b>Perfis personalizados</b> — o super admin cria perfis em <i>Configurações → Perfis</i> e define, por menu (Intervenções, Stock material, Stock acessórios, Atualização equipamento, Relatórios, Configurações, Faturação), <i>Sem acesso</i>, <i>Ler</i> ou <i>Ler e escrever</i>. Os menus sem acesso ficam escondidos. Os perfis User e Financeiro também podem ser ajustados.</>,
      <><b>Super admin</b> — tudo o que o admin faz, mais: <b>gerir utilizadores e permissões</b> (só o super admin), margem do stock mínimo, matrículas/contas na Intranet e aviso de contas novas. O super admin não pode ser alterado nem removido.</>,
    ]} />,
  },
  {
    id: 'intervencoes', title: 'Intervenções', who: 'interventions',
    body: <>
      <L items={[
        <>Em <b>Novo registo</b> preenche-se o cliente, técnico, tipo, matrícula e IMEI. Ao escolher o IMEI, a conta e a matrícula da Intranet são preenchidas automaticamente.</>,
        <><b>Material gasto</b> (saída) e <b>material retomado</b> (entrada) movimentam o stock: o IMEI gasto sai do armazém de saída; o retomado entra no armazém de entrada.</>,
        <>Ao escolher um equipamento, os acessórios do <b>kit</b> são sugeridos (exceto em assistências, onde os acessórios ficam na viatura).</>,
        <>Nas <b>Entregas / Entradas de Material</b> podem colar-se vários IMEIs em <i>IMEIs adicionais</i>; o kit dos equipamentos entra automaticamente se não for registado à mão.</>,
        <>O detalhe da intervenção mostra o <b>Equipamento</b>, que é o que movimenta o stock.</>,
        <>Editar ou eliminar uma intervenção recalcula o stock dessa intervenção (e os acessórios).</>,
        <>Na lista, as colunas <b>Faturar</b> e <b>Processado</b> controlam a faturação; o filtro <i>Faturação</i> mostra as que estão por processar.</>,
      ]} />
      <H>Regras de stock nas intervenções</H>
      <L items={[
        <><b>Venda</b>: o equipamento instalado sai do stock. <b>Aluguer</b>: fica no armazém <i>Instalado Aluguer (Mobilizado)</i>.</>,
        <><b>Desinstalação</b> sem armazém de entrada: Aluguer → sai do Mobilizado e entra no armazém do técnico; Venda → o equipamento é do cliente e sai do stock (se ainda lá estivesse).</>,
        <>Clientes de Venda/Aluguer: a modalidade da intervenção define o destino do equipamento. Defina a modalidade de cada cliente em Configurações › Clientes.</>,
      ]} />
    </>,
  },
  {
    id: 'stock', title: 'Stock material (IMEIs)', who: 'stock',
    body: <>
      <L items={[
        <>Os cartões mostram o total por armazém (Venda / Aluguer). <b>Mobilizado, Abate e Trash Bin</b> não contam no total em stock.</>,
        <>A tabela <b>Por equipamento e armazém</b> mostra quantidades; clicar num número abre a lista desses IMEIs. O equipamento é sempre o do hardware da Intranet.</>,
        <><b>IMEIs em stock</b> e <b>Últimos movimentos</b> abrem-se ao clicar no título. Clicar num IMEI mostra o histórico dele.</>,
        <><b>Exportar Excel</b> gera a lista de IMEIs (atualiza da Intranet antes, se necessário).</>,
        <>Aviso <b>instalados na Intranet</b>: IMEIs que estão em stock mas a Intranet mostra numa viatura de cliente — <b>Dar saída</b> usa a modalidade da conta do cliente (Aluguer → Mobilizado; Venda → sai do stock).</>,
        <>Aviso <b>Uso Interno</b>: IMEIs nas contas de demonstração/teste (demopt, testing) que devem estar no armazém Uso Interno.</>
      ]} />
      <H>Receção</H>
      <L items={[<>Material que chega (compra, fornecedor). Escolhe-se o armazém e a modalidade; o equipamento é identificado pelo hardware da Intranet.</>,
        <><b>Receção automática</b>: equipamentos novos na conta <i>Frotcom Lusitana</i> (pelo Shipped on) entram sozinhos no A1, com os acessórios do kit. Aparece um aviso aos admins.</>]} />
      <H>Transferência</H>
      <L items={[
        <>Origem <b>Automático</b>: a app vê onde está cada IMEI; pode-se escolher um ou vários armazéns de origem (com <i>ver IMEIs</i> em cada um). O destino é sempre um.</>,
        <>Do A1/A2 para um técnico, os acessórios do kit vão também.</>,
        <>Opção <b>Atualizar a matrícula na Intranet</b>: muda a matrícula para a nomenclatura do armazém de destino e, se escolhida, transfere para uma conta <i>Frotcom Lusitana…</i> (sem apagar dados). Formatos:
          <L items={[<><code>XX_Ay_ZZZ_12345</code> — RL, RN, LS, CG, TC, PG… (A1/A2 → <b>FL</b>); y = 1 Venda / 2 Aluguer; ZZZ = NOS (PT-Optimus) / VDF (PT-Vodafone); últimos 5 dígitos</>,
            <><code>RMA_Ay_ZZZ12345</code> · <code>ABATE_ZZZ12345</code> · <code>Trash_123456</code> (6 dígitos)</>,
            <>Equip. Pago, Uso Interno e Mobilizado não são alterados. PIN, MSISDN e operador ficam iguais.</>]} /></>,
      ]} />
      <H>Acerto de stock</H>
      <L items={[
        <><b>Contagem do armazém</b>: cola-se o que está fisicamente; a app mostra o que falta e o que sobra antes de aplicar.</>,
        <><b>Retirar IMEIs</b>: perdido, avariado, devolvido, erro de registo.</>,
        <><b>Substituição RMA</b>: IMEIs antigos à esquerda, novos à direita (mesma ordem); sugere os IMEIs recentes das contas RMA / Storage Service / Installation / Refurbished.</>,
        <><b>Mudar modalidade</b>: Venda ↔ Aluguer sem mudar de armazém.</>,
      ]} />
      <H>Stock mínimo</H>
      <L items={[<>Botão <b>Stock mínimo</b>: define-se por equipamento e armazém. Na tabela: <span className="text-[#d0312d]">●</span> igual ou abaixo do mínimo, <span className="text-[#f2b600]">●</span> até X% acima (margem definida pelo super admin, por omissão 20%).</>,
        <>Os admins recebem, uma vez por dia ao entrar, o aviso <b>Stock abaixo do mínimo</b> por armazém/técnico.</>]} />
      <H>Histórico de transferências</H>
      <L items={[<>Lotes de receções, transferências e acertos agrupados; um movimento manual pode ser <b>anulado</b>.</>]} />
    </>,
  },
  {
    id: 'atualizacao', title: 'Atualização de equipamento', who: 'equipment',
    body: <L items={[
      <>Menu <b>Atualização Equipamento</b>, disponível para todos os utilizadores.</>,
      <>Separador <b>Firmware do equipamento</b> (FMC640, FMC650, FMC130, FMC150, C4MAX V8, C4MAX V4) e <b>CAN chip</b> (só FMC150).</>,
      <>Escolhe-se uma ou mais <b>contas Intranet</b> e/ou colam-se IMEIs; a pré-visualização lê na Intranet a versão atual, a disponível e o último pedido, e só mostra os equipamentos que podem ser atualizados.</>,
      <>Marcam-se os pretendidos, <b>Testar com 1</b> e depois <b>Atualizar</b>. O pedido fica <i>Pending</i> na Intranet até o equipamento comunicar. Equipamentos com pedido pendente não podem ser pedidos de novo.</>,
      <>A pré-visualização mostra a <b>ignição</b> e a <b>última comunicação</b>. O pedido só é enviado com a <b>ignição desligada</b>; com a ignição ligada fica <i>Em espera</i> e a app envia-o sozinha quando a ignição desligar (até 7 dias).</>,
    ]} />,
  },
  {
    id: 'acessorios', title: 'Stock acessórios', who: 'accessories',
    body: <L items={[
      <>Quantidade por armazém = última <b>contagem</b> + receções, transferências e acessórios gastos/retomados nas intervenções.</>,
      <>Um ✓ indica que o armazém já foi contado. Valores a vermelho são negativos (gastou-se mais do que entrou): corrigem-se com uma <b>Contagem</b>.</>,
      <>Os <b>kits</b> entram/saem automaticamente: receção automática (A1), Entregas/Entradas de Material sem acessórios registados, e transferências de equipamento do A1/A2 para um técnico.</>,
      <>Para os kits contarem, cada acessório tem de estar associado a um item em Configurações › Mapeamento de acessórios.</>,
      <>Armazéns inativos (ex.: Stock Frotcom) não aparecem e não contam no total.</>,
    ]} />,
  },
  {
    id: 'config', title: 'Configurações', who: 'settings',
    body: <L items={[
      <>Tabelas de referência: técnicos, clientes (com Venda/Aluguer), equipamentos (e kits), acessórios, tipos, motivos, armazéns, bundles.</>,
      <><b>Intranet</b>: sincronização de contas e IMEIs; associar contas novas a clientes.</>,
      <><b>Email</b>: envio automático à financeira (ligar/desligar).</>,
      <>Os <b>Utilizadores</b> e os <b>Perfis</b> só são geridos pelo super admin. Com perfil de leitura nas Configurações vê-se as tabelas, mas não se altera nada.</>,
    ]} />,
  },
  {
    id: 'superadmin', title: 'Super admin', who: 'superadmin',
    body: <L items={[
      <><b>Utilizadores</b>: adicionar/remover acessos, atribuir o perfil e tornar alguém super admin (retirar só por script).</>,
      <><b>Histórico de atualizações</b>: em <i>Atualização Equipamento</i>, por baixo do formulário, a lista dos pedidos de firmware e CAN chip enviados (data, IMEI, versões, resultado e quem pediu), com a conta Intranet e filtros por IMEI/conta/utilizador, tipo e datas. Ao abrir a página, a app confirma na Intranet os pedidos pendentes: <i>Atualizado</i> (a versão pedida já está instalada), <i>Falhou na Intranet</i> ou <i>Enviado · pendente</i>, com o aviso <i>não comunica desde…</i> quando o equipamento está sem comunicar. Os pedidos só seguem para a Intranet com a <b>ignição desligada</b>; com a ignição ligada ficam <i>Em espera</i> e são enviados automaticamente quando desligar (expiram ao fim de 7 dias).</>,
      <><b>Perfis</b>: criar, renomear e apagar perfis e definir, em cada menu, <i>Sem acesso</i>, <i>Ler</i> ou <i>Ler e escrever</i>. O Administrador tem sempre tudo; os perfis base não se apagam, nem um perfil com utilizadores.</>,
      <><b>Margem do stock mínimo</b> (aviso amarelo).</>,
      <><b>Matrículas na Intranet</b>: escolher armazéns e/ou IMEIs, marcar os pretendidos, <b>Testar com 1</b> e atualizar; opcionalmente transferir para qualquer conta Intranet. Mesmos formatos da transferência (ver Stock material). Tudo fica registado.</>,
      <>Aviso de <b>contas novas na Intranet</b> ao entrar, com opção de criar o cliente.</>,
    ]} />,
  },
  {
    id: 'outros', title: 'Outros',
    body: <L items={[
      <><b>Modo escuro</b>: ícone 🌙 / ☀️ na barra de topo, ao lado do email (fica guardado no browser).</>,
      <>Avisos ao entrar: <b>Material novo recebido</b> e <b>Stock abaixo do mínimo</b> (admins), <b>Contas novas na Intranet</b> (super admin).</>,
      <>Janelas e campos de IMEIs grandes têm scroll; as secções longas do Stock abrem-se ao clicar no título.</>,
      <>Só aparecem nesta ajuda os menus a que o seu perfil tem acesso. Se lhe faltar um menu ou um botão, peça ao super admin para ajustar o perfil.</>,
      <>Em caso de dúvida ou erro, contacte o administrador da aplicação.</>,
    ]} />,
  },
]

export default async function HelpPage() {
  const user = await requireUser()
  const visible = SECTIONS.filter((s) => !s.who || (s.who === 'superadmin' ? user.superadmin : can(user, s.who)))
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
