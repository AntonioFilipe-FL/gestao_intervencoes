import { sql } from '@/lib/db'
import { matchEquipment } from '@/lib/hardware'

/**
 * Nome do equipamento da app a partir do hardware que a Intranet tem para o IMEI (null se não houver correspondência).
 * Usado no stock: o hardware da Intranet prevalece sobre o equipamento registado na entrada.
 */
export async function equipmentNamer() {
  const [equipment, mappings] = await Promise.all([
    sql<{ id: string; name: string }[]>`select id, name from equipment_list where active`,
    sql<{ hardware: string; equipment_id: string }[]>`select hardware, equipment_id from hardware_map`,
  ])
  return (hw: string | null | undefined) => matchEquipment(hw, equipment, mappings)?.item.name ?? null
}
