-- =============================================================================
-- Gestão de Intervenções — esquema PostgreSQL (Railway)
-- Idempotente: pode ser corrido várias vezes (npm run db:schema).
-- =============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create schema if not exists gestao_interv;
set search_path = gestao_interv, public;

-- -----------------------------------------------------------------------------
-- Acessos (whitelist de emails Google + papel)
-- -----------------------------------------------------------------------------
create table if not exists profiles (
  email      text primary key check (email = lower(email)),
  role       text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Tabelas de apoio (listas dos dropdowns)
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'technicians', 'intervention_types', 'motives', 'actions_performed', 'equipment_list',
    'bundles', 'accessories', 'billing_options', 'intranet_accounts', 'warranty_options', 'platforms'
  ] loop
    execute format($f$
      create table if not exists gestao_interv.%1$I (
        id         uuid primary key default gen_random_uuid(),
        name       text not null check (btrim(name) <> ''),
        active     boolean not null default true,
        created_at timestamptz not null default now()
      );
      create unique index if not exists %1$s_name_uq on gestao_interv.%1$I (lower(name));
    $f$, t);
  end loop;
end $$;

create table if not exists warehouses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> ''),
  type       text not null default 'ambos' check (type in ('saida', 'entrada', 'ambos')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists warehouses_name_uq on warehouses (lower(name));

create table if not exists clients (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null check (btrim(name) <> ''),
  venda_aluguer           text,
  nos_vdf                 text,
  report_projeto_contrato text,
  active                  boolean not null default true,
  created_at              timestamptz not null default now()
);
create unique index if not exists clients_name_uq on clients (lower(name));

-- -----------------------------------------------------------------------------
-- Intervenções (tabela principal — equivalente à folha "Validação de Formulários")
-- -----------------------------------------------------------------------------
create table if not exists interventions (
  id                       uuid primary key default gen_random_uuid(),

  intervention_date        date not null,
  validation_date          date,
  technician_id            uuid references technicians(id),
  client_id                uuid references clients(id),
  venda_aluguer            text,
  nos_vdf                  text,
  report_projeto           text,
  intervention_type_id     uuid references intervention_types(id),
  license_plate            text,
  imei                     text,
  equipment_id             uuid references equipment_list(id),
  warranty_rental          text,
  intranet_account         text,
  intranet_license_plate   text,
  motive_id                uuid references motives(id),
  motive_text              text,       -- motivo tal como escrito (histórico tem texto livre)
  action_description       text,
  assisted_material        text,

  spent_equipment          text,
  spent_equipment_imei     text,
  accessory_spent_1        text,
  accessory_spent_2        text,
  accessory_spent_3        text,
  accessory_spent_4        text,
  accessory_spent_5        text,

  equipment_return         text,
  accessory_return_1       text,
  accessory_return_2       text,
  accessory_return_3       text,
  accessory_return_4       text,
  accessory_return_5       text,

  billing                  text,
  billing_observations     text,
  billing_email            text,
  bundle_id                uuid references bundles(id),
  dtc_active_realtime      text,
  configuration            text,
  platform_id              uuid references platforms(id),
  canbus_via               text,       -- só existia no layout de 2022
  observations             text,
  wow                      text,
  services_status          text,
  validated_by             uuid references technicians(id),
  crm_vehicle              text,
  contract_addendum        text,
  zoho_form                text,
  stock_exit_warehouse_id  uuid references warehouses(id),
  stock_entry_warehouse_id uuid references warehouses(id),

  -- Auditoria / migração
  legacy_key               text unique,  -- chave da linha da Google Sheet (re-sincronização sem duplicar)
  legacy_layout            text,         -- 'atual' | '2022'
  created_by               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists interventions_date_idx   on interventions (intervention_date desc);
create index if not exists interventions_client_idx on interventions (client_id);
create index if not exists interventions_tech_idx   on interventions (technician_id);
create index if not exists interventions_type_idx   on interventions (intervention_type_id);
create index if not exists interventions_plate_idx  on interventions (license_plate);
create index if not exists interventions_imei_idx   on interventions (imei);

create or replace function gestao_interv.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists interventions_touch on interventions;
create trigger interventions_touch before update on interventions
  for each row execute function gestao_interv.touch_updated_at();

-- =============================================================================
-- Material gasto / retomado ligado às listas de Equipamentos e Acessórios
-- (v2 — substitui os campos de texto spent_equipment / accessory_spent_1..5 / ...)
-- =============================================================================
alter table interventions
  add column if not exists spent_equipment_id  uuid references equipment_list(id),
  add column if not exists return_equipment_id uuid references equipment_list(id),
  add column if not exists material_migrated   boolean not null default false;

create table if not exists intervention_accessories (
  intervention_id uuid not null references interventions(id) on delete cascade,
  accessory_id    uuid not null references accessories(id),
  direction       text not null check (direction in ('gasto', 'retomado')),
  quantity        int  not null default 1 check (quantity > 0),
  primary key (intervention_id, accessory_id, direction)
);
create index if not exists intervention_accessories_acc_idx on intervention_accessories (accessory_id);

/**
 * Converte os campos de texto históricos (importados da Google Sheet) para as novas ligações.
 * Só trata registos com material_migrated = false. Nomes que não existem nas listas são
 * criados como INATIVOS (preservam o histórico sem aparecer nos dropdowns).
 */
create or replace function gestao_interv.backfill_material() returns int
language plpgsql as $$
declare n int;
begin
  -- equipamentos em falta
  insert into gestao_interv.equipment_list (name, active)
  select distinct on (lower(btrim(e))) btrim(e), false
  from gestao_interv.interventions i, unnest(array[i.spent_equipment, i.equipment_return]) e
  where not i.material_migrated and btrim(coalesce(e, '')) <> ''
  on conflict do nothing;

  -- acessórios em falta
  insert into gestao_interv.accessories (name, active)
  select distinct on (lower(btrim(a))) btrim(a), false
  from gestao_interv.interventions i,
       unnest(array[i.accessory_spent_1, i.accessory_spent_2, i.accessory_spent_3, i.accessory_spent_4, i.accessory_spent_5,
                    i.accessory_return_1, i.accessory_return_2, i.accessory_return_3, i.accessory_return_4, i.accessory_return_5]) a
  where not i.material_migrated and btrim(coalesce(a, '')) <> ''
  on conflict do nothing;

  -- equipamento gasto / retomado
  update gestao_interv.interventions i set
    spent_equipment_id  = (select q.id from gestao_interv.equipment_list q where lower(q.name) = lower(btrim(i.spent_equipment))),
    return_equipment_id = (select q.id from gestao_interv.equipment_list q where lower(q.name) = lower(btrim(i.equipment_return)))
  where not i.material_migrated;

  -- acessórios (com quantidade = nº de vezes que aparecem no registo)
  delete from gestao_interv.intervention_accessories ia
  using gestao_interv.interventions i
  where ia.intervention_id = i.id and not i.material_migrated;

  insert into gestao_interv.intervention_accessories (intervention_id, accessory_id, direction, quantity)
  select i.id, ac.id, x.dir, count(*)
  from gestao_interv.interventions i
  cross join lateral (values
    ('gasto', i.accessory_spent_1), ('gasto', i.accessory_spent_2), ('gasto', i.accessory_spent_3),
    ('gasto', i.accessory_spent_4), ('gasto', i.accessory_spent_5),
    ('retomado', i.accessory_return_1), ('retomado', i.accessory_return_2), ('retomado', i.accessory_return_3),
    ('retomado', i.accessory_return_4), ('retomado', i.accessory_return_5)
  ) as x(dir, name)
  join gestao_interv.accessories ac on lower(ac.name) = lower(btrim(x.name))
  where not i.material_migrated
  group by i.id, ac.id, x.dir;

  update gestao_interv.interventions set material_migrated = true where not material_migrated;
  get diagnostics n = row_count;
  return n;
end $$;

select gestao_interv.backfill_material();

-- =============================================================================
-- Notificação automática à financeira (email enviado pela conta Google do utilizador)
-- =============================================================================
alter table profiles
  add column if not exists google_refresh_token text,          -- cifrado (AES-256-GCM, chave derivada de AUTH_SECRET)
  add column if not exists gmail_send_granted_at timestamptz;

alter table interventions
  add column if not exists billing_notified_at timestamptz,    -- quando o email à financeira foi enviado
  add column if not exists billing_notified_by text,           -- conta que enviou
  add column if not exists billing_notify_error text;          -- último erro de envio (se houver)

-- Definições da aplicação (ex.: conta de envio de emails ligada por um admin)
create table if not exists app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- =============================================================================
-- Integração com a Intranet Frotcom (clientes = accounts, IMEIs = devices)
-- =============================================================================
alter table clients
  add column if not exists intranet_account_id text,
  add column if not exists intranet_short_name text,
  add column if not exists intranet_synced_at  timestamptz;
-- (antes era único; agora uma conta pode ter vários clientes — ver fim do ficheiro)

create table if not exists devices (
  imei                text primary key,
  intranet_device_id  text,
  intranet_account_id text,
  client_id           uuid references clients(id),
  model               text,
  license_plate       text,
  active              boolean not null default true,
  synced_at           timestamptz not null default now()
);
create index if not exists devices_client_idx on devices (client_id);
create index if not exists devices_account_idx on devices (intranet_account_id);

-- Contas da Intranet sem correspondência automática, à espera de decisão (associar / criar / ignorar)
create table if not exists intranet_pending (
  intranet_account_id text primary key,
  name                text not null,
  full_name           text,
  status              text not null default 'pending' check (status in ('pending', 'ignored')),
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now()
);

-- origem do cliente ('intranet_manual' = criado com "Criar novo" em Configurações → Intranet)
alter table clients add column if not exists created_via text;

-- =============================================================================
-- IMEI do equipamento retomado + histórico matrícula → IMEI (construído a cada sincronização)
-- =============================================================================
alter table interventions add column if not exists return_equipment_imei text;

create or replace function gestao_interv.plate_norm(p text) returns text
language sql immutable as $$ select nullif(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), '') $$;

create table if not exists device_plate_history (
  id            bigserial primary key,
  plate_norm    text not null,
  license_plate text,
  imei          text not null,
  client_id     uuid references clients(id),
  model         text,
  seen_from     timestamptz not null default now(),
  seen_to       timestamptz          -- null = é o IMEI atual dessa matrícula
);
create index if not exists device_plate_history_plate_idx on device_plate_history (plate_norm, seen_to);
create index if not exists interventions_plate_norm_idx on interventions (gestao_interv.plate_norm(license_plate));

-- Edição de registos: quem alterou por último
alter table interventions add column if not exists updated_by text;

-- Nomes antigos (da Google Sheet) de clientes renomeados para o nome da Intranet — usados na re-importação de CSVs
alter table clients add column if not exists sheet_names text[];

-- Coluna nova da Sheet: "Serviços da conta - driving Behavior / sensor de porta"
alter table interventions add column if not exists account_services text;

-- Uma conta da Intranet pode estar ligada a vários clientes da BD (ex.: venda e aluguer da mesma empresa)
drop index if exists gestao_interv.clients_intranet_uq;
create index if not exists clients_intranet_idx on clients (intranet_account_id) where intranet_account_id is not null;

-- Kits: acessórios que acompanham cada equipamento (sugeridos automaticamente no formulário)
create table if not exists equipment_kit_items (
  equipment_id uuid not null references equipment_list(id) on delete cascade,
  accessory_id uuid not null references accessories(id) on delete cascade,
  quantity     int  not null default 1 check (quantity between 1 and 99),
  primary key (equipment_id, accessory_id)
);

-- Correspondência manual "hardware" da Intranet → equipamento da lista (quando a automática não chega)
create table if not exists hardware_map (
  hardware     text primary key,
  equipment_id uuid not null references equipment_list(id) on delete cascade,
  updated_at   timestamptz not null default now(),
  updated_by   text
);

-- =============================================================================
-- Stock de equipamentos (por IMEI)
-- Cada movimento leva um IMEI de um armazém (from) para outro (to).
-- from nulo = entra no stock (receção, retoma); to nulo = sai do stock (instalado numa intervenção).
-- A posição atual de cada IMEI é o último movimento (view stock_current).
-- =============================================================================
create table if not exists stock_movements (
  id                uuid primary key default gen_random_uuid(),
  imei              text not null,
  equipment_id      uuid references equipment_list(id),
  kind              text not null check (kind in ('rececao', 'transferencia', 'intervencao_saida', 'intervencao_entrada', 'ajuste')),
  from_warehouse_id uuid references warehouses(id),
  to_warehouse_id   uuid references warehouses(id),
  modality          text check (modality in ('Venda', 'Aluguer')),
  intervention_id   uuid references interventions(id) on delete cascade,
  moved_at          date not null default current_date,
  notes             text,
  created_by        text,
  created_at        timestamptz not null default now(),
  seq               bigserial
);
create index if not exists stock_movements_imei_idx on stock_movements (imei, moved_at desc, seq desc);
create index if not exists stock_movements_interv_idx on stock_movements (intervention_id);

alter table interventions add column if not exists return_modality text;

create or replace view stock_current as
select distinct on (m.imei)
       m.imei, m.to_warehouse_id as warehouse_id, m.moved_at, m.kind, m.intervention_id,
       coalesce(m.equipment_id, (select m2.equipment_id from stock_movements m2 where m2.imei = m.imei and m2.equipment_id is not null
                                 order by m2.moved_at desc, m2.seq desc limit 1)) as equipment_id,
       coalesce(m.modality, (select m3.modality from stock_movements m3 where m3.imei = m.imei and m3.modality is not null
                             order by m3.moved_at desc, m3.seq desc limit 1)) as modality
from stock_movements m
order by m.imei, m.moved_at desc, m.seq desc;

/** Normaliza texto de venda/aluguer */
create or replace function gestao_interv.modality_of(v text) returns text language sql immutable as $$
  select case when v ilike '%alug%' then 'Aluguer' when v ilike '%vend%' then 'Venda' else null end
$$;

/**
 * Movimentos de stock implícitos em cada intervenção (serve para as importadas da Sheet e para as novas):
 *  - armazém de saída E de entrada, com um só IMEI (gasto = IMEI, ou só IMEI) → transferência
 *    (ex.: "Entrada de Material", "Envio de material", "Envio RMA")
 *  - armazém de saída → sai o IMEI gasto (ou o IMEI, se não houver gasto)          (ex.: instalação)
 *  - armazém de entrada → entra o IMEI retomado (ou o IMEI, se for diferente do gasto) (ex.: desinstalação, troca)
 */
create or replace view gestao_interv.intervention_stock_moves as
with b as (
  select i.*,
         nullif(btrim(i.imei), '') as im,
         nullif(btrim(i.spent_equipment_imei), '') as sp,
         nullif(btrim(i.return_equipment_imei), '') as rt
  from gestao_interv.interventions i
), c as (
  select b.*,
         -- tipos de logística: o IMEI da intervenção é o próprio material movimentado (entra/sai tal como está)
         exists (select 1 from gestao_interv.intervention_types t where t.id = b.intervention_type_id
                 and lower(btrim(t.name)) = any(array['envio de material', 'envio rma', 'entrada de material', 'entrada de rma',
                   'entrega de material', 'entrega de material try and buy', 'recolha de material',
                   'desinstalação try and buy', 'desinstalação', 'acerto de stock'])) as is_logistic,
         (stock_exit_warehouse_id is not null and stock_entry_warehouse_id is not null and rt is null
          and (sp is null or im is null or sp = im)
          and has_spent_eq and has_return_eq) as is_transfer
  from (select b.*,
               -- só há movimento de stock quando há EQUIPAMENTO (não só acessórios) do lado respetivo
               (sp is not null or spent_equipment_id is not null or nullif(btrim(spent_equipment), '') is not null) as has_spent_eq,
               (rt is not null or return_equipment_id is not null or nullif(btrim(equipment_return), '') is not null) as has_return_eq
        from b) b
)
select id as intervention_id, coalesce(sp, im) as imei, coalesce(spent_equipment_id, equipment_id) as equipment_id,
       'transferencia'::text as kind, stock_exit_warehouse_id as from_wh, stock_entry_warehouse_id as to_wh,
       coalesce(return_modality, gestao_interv.modality_of(venda_aluguer)) as modality, intervention_date, coalesce(updated_by, created_by) as by, created_at, 1 as ord
from c where is_transfer and coalesce(sp, im) ~ '^[0-9]{8,20}$'
union all
select id, coalesce(sp, im), coalesce(spent_equipment_id, equipment_id), 'intervencao_saida', stock_exit_warehouse_id, null,
       gestao_interv.modality_of(venda_aluguer), intervention_date, coalesce(updated_by, created_by), created_at, 1
from c where not is_transfer and stock_exit_warehouse_id is not null and has_spent_eq and coalesce(sp, im) ~ '^[0-9]{8,20}$'
union all
select id, coalesce(rt, case when is_logistic then coalesce(sp, im) when im is distinct from sp then im end),
       coalesce(return_equipment_id, case when is_logistic then spent_equipment_id end, equipment_id), 'intervencao_entrada', null, stock_entry_warehouse_id,
       coalesce(return_modality, gestao_interv.modality_of(venda_aluguer)), intervention_date, coalesce(updated_by, created_by), created_at, 2
from c where not is_transfer and stock_entry_warehouse_id is not null and has_return_eq
  -- numa intervenção de logística só com armazém de entrada, o material entra (não há saída)
  and not (is_logistic and stock_exit_warehouse_id is not null)
  and coalesce(rt, case when is_logistic then coalesce(sp, im) when im is distinct from sp then im end) ~ '^[0-9]{8,20}$';

create or replace function gestao_interv.sync_intervention_stock(p_id uuid) returns void language plpgsql as $$
begin
  delete from gestao_interv.stock_movements where intervention_id = p_id;
  insert into gestao_interv.stock_movements (imei, equipment_id, kind, from_warehouse_id, to_warehouse_id, modality, intervention_id, moved_at, created_by)
  select imei, equipment_id, kind, from_wh, to_wh, modality, intervention_id, intervention_date, by
  from gestao_interv.intervention_stock_moves where intervention_id = p_id order by ord;
end $$;

/** Recalcula os movimentos de todas as intervenções (histórico). Devolve o nº de movimentos. */
create or replace function gestao_interv.rebuild_intervention_stock() returns int language plpgsql as $$
declare n int;
begin
  delete from gestao_interv.stock_movements where intervention_id is not null;
  insert into gestao_interv.stock_movements (imei, equipment_id, kind, from_warehouse_id, to_warehouse_id, modality, intervention_id, moved_at, created_by, created_at)
  select imei, equipment_id, kind, from_wh, to_wh, modality, intervention_id, intervention_date, by, created_at
  from gestao_interv.intervention_stock_moves
  order by intervention_date, created_at, ord;
  get diagnostics n = row_count;
  return n;
end $$;

-- Email do técnico/validador (para atribuir automaticamente o "Validado por" pelo email de login)
alter table technicians add column if not exists email text;
create unique index if not exists technicians_email_uq on technicians (lower(email)) where email is not null;

-- Contas internas da Frotcom (ex.: "Frotcom Lusitana", "Frotcom Lusitana - Transit"): os IMEIs lá não contam como instalados
create or replace function gestao_interv.is_internal_account(p_account text) returns boolean language sql stable as $$
  select p_account is not null and exists (
    select 1 from gestao_interv.clients c where c.intranet_account_id = p_account
      and (c.name ilike '%frotcom lusitana%' or c.intranet_short_name ilike '%frotcom lusitana%')
    union all
    select 1 from gestao_interv.intranet_pending p where p.intranet_account_id = p_account
      and (p.name ilike '%frotcom lusitana%' or p.full_name ilike '%frotcom lusitana%'))
$$;
