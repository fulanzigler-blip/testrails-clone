import React, { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { fetchTestCases, createTestCase, updateTestCase, deleteTestCase, bulkDeleteTestCases, setFilters } from '../store/slices/testCasesSlice'
import { setGeneratedResults } from '../store/slices/generatedFlowsSlice'
import { fetchProjects } from '../store/slices/projectsSlice'
import { api } from '../lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import { Play, Loader2, CheckCircle2, XCircle, Code2, Plus, Search, Edit, Trash2, Filter, Wand2, Smartphone, Trash } from 'lucide-react'
import AIGenerateModal from '../components/AIGenerateModal'
import CrawlGenerateModal from '../components/CrawlGenerateModal'
import GitHubSyncPanel from '../components/GitHubSyncPanel'
import MaestroFlowsViewer from '../components/MaestroFlowsViewer'

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
  const { projects } = useAppSelector((state) => state.projects)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [crawlModalOpen, setCrawlModalOpen] = useState(false)
  const [editingCase, setEditingCase] = useState<any>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'cases' | 'flows'>('cases')
  const [formSuites, setFormSuites] = useState<{ id: string; name: string; projectId: string }[]>([])
  const [formProjectId, setFormProjectId] = useState('')
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
    dispatch(fetchProjects())
  }, [dispatch])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    dispatch(setFilters({ search: searchTerm }))
    dispatch(fetchTestCases({ search: searchTerm }))
  }

  const handleFormProjectChange = async (projectId: string) => {
    setFormProjectId(projectId)
    setFormData(prev => ({ ...prev, suite_id: '' }))
    if (!projectId) { setFormSuites([]); return; }
    try {
      const r = await api.get('/test-suites', { params: { projectId, perPage: 100 } })
      setFormSuites(r.data?.data ?? [])
    } catch { setFormSuites([]) }
  }

  const handleCreate = () => {
    setEditingCase(null)
    setFormProjectId('')
    setFormSuites([])
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
      setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Delete ${selectedIds.size} selected test case(s)?`)) return
    await dispatch(bulkDeleteTestCases(Array.from(selectedIds)))
    setSelectedIds(new Set())
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === testCases.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(testCases.map(tc => tc.id)))
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCrawlModalOpen(true)}>
            <Smartphone className="w-4 h-4 mr-2" />
            Crawl &amp; Generate
          </Button>
          <Button variant="outline" onClick={() => setAiModalOpen(true)}>
            <Wand2 className="w-4 h-4 mr-2" />
            Generate with AI
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New Test Case
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'cases'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('cases')}
        >
          Test Cases
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'flows'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('flows')}
        >
          Maestro Flows
        </button>
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
            <Input
              placeholder="Project ID (for GitHub sync)"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-72"
            />
            <Button type="submit" variant="outline">
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* GitHub Sync Panel */}
      {activeTab === 'cases' && selectedProject && <GitHubSyncPanel projectId={selectedProject} />}

      {/* Test Cases Table */}
      {activeTab === 'cases' && (
      <Card>
        <CardContent className="pt-6">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 mb-4 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
              <span className="text-sm font-medium text-red-700 dark:text-red-400">
                {selectedIds.size} selected
              </span>
              <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                <Trash className="mr-2 h-4 w-4" />
                Delete Selected
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Clear selection
              </Button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium w-10">
                    <input
                      type="checkbox"
                      checked={testCases.length > 0 && selectedIds.size === testCases.length}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300"
                    />
                  </th>
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
                  <tr key={testCase.id} className={`border-b hover:bg-muted/50 ${selectedIds.has(testCase.id) ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(testCase.id)}
                        onChange={() => toggleSelect(testCase.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
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
                        {/* Run button for integration test cases with generated code */}
                        {testCase.customFields?.dartCode && (
                          <RunTestCaseButton testCase={testCase} />
                        )}
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
      )}

      {/* Maestro Flows Tab */}
      {activeTab === 'flows' && <MaestroFlowsViewer />}

      {/* Crawl & Generate Modal */}
      <CrawlGenerateModal
        open={crawlModalOpen}
        onClose={() => setCrawlModalOpen(false)}
        onSaved={(result) => {
          setCrawlModalOpen(false);
          dispatch(fetchTestCases({}));
          if (result) {
            dispatch(setGeneratedResults({
              testCases: result.testCases || [],
              maestroFlows: (result.maestroFlows || []).map((f: any) => ({
                name: f.name,
                yaml: f.yaml,
                savedPath: f.savedPath || null,
              })),
              savedToDb: result.savedToDb || false,
              savedCount: result.savedCount || 0,
            }));
            setActiveTab('flows');
          }
        }}
      />

      {/* AI Generate Modal */}
      <AIGenerateModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onSaved={() => { setAiModalOpen(false); dispatch(fetchTestCases({})) }}
      />

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

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="form_project">Project</Label>
                      <select
                        id="form_project"
                        value={formProjectId}
                        onChange={(e) => handleFormProjectChange(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Select project...</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="form_suite">Test Suite</Label>
                      <select
                        id="form_suite"
                        value={formData.suite_id}
                        onChange={(e) => setFormData({ ...formData, suite_id: e.target.value })}
                        disabled={!formProjectId}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
                      >
                        <option value="">No suite</option>
                        {formSuites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
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

// ─── Run Test Case Button Component ──────────────────────────────────────────

function RunTestCaseButton({ testCase }: { testCase: any }) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ success: boolean; output: string; duration: number } | null>(null)

  const handleRun = async () => {
    setRunning(true)
    setResult(null)
    try {
      const resp = await api.post(`/integration-tests/run-testcase/${testCase.id}`)
      const data = resp.data?.data
      setResult({
        success: data?.success ?? false,
        output: data?.output || '',
        duration: data?.duration ?? 0,
      })
    } catch (err: any) {
      setResult({
        success: false,
        output: err.response?.data?.error?.message || err.message || 'Run failed',
        duration: 0,
      })
    } finally {
      setRunning(false)
    }
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={handleRun} disabled={running} className="text-green-600 hover:text-green-700">
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
      </Button>
      {result && (
        <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
          <div className="flex items-center gap-1 mb-1">
            {result.success ? (
              <span className="text-green-600 font-semibold">✓ PASSED</span>
            ) : (
              <span className="text-red-600 font-semibold">✗ FAILED</span>
            )}
            <span className="text-muted-foreground ml-1">{formatDuration(result.duration)}</span>
          </div>
          {result.output && (
            <pre className="bg-gray-900 text-gray-100 p-2 rounded font-mono max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all">
              {result.output.slice(-1000)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export default TestCases
