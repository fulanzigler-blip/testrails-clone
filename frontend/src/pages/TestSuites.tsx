import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import { Plus, ChevronRight, FolderOpen, Edit, Trash2 } from 'lucide-react'

interface TestSuite {
  id: string
  name: string
  description?: string
  project_id: string
  parent_suite_id: string | null
  test_cases_count: number
  created_at: string
  children?: TestSuite[]
}

const TestSuites: React.FC = () => {
  const [suites, setSuites] = useState<TestSuite[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSuite, setEditingSuite] = useState<TestSuite | null>(null)
  const [expandedSuites, setExpandedSuites] = useState<Set<string>>(new Set())
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    project_id: '',
    parent_suite_id: ''
  })

  const handleCreate = () => {
    setEditingSuite(null)
    setFormData({
      name: '',
      description: '',
      project_id: '',
      parent_suite_id: ''
    })
    setIsModalOpen(true)
  }

  const handleEdit = (suite: TestSuite) => {
    setEditingSuite(suite)
    setFormData({
      name: suite.name,
      description: suite.description || '',
      project_id: suite.project_id,
      parent_suite_id: suite.parent_suite_id || ''
    })
    setIsModalOpen(true)
  }

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this suite? All child suites will also be deleted.')) {
      const deleteRecursive = (suites: TestSuite[], suiteId: string): TestSuite[] => {
        return suites
          .filter(suite => suite.id !== suiteId)
          .map(suite => ({
            ...suite,
            children: suite.children ? deleteRecursive(suite.children, suiteId) : undefined
          }))
      }
      setSuites(deleteRecursive(suites, id))
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Here you would make an API call to create/update the suite
    console.log('Submitting suite:', formData)
    setIsModalOpen(false)
  }

  const renderSuite = (suite: TestSuite, level: number = 0) => {
    const isExpanded = expandedSuites.has(suite.id)
    const hasChildren = suite.children && suite.children.length > 0

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
                    <Badge variant="secondary">{suite.test_cases_count} test cases</Badge>
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
            {suite.children!.map(child => renderSuite(child, level + 1))}
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

      {/* Suites Tree */}
      <div className="space-y-4">
        {suites.length === 0 ? (
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
          suites.map(suite => renderSuite(suite))
        )}
      </div>

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
                      {/* Add project options from API */}
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
                      {/* Add suite options from API */}
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
