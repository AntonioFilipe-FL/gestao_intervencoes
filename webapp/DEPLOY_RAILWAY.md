# Deploy no Railway

A app (Next.js) e a base de dados (PostgreSQL) ficam no mesmo projeto Railway.

## 1. Criar o serviço

A app é um **serviço novo dentro do projeto Railway que já tem o PostgreSQL** (a BD é partilhada;
as tabelas ficam isoladas no esquema `gestao_interv`). Estar no mesmo projeto permite usar a rede
privada e a referência `${{Postgres.DATABASE_URL}}` — sem custos de egress entre app e BD.

1. Abrir o projeto existente → **+ Create** → **GitHub Repo** → `AntonioFilipe-FL/gestao_intervencoes`.
2. No novo serviço, **Settings → Source → Root Directory** = `webapp`.
3. Confirmar que o nome do serviço de BD é `Postgres` (se for outro, ajustar a referência abaixo).

## 2. Variáveis do serviço da app (Variables)

| Variável | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `AUTH_SECRET` | string aleatória com 32+ caracteres (ver `.env.example`) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | credenciais OAuth do Google Cloud |
| `APP_URL` | `https://<app>.up.railway.app` (ou domínio próprio) |
| `ADMIN_EMAILS` | o teu email (fica admin no primeiro login) |
| `NEXT_TELEMETRY_DISABLED` | `1` |

Em **Settings → Networking → Generate Domain** para obter o URL público.
O Railway deteta o Next.js e corre `npm run build` / `npm run start` automaticamente.

### App Sleeping (poupar custos)

No serviço **da app** (não no Postgres): **Settings → Deploy → Serverless** (App Sleeping) → ativar.
A app adormece após ~10 min sem tráfego e acorda no pedido seguinte (primeiro acesso demora alguns segundos).
As ligações à BD fecham ao fim de 30 s sem uso (`idle_timeout` em `src/lib/db.ts`), para não impedirem o sono.
**Não ativar no Postgres** — é usado também pelo outro projeto.

## 3. Google OAuth

Google Cloud Console → **APIs & Services → Credentials → Create credentials → OAuth client ID** (Web application).
Em *Authorized redirect URIs* adicionar:

- `http://localhost:3000/auth/callback`
- `https://<app>.up.railway.app/auth/callback`

Se o ecrã de consentimento estiver em modo *Internal* (Google Workspace), só contas `@pt.frotcom.com` conseguem entrar.

### Envio de email à financeira (Faturar = Sim)

Os emails saem da conta **logistica@pt.frotcom.com** (Reply-To = quem gravou o registo).

1. Google Cloud Console → **APIs & Services → Library → Gmail API → Enable**.
2. **Google Auth Platform → Acesso a dados → Adicionar escopos** `https://www.googleapis.com/auth/gmail.send`
   (com **Público-alvo = Interno** não é preciso verificação da Google).
3. Na app, um admin vai a **Configurações → Email → Ligar logistica@pt.frotcom.com** e, no Google,
   entra com a conta logistica@ e aceita "Enviar email em seu nome". Faz-se uma única vez.
4. Opcional (Railway → Variables): `BILLING_EMAIL_TO` (destinatários, por omissão financeira@pt.frotcom.com),
   `BILLING_EMAIL_FROM` (conta de envio, por omissão logistica@pt.frotcom.com), `BILLING_EMAIL_FROM_NAME`.

## 4. Criar tabelas e migrar os dados (a partir do teu PC)

No `.env.local` define `DATABASE_URL` com o **DATABASE_PUBLIC_URL** do serviço Postgres. Depois:

```bash
npm install
npm run db:schema      # cria/atualiza as tabelas (idempotente)
npm run migrate:dry    # simulação: gera migration_report.json, não escreve na BD
npm run migrate        # importa os CSV da Google Sheet (pode ser repetido sem duplicar)
```

Durante o período em que a Sheet ainda é usada, exporta os CSV de novo e volta a correr `npm run migrate`: as linhas novas são adicionadas e as editadas são atualizadas.

## 5. Desenvolvimento local

```bash
npm run dev   # http://localhost:3000
```
