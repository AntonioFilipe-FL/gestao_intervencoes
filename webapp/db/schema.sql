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
