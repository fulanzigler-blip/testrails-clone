import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import { Plus, ChevronRight, FolderOpen, Edit, Trash2, FileText, Smartphone } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import {
  fetchTestSuites,
  createTestSuite,
  updateTestSuite,
  deleteTestSuite,
} from '../store/slices/testSuitesSlice'
import { fetchProjects } from '../store/slices/projectsSlice'
import { api } from '../lib/api'

interface TestSuite {
  id: string
  name: string
  description: string | null
  projectId: string
  parentSuiteId: string | null
  testCasesCount?: number
  createdAt: string
  updatedAt: string
}

interface TestCaseRow {
  id: string
  title: string
  priority: string
  status: string
  automationType: string
}

interface SuiteFlow {
  id: string
  name: string
  yaml: string
  orderIndex: number
  savedPath?: string | null
}

const TestSuites: React.FC = () => {
  const dispatch = useAppDispatch()
  const { suites, loading } = useAppSelector((state) => state.testSuites)
  const { projects } = useAppSelector((state) => state.projects)

  const [selectedProject, setSelectedProject] = useState<string>('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSuite, setEditingSuite] = useState<TestSuite | null>(null)
  const [expandedSuites, setExpandedSuites] = useState<Set<string>>(new Set())
  const [expandedCases, setExpandedCases] = useState<Set<string>>(new Set())
  const [suiteTestCases, setSuiteTestCases] = useState<Record<string, TestCaseRow[]>>({})
  const [loadingCases, setLoadingCases] = useState<Set<string>>(new Set())
  const [suiteFlows, setSuiteFlows] = useState<Record<string, SuiteFlow[]>>({})
  const [loadingFlows, setLoadingFlows] = useState<Set<string>>(new Set())
  const [expandedFlows, setExpandedFlows] = useState<Set<string>>(new Set())
  const [flowYamlModal, setFlowYamlModal] = useState<{ name: string; yaml: string } | null>(null)
  const [allFlows, setAllFlows] = useState<SuiteFlow[]>([])
  const [showAddFlowModal, setShowAddFlowModal] = useState(false)
  const [copyingFlowId, setCopyingFlowId] = useState<string | null>(null)
  const [addFlowToSuiteId, setAddFlowToSuiteId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    project_id: '',
    parent_suite_id: '',
  })

  useEffect(() => {
    dispatch(fetchProjects())
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

  const toggleSuiteTestCases = async (suiteId: string) => {
    const next = new Set(expandedCases)
    if (next.has(suiteId)) {
      next.delete(suiteId)
      setExpandedCases(next)
      return
    }
    next.add(suiteId)
    setExpandedCases(next)
    if (suiteTestCases[suiteId]) return // already loaded
    setLoadingCases(prev => new Set(prev).add(suiteId))
    try {
      const r = await api.get('/test-cases', { params: { suiteId, perPage: 50 } })
      const cases = r.data?.data ?? []
      setSuiteTestCases(prev => ({ ...prev, [suiteId]: Array.isArray(cases) ? cases : [] }))
    } catch {
      setSuiteTestCases(prev => ({ ...prev, [suiteId]: [] }))
    } finally {
      setLoadingCases(prev => { const s = new Set(prev); s.delete(suiteId); return s })
    }
  }

  const toggleSuiteFlows = async (suiteId: string) => {
    const next = new Set(expandedFlows)
    if (next.has(suiteId)) {
      next.delete(suiteId)
      setExpandedFlows(next)
      return
    }
    next.add(suiteId)
    setExpandedFlows(next)
    if (suiteFlows[suiteId]) return // already loaded
    setLoadingFlows(prev => new Set(prev).add(suiteId))
    try {
      const r = await api.get(`/test-suites/${suiteId}/flows`)
      const flows = r.data?.data ?? []
      setSuiteFlows(prev => ({ ...prev, [suiteId]: Array.isArray(flows) ? flows : [] }))
    } catch {
      setSuiteFlows(prev => ({ ...prev, [suiteId]: [] }))
    } finally {
      setLoadingFlows(prev => { const s = new Set(prev); s.delete(suiteId); return s })
    }
  }

  const fetchAllFlows = async () => {
    try {
      const r = await api.get('/test-suites/flows')
      setAllFlows(r.data?.data ?? [])
    } catch {
      setAllFlows([])
    }
  }

  const copyFlowToSuite = async (suiteId: string, flowId: string) => {
    setCopyingFlowId(flowId)
    try {
      await api.post(`/test-suites/${suiteId}/flows/${flowId}/copy`)
      // Refresh suite flows
      setExpandedFlows(new Set())
      setSuiteFlows(prev => ({ ...prev, [suiteId]: undefined as any }))
      toggleSuiteFlows(suiteId)
      setShowAddFlowModal(false)
    } catch (err) {
      console.error('Failed to copy flow:', err)
      alert('Failed to copy flow to suite.')
    } finally {
      setCopyingFlowId(null)
    }
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
                    <Badge variant="outline" className="cursor-pointer hover:bg-muted" onClick={() => toggleSuiteTestCases(suite.id)}>
                      <FileText className="h-3 w-3 mr-1" />
                      {suite.testCasesCount ?? '?'} test cases
                      <ChevronRight className={`h-3 w-3 ml-1 transition-transform ${expandedCases.has(suite.id) ? 'rotate-90' : ''}`} />
                    </Badge>
                    <Badge variant="outline" className="cursor-pointer hover:bg-muted" onClick={() => toggleSuiteFlows(suite.id)}>
                      <Smartphone className="h-3 w-3 mr-1" />
                      {(suiteFlows[suite.id] ?? []).length} flows
                      <ChevronRight className={`h-3 w-3 ml-1 transition-transform ${expandedFlows.has(suite.id) ? 'rotate-90' : ''}`} />
                    </Badge>
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

        {expandedCases.has(suite.id) && (
          <div className={`${level > 0 ? 'ml-6' : ''} mt-1 mb-2 rounded-lg border border-gray-100 bg-gray-50 overflow-hidden`}>
            {loadingCases.has(suite.id) ? (
              <p className="px-4 py-3 text-sm text-gray-500">Loading test cases...</p>
            ) : (suiteTestCases[suite.id] ?? []).length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400">No test cases in this suite yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-100">
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Title</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 w-24">Priority</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 w-24">Type</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 w-20">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(suiteTestCases[suite.id] ?? []).map((tc) => (
                    <tr key={tc.id} className="border-b border-gray-100 hover:bg-white">
                      <td className="px-4 py-2 font-medium text-gray-800">{tc.title}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          tc.priority === 'critical' ? 'bg-red-100 text-red-700' :
                          tc.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                          tc.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>{tc.priority}</span>
                      </td>
                      <td className="px-4 py-2 text-gray-500 capitalize">{tc.automationType?.replace('_', ' ')}</td>
                      <td className="px-4 py-2 text-gray-500 capitalize">{tc.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {expandedFlows.has(suite.id) && (
          <div className={`${level > 0 ? 'ml-6' : ''} mt-1 mb-2 rounded-lg border border-gray-100 bg-gray-50 overflow-hidden`}>
            {loadingFlows.has(suite.id) ? (
              <p className="px-4 py-3 text-sm text-gray-500">Loading Maestro flows...</p>
            ) : (suiteFlows[suite.id] ?? []).length === 0 ? (
              <div className="px-4 py-3">
                <p className="text-sm text-gray-400 mb-2">No Maestro flows in this suite yet.</p>
                <Button variant="outline" size="sm" onClick={() => { setAddFlowToSuiteId(suite.id); fetchAllFlows(); setShowAddFlowModal(true); }}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Existing Flow
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200">
                  <span className="text-xs text-gray-500">{(suiteFlows[suite.id] ?? []).length} flow(s) in this suite</span>
                  <Button variant="outline" size="sm" onClick={() => { setAddFlowToSuiteId(suite.id); fetchAllFlows(); setShowAddFlowModal(true); }}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add Flow
                  </Button>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-100">
                      <th className="text-left px-4 py-2 font-medium text-gray-600">#</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">Flow Name</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600 w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(suiteFlows[suite.id] ?? []).map((flow, idx) => (
                      <tr key={flow.id} className="border-b border-gray-100 hover:bg-white">
                        <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <Smartphone className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium text-gray-800">{flow.name}</span>
                            {flow.savedPath && (
                              <span className="text-xs text-gray-400 font-mono">{flow.savedPath}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setFlowYamlModal({ name: flow.name, yaml: flow.yaml })}
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              View
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const blob = new Blob([flow.yaml], { type: 'text/yaml' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${flow.name}.yaml`;
                                a.click();
                                URL.revokeObjectURL(url);
                              }}
                            >
                              Download
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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

      {/* Flow YAML Modal */}
      {flowYamlModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5" />
                    {flowYamlModal.name}
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setFlowYamlModal(null)}>
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs font-mono max-h-[60vh] overflow-y-auto whitespace-pre">
                  {flowYamlModal.yaml}
                </pre>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Add Flow Modal */}
      {showAddFlowModal && addFlowToSuiteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-xl max-h-[80vh] overflow-hidden">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Add Flow to Suite</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowAddFlowModal(false)}>
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {allFlows.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No flows available. Use Page Automation to capture flows first.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                    {allFlows.map(flow => (
                      <div key={flow.id} className="flex items-center justify-between p-2 rounded hover:bg-muted border">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Smartphone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium text-sm truncate">{flow.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            From: {(flow as any).testSuite?.name || 'Unknown'}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={copyingFlowId === flow.id}
                          onClick={() => copyFlowToSuite(addFlowToSuiteId!, flow.id)}
                        >
                          {copyingFlowId === flow.id ? (
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary" />
                          ) : (
                            <>
                              <Plus className="h-3 w-3 mr-1" />
                              Add
                            </>
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

export default TestSuites
