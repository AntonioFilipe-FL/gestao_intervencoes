'use client'

import { useState, useEffect } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getUserRoles, updateUserRole, deleteUserProfile } from '@/actions/users'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function UserManagement() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('user')

  const fetchUsers = async () => {
    setLoading(true)
    const data = await getUserRoles()
    setUsers(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleRoleChange = async (email: string, role: string) => {
    const result = await updateUserRole(email, role)
    if (result.success) {
      fetchUsers()
    } else {
      alert('Erro ao atualizar papel: ' + result.error)
    }
  }

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail.includes('@')) return alert('Email inválido')
    
    const result = await updateUserRole(newEmail, newRole)
    if (result.success) {
      setIsAddOpen(false)
      setNewEmail('')
      fetchUsers()
    } else {
      alert('Erro ao adicionar: ' + result.error)
    }
  }

  const handleDelete = async (email: string) => {
    if (!confirm(`Tem a certeza que deseja remover o acesso para ${email}?`)) return
    
    const result = await deleteUserProfile(email)
    if (result.success) {
      fetchUsers()
    } else {
      alert('Erro ao remover: ' + result.error)
    }
  }

  if (loading) return <div className="py-4 text-center text-fc-dark-60">A carregar utilizadores…</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2>Gestão de acessos</h2>
          <p className="fc-small text-fc-dark-60">Gerir emails autorizados e seus papéis no sistema.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus /> Adicionar utilizador
        </Button>
      </div>

      <div className="border border-fc-dark-20">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email Autorizado</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-fc-dark-60">
                  Nenhum utilizador autorizado encontrado.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.email}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right flex justify-end gap-2">
                    <Select
                      defaultValue={user.role}
                      onValueChange={(value) => value && handleRoleChange(user.email, value)}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Papel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-fc-danger hover:bg-fc-danger/10"
                      onClick={() => handleDelete(user.email)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Autorizar Novo Utilizador</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddUser} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Endereço de Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="exemplo@pt.frotcom.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Papel de Acesso</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v ?? 'user')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Utilizador Comum</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Autorizar Acesso</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
