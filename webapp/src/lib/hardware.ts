/**
 * Correspondência entre o "hardware" que a Intranet devolve para cada IMEI
 * (ex.: "Teltonika FMC150-EU (QJIB0)", "Queclink GV58CG", "MD C4MAX V8")
 * e a lista de Equipamentos da app.
 *
 * 1) correspondência definida à mão em Configurações › Equipamentos (tabela hardware_map)
 * 2) automática: o equipamento cujo nome aparece dentro do nome do hardware — o mais comprido ganha
 *    ("MD C4MAX V8" → "C4MAX V8" e não "C4MAX"; "Teltonika FMC150-EU" → "FMC150")
 */
export const foldHw = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

export type HardwareMapping = { hardware: string; equipment_id: string }

export function matchEquipment<T extends { id: string; name: string }>(
  hardware: string | null | undefined,
  equipment: T[],
  mappings: HardwareMapping[] = []
): { item: T; how: 'manual' | 'auto' } | null {
  if (!hardware) return null
  const h = foldHw(hardware)
  if (!h) return null
  const manual = mappings.find((m) => foldHw(m.hardware) === h)
  if (manual) {
    const item = equipment.find((e) => e.id === manual.equipment_id)
    return item ? { item, how: 'manual' } : null
  }
  let best: T | null = null
  let bestLen = 0
  for (const e of equipment) {
    const n = foldHw(e.name)
    if (n.length < 3 || !h.includes(n)) continue
    if (n.length > bestLen) { best = e; bestLen = n.length }
  }
  return best ? { item: best, how: 'auto' } : null
}
