# Deploy no Railway

A app (Next.js) e a base de dados (PostgreSQL) ficam no mesmo projeto Railway.

## 1. Criar o projeto

1. Railway → **New Project** → **Deploy from GitHub repo** → escolher o repositório.
   - Em **Settings → Source**, definir **Root Directory** = `webapp`.
2. No mesmo projeto: **+ New** → **Database** → **PostgreSQL**.

## 2. Variáveis do serviço da app (Variables)

| Variável | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `AUTH_SECRET` | string aleatória com 32+ caracteres (ver `.env.example`) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | credenciais OAuth do Google Cloud |
| `APP_URL` | `https://<app>.up.railway.app` (ou domínio próprio) |
| `ADMIN_EMAILS` | o teu email (fica admin no primeiro login) |

Em **Settings → Networking → Generate Domain** para obter o URL público.
O Railway deteta o Next.js e corre `npm run build` / `npm run start` automaticamente.

## 3. Google OAuth

Google Cloud Console → **APIs & Services → Credentials → Create credentials → OAuth client ID** (Web application).
Em *Authorized redirect URIs* adicionar:

- `http://localhost:3000/auth/callback`
- `https://<app>.up.railway.app/auth/callback`

Se o ecrã de consentimento estiver em modo *Internal* (Google Workspace), só contas `@pt.frotcom.com` conseguem entrar.

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
