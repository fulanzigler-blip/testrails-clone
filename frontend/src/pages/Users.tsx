import React, { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { fetchUsers, updateUser, deleteUser } from '../store/slices/usersSlice'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import { Search, Edit, Trash2, Shield, Mail, Calendar } from 'lucide-react'

const Users: React.FC = () => {
  const dispatch = useAppDispatch()
  const { users, loading } = useAppSelector((state) => state.users)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [isModalOpen, setIsModalOpen] = React.useState(false)
  const [editingUser, setEditingUser] = React.useState<any>(null)
  const [formData, setFormData] = React.useState({
    first_name: '',
    last_name: '',
    role: 'tester'
  })

  useEffect(() => {
    dispatch(fetchUsers())
  }, [dispatch])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    dispatch(fetchUsers({ search: searchTerm }))
  }

  const handleEdit = (user: any) => {
    setEditingUser(user)
    setFormData({
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to remove this user from the organization?')) {
      await dispatch(deleteUser(id))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await dispatch(updateUser({ id: editingUser.id, ...formData }))
    setIsModalOpen(false)
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-500'
      case 'manager': return 'bg-blue-500'
      case 'tester': return 'bg-green-500'
      case 'viewer': return 'bg-gray-500'
      default: return 'bg-gray-300'
    }
  }

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground">Manage team members and their roles</p>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="submit" variant="outline">Search</Button>
          </form>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Shield className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No users found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium">User</th>
                    <th className="text-left p-3 font-medium">Role</th>
                    <th className="text-left p-3 font-medium">Last Login</th>
                    <th className="text-left p-3 font-medium">Joined</th>
                    <th className="text-left p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user: any) => (
                    <tr key={user.id} className="border-b hover:bg-muted/50">
                      <td className="p-3">
                        <div className="font-medium">
                          {user.firstName || user.first_name} {user.lastName || user.last_name}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {user.email}
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge className={`${getRoleColor(user.role)} text-white`}>
                          {user.role}
                        </Badge>
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {user.lastLoginAt || user.last_login_at
                          ? new Date(user.lastLoginAt || user.last_login_at).toLocaleDateString()
                          : 'Never'}
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(user.createdAt || user.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(user)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(user.id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      {isModalOpen && editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-md">
            <Card>
              <CardHeader>
                <CardTitle>Edit User Role</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label>User</Label>
                    <p className="text-sm text-muted-foreground mt-1">{editingUser.email}</p>
                  </div>
                  <div>
                    <Label htmlFor="role">Role</Label>
                    <select
                      id="role"
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                    >
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="tester">Tester</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">Update Role</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

export default Users
