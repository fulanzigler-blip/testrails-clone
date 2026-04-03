import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import { Plus, ChevronRight, FolderOpen, Edit, Trash2 } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import {
  fetchTestSuites,
  createTestSuite,
  updateTestSuite,
  deleteTestSuite,
} from '../store/slices/testSuitesSlice'
import { fetchProjects } from '../store/slices/projectsSlice'

interface TestSuite {
  id: string
  name: string
  description: string | null
  projectId: string
  parentSuiteId: string | null
  createdAt: string
  updatedAt: string
}

const TestSuites: React.FC = () => {
  const dispatch = useAppDispatch()
  const { suites, loading } = useAppSelector((state) => state.testSuites)
  const { projects } = useAppSelector((state) => state.projects)

  const [selectedProject, setSelectedProject] = useState<string>('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSuite, setEditingSuite] = useState<TestSuite | null>(null)
  const [expandedSuites, setExpandedSuites] = useState<Set<string>>(new Set())
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    project_id: '',
    parent_suite_id: '',
  })

  useEffect(() => {
    dispatch(fetchProjects())
    dispatch(fetchTestSuites())
  }, [dispatch])

  useEffect(() => {
    dispatch(
      fetchTestSuites({
        projectId: selectedProject || undefined,
      })
    )
  }, [selectedProject, dispatch])

  const handleCreate = () => {
    setEditingSuite(null)
    setFormData({
      name: '',
      description: '',
      project_id: selectedProject || '',
      parent_suite_id: '',
    })
    setIsModalOpen(true)
  }

  const handleEdit = (suite: TestSuite) => {
    setEditingSuite(suite)
    setFormData({
      name: suite.name,
      description: suite.description || '',
      project_id: suite.projectId,
      parent_suite_id: suite.parentSuiteId || '',
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this suite? All child suites will also be deleted.')) {
      try {
        await dispatch(deleteTestSuite(id)).unwrap()
      } catch (error) {
        console.error('Failed to delete test suite:', error)
      }
    }
  }

  const toggleExpand = (suiteId: string) => {
    const newExpanded = new Set(expandedSuites)
    if (newExpanded.has(suiteId)) {
      newExpanded.delete(suiteId)
    } else {
      newExpanded.add(suiteId)
    }
    setExpandedSuites(newExpanded)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingSuite) {
        await dispatch(
          updateTestSuite({
            id: editingSuite.id,
            name: formData.name,
            description: formData.description || undefined,
            parentSuiteId: formData.parent_suite_id || undefined,
          })
        ).unwrap()
      } else {
        await dispatch(
          createTestSuite({
            name: formData.name,
            description: formData.description || undefined,
            projectId: formData.project_id,
            parentSuiteId: formData.parent_suite_id || undefined,
          })
        ).unwrap()
      }
      setIsModalOpen(false)
    } catch (error) {
      console.error('Failed to save test suite:', error)
    }
  }

  const getChildSuites = (parentId: string): TestSuite[] => {
    return suites.filter((s) => s.parentSuiteId === parentId)
  }

  const getRootSuites = (): TestSuite[] => {
    return suites.filter((s) => s.parentSuiteId === null || s.parentSuiteId === undefined)
  }

  const renderSuite = (suite: TestSuite, level: number = 0) => {
    const isExpanded = expandedSuites.has(suite.id)
    const children = getChildSuites(suite.id)
    const hasChildren = children.length > 0

    return (
      <div key={suite.id}>
        <Card className={`hover:shadow-md transition-shadow ${level > 0 ? 'ml-6 mt-2' : 'mt-4'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                {hasChildren && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpand(suite.id)}
                    className="p-1"
                  >
                    <ChevronRight
                      className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                  </Button>
                )}
                {!hasChildren && <div className="w-6" />}

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-semibold">{suite.name}</h3>
                  </div>
                  {suite.description && (
                    <p className="text-sm text-muted-foreground mt-1">{suite.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary">{children.length} sub-suites</Badge>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(suite)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(suite.id)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {hasChildren && isExpanded && (
          <div>
            {children.map((child) => renderSuite(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Test Suites</h1>
          <p className="text-muted-foreground">Organize your test cases into suites</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Suite
        </Button>
      </div>

      {/* Project Filter */}
      <div className="flex items-center gap-2">
        <Label htmlFor="project-filter">Filter by Project:</Label>
        <select
          id="project-filter"
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm"
        >
          <option value="">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {/* Suites Tree */}
      {!loading && (
        <div className="space-y-4">
          {getRootSuites().length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <FolderOpen className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No test suites yet</h3>
                <p className="text-muted-foreground mb-4">Create your first test suite to get started</p>
                <Button onClick={handleCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Suite
                </Button>
              </CardContent>
            </Card>
          ) : (
            getRootSuites().map((suite) => renderSuite(suite))
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <Card>
              <CardHeader>
                <CardTitle>{editingSuite ? 'Edit Test Suite' : 'New Test Suite'}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="description">Description</Label>
                    <textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="Optional description for this suite"
                    />
                  </div>

                  <div>
                    <Label htmlFor="project_id">Project *</Label>
                    <select
                      id="project_id"
                      value={formData.project_id}
                      onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    >
                      <option value="">Select Project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="parent_suite_id">Parent Suite (optional)</Label>
                    <select
                      id="parent_suite_id"
                      value={formData.parent_suite_id}
                      onChange={(e) => setFormData({ ...formData, parent_suite_id: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Root Level</option>
                      {suites
                        .filter((s) => !editingSuite || s.id !== editingSuite.id)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">
                      {editingSuite ? 'Update' : 'Create'} Suite
                    </Button>
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

export default TestSuites
