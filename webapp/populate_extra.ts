import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import ws from 'ws'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    transport: ws
  }
})

async function populateData() {
  console.log('--- Iniciando Inserção Manual de Dados ---')

  const warehouses = [
    'AF', 'BM', 'RL', 'RN', 'PG', 'Não aplicável', 'RP', 'LS', 'TC', 'SP', 'PA', 'LC', 'SS', 'JM', 
    'Stock Frotcom', 'Stock Projectos', 'RMA', 'A7 - Retoma', 'Equip. Pago', 'Try & Buy', 'CG Abate'
  ].map(name => ({ name, active: true }))

  const technicians = [
    'AF', 'BM', 'RL', 'RN', 'PG', 'RP', 'TC', 'Suporte', 'SP', 'PA', 'LC', 'AS', 'HV', 
    'Logistica', 'LS', 'Gonçalo S.', 'JM', 'SS', 'Rita S.', 'MS'
  ].map(name => ({ name, active: true }))

  console.log('Inserindo armazéns...')
  const { error: wError } = await supabase
    .schema('gestao_interv')
    .from('warehouses')
    .upsert(warehouses, { onConflict: 'name' })

  if (wError) console.error('Erro ao inserir armazéns:', wError)
  else console.log('Armazéns inseridos com sucesso!')

  console.log('Inserindo técnicos...')
  const { error: tError } = await supabase
    .schema('gestao_interv')
    .from('technicians')
    .upsert(technicians, { onConflict: 'name' })

  if (tError) console.error('Erro ao inserir técnicos:', tError)
  else console.log('Técnicos inseridos com sucesso!')

  console.log('--- Concluído ---')
}

populateData()
