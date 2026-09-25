'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { upsertReferenceItem, setEquipmentKit } from '@/actions/settings'
import { AccessoryPicker } from '@/components/interventions/AccessoryPicker'
import type { KitLine } from '@/types/database'

interface Props {
  table: string
  item: any | null
  isOpen: boolean
  onClose: () => void
  extraFields?: { label: string; key: string; type?: string }[]
  /** texto da caixa "ativo" (ex.: "Disponível em novos registos") */
  activeLabel?: string
  /** equipamentos: acessórios que acompanham o equipamento */
  kit?: { accessories: { id: string; name: string }[]; kits: KitLine[] }
}

export function SettingsItemDialog({ table, item, isOpen, onClose, extraFields = [], activeLabel = 'Ativo', kit }: Props) {
  const [kitLines, setKitLines] = useState<{ accessory_id: string; quantity: number }[]>([])
  const [formData, setFormData] = useState<any>({ name: '', active: true })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (item) {
      setFormData(item)
    } else {
      setFormData({ name: '', active: true })
    }
    setKitLines(
      item && kit ? kit.kits.filter((k) => k.equipment_id === item.id).map(({ accessory_id, quantity }) => ({ accessory_id, quantity })) : []
    )
  }, [item, isOpen, kit])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    const result = await upsertReferenceItem(table, formData)
    if (result.success && kit) {
      const r = await setEquipmentKit(result.data.id, kitLines)
      if (!r.success) { setLoading(false); alert('Item guardado, mas o kit não: ' + r.error); return }
    }

    setLoading(false)
    if (result.success) {
      onClose()
    } else {
      alert('Erro ao guardar: ' + result.error)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? 'Editar' : 'Adicionar'} Item</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          {extraFields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={field.key}>{field.label}</Label>
              <Input
                id={field.key}
                value={formData[field.key] || ''}
                onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
              />
            </div>
          ))}

          <div className="flex items-center space-x-2">
            <Checkbox
              id="active"
              checked={formData.active}
              onCheckedChange={(checked) => setFormData({ ...formData, active: !!checked })}
            />
            <Label htmlFor="active">{activeLabel}</Label>
          </div>

          {kit && (
            <div className="space-y-1.5">
              <Label htmlFor="kit">Acessórios que acompanham este equipamento (kit)</Label>
              <AccessoryPicker id="kit" options={kit.accessories} value={kitLines} onChange={setKitLines} placeholder="Sem kit — escolha os acessórios" />
              <p className="fc-small text-fc-dark-60">
                Ao escolher este equipamento no registo, estes acessórios são acrescentados automaticamente (podem ser retirados).
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'A guardar...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
