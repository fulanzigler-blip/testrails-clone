import React, { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { fetchProjects, createProject, updateProject, deleteProject } from '../store/slices/projectsSlice'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import { Plus, Edit, Trash2, FolderOpen, Search, TestTube, Play, CalendarDays, Layers } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const PROJECT_COLORS = [
  'from-blue-500 to-blue-600',
  'from-violet-500 to-violet-600',
  'from-emerald-500 to-emerald-600',
  'from-orange-500 to-orange-600',
  'from-pink-500 to-pink-600',
  'from-cyan-500 to-cyan-600',
  'from-amber-500 to-amber-600',
  'from-rose-500 to-rose-600',
]

function colorForProject(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length]
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

const Projects: React.FC = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { projects, loading } = useAppSelector((state) => state.projects)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<any>(null)
  const [formData, setFormData] = useState({ name: '', description: '' })
  const [search, setSearch] = useState('')

  useEffect(() => {
    dispatch(fetchProjects())
  }, [dispatch])

  const filtered = projects.filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(search.toLowerCase())
  )

  const totalSuites = projects.reduce((s: number, p: any) => s + (p.testSuitesCount ?? 0), 0)
  const totalRuns = projects.reduce((s: number, p: any) => s + (p.testRunsCount ?? 0), 0)

  const handleCreate = () => {
    setEditingProject(null)
    setFormData({ name: '', description: '' })
    setIsModalOpen(true)
  }

  const handleEdit = (project: any) => {
    setEditingProject(project)
    setFormData({ name: project.name, description: project.description || '' })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this project? All test suites and cases will be removed.')) {
      await dispatch(deleteProject(id))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editingProject) {
      await dispatch(updateProject({ id: editingProject.id, ...formData }))
    } else {
      await dispatch(createProject(formData))
    }
    setIsModalOpen(false)
  }

  if (loading && projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground text-sm">Manage and monitor your test projects</p>
        </div>
        <Button onClick={handleCreate} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          New Project
        </Button>
      </div>

      {/* Summary Stats */}
      {projects.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                <FolderOpen className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{projects.length}</p>
                <p className="text-xs text-muted-foreground">Total Projects</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
                <Layers className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalSuites}</p>
                <p className="text-xs text-muted-foreground">Test Suites</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Play className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalRuns}</p>
                <p className="text-xs text-muted-foreground">Test Runs</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      {projects.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Project Grid */}
      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderOpen className="h-14 w-14 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">No projects yet</h3>
            <p className="text-muted-foreground text-sm mb-4">Create your first project to get started</p>
            <Button onClick={handleCreate} size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              Create Project
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No projects match "<span className="font-medium">{search}</span>"
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((project: any) => {
            const gradient = colorForProject(project.id)
            const suitesCount = project.testSuitesCount ?? 0
            const runsCount = project.testRunsCount ?? 0
            return (
              <Card key={project.id} className="overflow-hidden hover:shadow-md transition-shadow group">
                {/* Colored top bar */}
                <div className={`h-2 bg-gradient-to-r ${gradient}`} />

                <CardContent className="pt-4 pb-4">
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0`}>
                        <FolderOpen className="w-4 h-4 text-white" />
                      </div>
                      <h3 className="font-semibold text-base leading-tight truncate">{project.name}</h3>
                    </div>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(project)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDelete(project.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>

                  {/* Description */}
                  {project.description ? (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{project.description}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground/50 italic mb-3">No description</p>
                  )}

                  {/* Stats */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-1.5 text-sm">
                      <Layers className="w-3.5 h-3.5 text-violet-500" />
                      <span className="font-medium">{suitesCount}</span>
                      <span className="text-muted-foreground">suites</span>
                    </div>
                    <div className="w-px h-3.5 bg-border" />
                    <div className="flex items-center gap-1.5 text-sm">
                      <Play className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="font-medium">{runsCount}</span>
                      <span className="text-muted-foreground">runs</span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="w-3 h-3" />
                      {timeAgo(project.createdAt || project.created_at)}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => navigate('/test-suites')}
                    >
                      View Suites
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-md mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">
                {editingProject ? 'Edit Project' : 'New Project'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Mobile App v2"
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="mt-1 flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="What is this project about?"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingProject ? 'Save Changes' : 'Create Project'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Projects
