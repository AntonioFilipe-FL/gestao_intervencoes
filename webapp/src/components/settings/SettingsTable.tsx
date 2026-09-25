'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toggleReferenceItem } from '@/actions/settings'
import type { KitLine } from '@/types/database'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Search, Edit2 } from 'lucide-react'

import { SettingsItemDialog } from './SettingsItemDialog'

interface Item {
  id: string
  name: string
  active: boolean
  [key: string]: any
}

interface Props {
  title: string
  table: string
  items: Item[] | null
  extraColumns?: { label: string; key: string; readOnly?: boolean }[]
  /**
   * catálogo de material (Equipamentos/Acessórios): o estado passa a "Novos registos" / "Só histórico",
   * com filtro e troca rápida. Os registos antigos mantêm os itens "só histórico".
   */
  catalog?: boolean
  /** equipamentos: editar o kit de acessórios */
  kit?: { accessories: { id: string; name: string }[]; kits: KitLine[] }
}

export function SettingsTable({ title, table, items, extraColumns = [], catalog = false, kit }: Props) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [filter, setFilter] = useState<'all' | 'on' | 'off'>('all')
  const toggle = (item: Item) =>
    start(async () => {
      const r = await toggleReferenceItem(table, item.id, !item.active)
      if (!r.success) alert(r.error)
      router.refresh()
    })
  const kitCount = (id: string) => kit?.kits.filter((k) => k.equipment_id === id).length ?? 0
  const [search, setSearch] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)

  const filteredItems = items?.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()) &&
    (filter === 'all' || (filter === 'on') === item.active)
  )
  const onCount = items?.filter((i) => i.active).length ?? 0

  const handleAdd = () => {
    setSelectedItem(null)
    setIsDialogOpen(true)
  }

  const handleEdit = (item: Item) => {
    setSelectedItem(item)
    setIsDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2>{title}</h2>
        <Button onClick={handleAdd}>
          <Plus /> Adicionar
        </Button>
      </div>

      {catalog && (
        <div className="space-y-2">
          <p className="fc-small max-w-4xl text-fc-dark-60">
            Os itens em <b>Novos registos</b> aparecem no formulário. Os itens em <b>Só histórico</b> ficam nos registos migrados/antigos,
            mas deixam de poder ser escolhidos. Clique no estado para trocar.
            {kit && ' Em cada equipamento pode definir o kit de acessórios que o acompanha.'}
          </p>
          <div className="flex gap-1">
            {([['all', `Todos (${items?.length ?? 0})`], ['on', `Novos registos (${onCount})`], ['off', `Só histórico (${(items?.length ?? 0) - onCount})`]] as const).map(([k, l]) => (
              <Button key={k} size="sm" variant={filter === k ? 'secondary' : 'inverse'} onClick={() => setFilter(k)}>{l}</Button>
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-fc-dark-40" />
        <Input
          placeholder="Procurar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      <div className="border border-fc-dark-20">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              {extraColumns.map((col) => (
                <TableHead key={col.key}>{col.label}</TableHead>
              ))}
              {kit && <TableHead>Kit</TableHead>}
              <TableHead>{catalog ? 'Disponível em' : 'Estado'}</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!filteredItems || filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3 + extraColumns.length + (kit ? 1 : 0)} className="py-8 text-center text-fc-dark-60">
                  Nenhum item encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  {extraColumns.map((col) => (
                    <TableCell key={col.key}>{item[col.key] || '---'}</TableCell>
                  ))}
                  {kit && (
                    <TableCell className="text-fc-dark-60">
                      {kitCount(item.id) ? `${kitCount(item.id)} acessório(s)` : '—'}
                    </TableCell>
                  )}
                  <TableCell>
                    {catalog ? (
                      <button type="button" disabled={busy} onClick={() => toggle(item)} title="Clique para trocar" className={cn('cursor-pointer disabled:cursor-wait')}>
                        <Badge variant={item.active ? 'success' : 'secondary'}>{item.active ? 'Novos registos' : 'Só histórico'}</Badge>
                      </button>
                    ) : (
                      <Badge variant={item.active ? 'success' : 'secondary'}>
                        {item.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                      <Edit2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <SettingsItemDialog
        table={table}
        item={selectedItem}
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        extraFields={extraColumns.filter((c) => !c.readOnly)}
        activeLabel={catalog ? 'Disponível em novos registos' : undefined}
        kit={kit}
      />
    </div>
  )
}
