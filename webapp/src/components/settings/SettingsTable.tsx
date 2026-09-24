'use client'

import { useState } from 'react'
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
}

export function SettingsTable({ title, table, items, extraColumns = [] }: Props) {
  const [search, setSearch] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)

  const filteredItems = items?.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  )

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
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!filteredItems || filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3 + extraColumns.length} className="py-8 text-center text-fc-dark-60">
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
                  <TableCell>
                    <Badge variant={item.active ? 'success' : 'secondary'}>
                      {item.active ? 'Ativo' : 'Inativo'}
                    </Badge>
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
      />
    </div>
  )
}
