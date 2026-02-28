import React, { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { fetchTestCases, createTestCase, updateTestCase, deleteTestCase, setFilters } from '../store/slices/testCasesSlice'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import { Plus, Search, Edit, Trash2, Filter } from 'lucide-react'

interface TestCaseFormData {
  title: string
  description: string
  steps: Array<{ order: number; description: string; expected: string }>
  expected_result: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  automation_type: 'manual' | 'automated'
  suite_id: string
  tags: string[]
}

const TestCases: React.FC = () => {
  const dispatch = useAppDispatch()
  const { testCases, loading, filters } = useAppSelector((state) => state.testCases)
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCase, setEditingCase] = useState<any>(null)
  const [formData, setFormData] = useState<TestCaseFormData>({
    title: '',
    description: '',
    steps: [{ order: 1, description: '', expected: '' }],
    expected_result: '',
    priority: 'medium',
    automation_type: 'manual',
    suite_id: '',
    tags: []
  })

  useEffect(() => {
    dispatch(fetchTestCases())
  }, [dispatch])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    dispatch(setFilters({ search: searchTerm }))
    dispatch(fetchTestCases({ search: searchTerm }))
  }

  const handleCreate = () => {
    setEditingCase(null)
    setFormData({
      title: '',
      description: '',
      steps: [{ order: 1, description: '', expected: '' }],
      expected_result: '',
      priority: 'medium',
      automation_type: 'manual',
      suite_id: '',
      tags: []
    })
    setIsModalOpen(true)
  }

  const handleEdit = (testCase: any) => {
    setEditingCase(testCase)
    setFormData({
      title: testCase.title,
      description: testCase.description,
      steps: testCase.steps,
      expected_result: testCase.expected_result,
      priority: testCase.priority,
      automation_type: testCase.automation_type,
      suite_id: testCase.suite_id,
      tags: testCase.tags
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this test case?')) {
      await dispatch(deleteTestCase(id))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editingCase) {
      await dispatch(updateTestCase({ id: editingCase.id, ...formData }))
    } else {
      await dispatch(createTestCase(formData))
    }
    setIsModalOpen(false)
  }

  const addStep = () => {
    setFormData({
      ...formData,
      steps: [
        ...formData.steps,
        { order: formData.steps.length + 1, description: '', expected: '' }
      ]
    })
  }

  const updateStep = (index: number, field: 'description' | 'expected', value: string) => {
    const newSteps = [...formData.steps]
    newSteps[index][field] = value
    setFormData({ ...formData, steps: newSteps })
  }

  const removeStep = (index: number) => {
    setFormData({
      ...formData,
      steps: formData.steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 }))
    })
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-500'
      case 'high': return 'bg-orange-500'
      case 'medium': return 'bg-yellow-500'
      case 'low': return 'bg-green-500'
      default: return 'bg-gray-500'
    }
  }

  if (loading && testCases.length === 0) {
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
          <h1 className="text-3xl font-bold tracking-tight">Test Cases</h1>
          <p className="text-muted-foreground">Manage your test cases</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Test Case
        </Button>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search test cases..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="submit" variant="outline">
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Test Cases Table */}
      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Title</th>
                  <th className="text-left p-3 font-medium">Priority</th>
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Steps</th>
                  <th className="text-left p-3 font-medium">Updated</th>
                  <th className="text-left p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {testCases.map((testCase) => (
                  <tr key={testCase.id} className="border-b hover:bg-muted/50">
                    <td className="p-3">
                      <div className="font-medium">{testCase.title}</div>
                      <div className="text-sm text-muted-foreground">{testCase.description}</div>
                    </td>
                    <td className="p-3">
                      <Badge className={`${getPriorityColor(testCase.priority)} text-white`}>
                        {testCase.priority}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline">{testCase.automation_type}</Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant={testCase.status === 'active' ? 'default' : 'secondary'}>
                        {testCase.status}
                      </Badge>
                    </td>
                    <td className="p-3">{testCase.steps.length}</td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {new Date(testCase.updated_at).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(testCase)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(testCase.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <Card>
              <CardHeader>
                <CardTitle>{editingCase ? 'Edit Test Case' : 'New Test Case'}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="title">Title *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="priority">Priority *</Label>
                      <select
                        id="priority"
                        value={formData.priority}
                        onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        required
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="automation_type">Type *</Label>
                      <select
                        id="automation_type"
                        value={formData.automation_type}
                        onChange={(e) => setFormData({ ...formData, automation_type: e.target.value as any })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        required
                      >
                        <option value="manual">Manual</option>
                        <option value="automated">Automated</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="expected_result">Expected Result *</Label>
                    <textarea
                      id="expected_result"
                      value={formData.expected_result}
                      onChange={(e) => setFormData({ ...formData, expected_result: e.target.value })}
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Test Steps</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addStep}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Step
                      </Button>
                    </div>
                    {formData.steps.map((step, index) => (
                      <div key={index} className="border rounded-lg p-4 mb-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Step {step.order}</span>
                          {formData.steps.length > 1 && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeStep(index)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                        <Input
                          placeholder="Description"
                          value={step.description}
                          onChange={(e) => updateStep(index, 'description', e.target.value)}
                        />
                        <Input
                          placeholder="Expected result"
                          value={step.expected}
                          onChange={(e) => updateStep(index, 'expected', e.target.value)}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">
                      {editingCase ? 'Update' : 'Create'} Test Case
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

export default TestCases
