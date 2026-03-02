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

    switch (role) {
      case 'admin': return 'bg-purple-500'
      case 'manager': return 'bg-blue-500'
      case 'tester': return 'bg-green-500'
      case 'viewer': return 'bg-gray-500'
      default: return 'bg-gray-300'
    }
  }


export default Users
