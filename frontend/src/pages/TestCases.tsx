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
import {
  Play, Loader2, Plus, Search, Edit, Trash2, Wand2, Smartphone, Trash,
  Globe, ClipboardList, LayoutList, ChevronRight, Code2, CheckCircle2, XCircle,
  FolderOpen
} from 'lucide-react'
import AIGenerateModal from '../components/AIGenerateModal'
import CrawlGenerateModal from '../components/CrawlGenerateModal'
import GitHubSyncPanel from '../components/GitHubSyncPanel'
import MaestroFlowsViewer from '../components/MaestroFlowsViewer'

// ─── Types ────────────────────────────────────────────────────────────────────

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

type TypeFilter = 'all' | 'web' | 'mobile' | 'manual'
type MainTab = 'cases' | 'flows'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferTestType(tc: any): 'web' | 'mobile' | 'manual' {
  if (tc.customFields?.dartCode) return 'mobile'
  if ((tc.automation_type || tc.automationType) === 'manual') return 'manual'
  return 'web'
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case 'critical': return 'bg-red-500 text-white'
    case 'high':     return 'bg-orange-500 text-white'
    case 'medium':   return 'bg-yellow-500 text-white'
    case 'low':      return 'bg-green-500 text-white'
    default:         return 'bg-gray-400 text-white'
  }
}

const TYPE_META = {
  web:    { label: 'Web',    icon: Globe,          badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',    dot: 'bg-blue-500' },
  mobile: { label: 'Mobile', icon: Smartphone,     badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300', dot: 'bg-violet-500' },
  manual: { label: 'Manual', icon: ClipboardList,  badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',   dot: 'bg-slate-400' },
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TestCases: React.FC = () => {
  const dispatch = useAppDispatch()
  const { testCases, loading } = useAppSelector((state) => state.testCases)
  const { projects } = useAppSelector((state) => state.projects)

  // Filters & UI state
  const [searchTerm, setSearchTerm]           = useState('')
  const [typeFilter, setTypeFilter]           = useState<TypeFilter>('all')
  const [projectFilter, setProjectFilter]     = useState<string>('')
  const [mainTab, setMainTab]                 = useState<MainTab>('cases')
  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set())

  // Modals
  const [isModalOpen, setIsModalOpen]         = useState(false)
  const [aiModalOpen, setAiModalOpen]         = useState(false)
  const [crawlModalOpen, setCrawlModalOpen]   = useState(false)
  const [editingCase, setEditingCase]         = useState<any>(null)

  // Form state
  const [formSuites, setFormSuites]           = useState<{ id: string; name: string; projectId: string }[]>([])
  const [formProjectId, setFormProjectId]     = useState('')
  const [formData, setFormData]               = useState<TestCaseFormData>({
    title: '', description: '',
    steps: [{ order: 1, description: '', expected: '' }],
    expected_result: '', priority: 'medium', automation_type: 'manual',
    suite_id: '', tags: []
  })

  // Track selected project in sidebar
  const [selectedProject, setSelectedProject] = useState<string>('')

  useEffect(() => {
    dispatch(fetchTestCases())
    dispatch(fetchProjects())
  }, [dispatch])

  // ── Counts ────────────────────────────────────────────────────────────────
  const counts = {
    all:    testCases.length,
    web:    testCases.filter(tc => inferTestType(tc) === 'web').length,
    mobile: testCases.filter(tc => inferTestType(tc) === 'mobile').length,
    manual: testCases.filter(tc => inferTestType(tc) === 'manual').length,
  }
  const automatedCount = testCases.filter(tc => (tc.automation_type || tc.automationType) !== 'manual').length

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filteredCases = testCases.filter(tc => {
    if (typeFilter !== 'all' && inferTestType(tc) !== typeFilter) return false
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      if (!tc.title?.toLowerCase().includes(q) && !tc.description?.toLowerCase().includes(q)) return false
    }
    return true
  })

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    dispatch(setFilters({ search: searchTerm }))
    dispatch(fetchTestCases({ search: searchTerm }))
  }

  const handleFormProjectChange = async (projectId: string) => {
    setFormProjectId(projectId)
    setFormData(prev => ({ ...prev, suite_id: '' }))
    if (!projectId) { setFormSuites([]); return }
    try {
      const r = await api.get('/test-suites', { params: { projectId, perPage: 100 } })
      setFormSuites(r.data?.data ?? [])
    } catch { setFormSuites([]) }
  }

  const handleCreate = () => {
    setEditingCase(null)
    setFormProjectId('')
    setFormSuites([])
    setFormData({ title: '', description: '', steps: [{ order: 1, description: '', expected: '' }],
      expected_result: '', priority: 'medium', automation_type: 'manual', suite_id: '', tags: [] })
    setIsModalOpen(true)
  }

  const handleEdit = async (testCase: any) => {
    setEditingCase(testCase)
    let steps = testCase.steps
    if (typeof steps === 'string') { try { steps = JSON.parse(steps) } catch { steps = [] } }
    if (!Array.isArray(steps)) steps = []
    setFormData({
      title: testCase.title, description: testCase.description || '', steps,
      expected_result: testCase.expected_result || testCase.expectedResult || '',
      priority: testCase.priority || 'medium',
      automation_type: testCase.automation_type || testCase.automationType || 'automated',
      suite_id: testCase.suite_id || testCase.suiteId || '', tags: testCase.tags || []
    })
    const suiteId = testCase.suite_id || testCase.suiteId
    if (suiteId) {
      try {
        const suiteResp = await api.get(`/test-suites/${suiteId}`)
        const suite = suiteResp.data?.data
        if (suite) {
          const projectId = suite.projectId || suite.project_id
          setFormProjectId(projectId || '')
          const suitesResp = await api.get('/test-suites', { params: { projectId, perPage: 100 } })
          setFormSuites(suitesResp.data?.data?.items || suitesResp.data?.data || [])
        }
      } catch { /* silent */ }
    } else { setFormProjectId(''); setFormSuites([]) }
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this test case?')) {
      await dispatch(deleteTestCase(id))
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Delete ${selectedIds.size} selected test case(s)?`)) return
    await dispatch(bulkDeleteTestCases(Array.from(selectedIds)))
    setSelectedIds(new Set())
  }

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleSelectAll = () =>
    selectedIds.size === filteredCases.length
      ? setSelectedIds(new Set())
      : setSelectedIds(new Set(filteredCases.map(tc => tc.id)))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Record<string, any> = {
      title: formData.title, description: formData.description,
      steps: formData.steps, expectedResult: formData.expected_result,
      priority: formData.priority, automationType: formData.automation_type, tags: formData.tags,
    }
    if (formData.suite_id) payload.suiteId = formData.suite_id
    if (editingCase) {
      await dispatch(updateTestCase({ id: editingCase.id, ...payload }))
    } else {
      await dispatch(createTestCase(payload))
    }
    setIsModalOpen(false)
  }

  const addStep = () => {
    const steps = formData.steps || []
    setFormData({ ...formData, steps: [...steps, { order: steps.length + 1, description: '', expected: '' }] })
  }
  const updateStep = (index: number, field: 'description' | 'expected', value: string) => {
    const newSteps = [...(formData.steps || [])]
    newSteps[index] = { ...newSteps[index], [field]: value }
    setFormData({ ...formData, steps: newSteps })
  }
  const removeStep = (index: number) => {
    setFormData({
      ...formData,
      steps: (formData.steps || []).filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 }))
    })
  }

  // ── Dynamic header title ──────────────────────────────────────────────────
  const panelTitle = {
    all:    'All Test Cases',
    web:    'Web Tests',
    mobile: 'Mobile Tests',
    manual: 'Manual Tests',
  }[typeFilter]

  if (loading && testCases.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex h-full -m-6 overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>

      {/* ── Left Sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-56 border-r bg-card flex flex-col shrink-0 overflow-y-auto">

        {/* Type filters */}
        <div className="px-3 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
            Test Type
          </p>
          {([
            { key: 'all',    label: 'All Tests',     icon: LayoutList,    count: counts.all },
            { key: 'web',    label: 'Web Tests',      icon: Globe,         count: counts.web },
            { key: 'mobile', label: 'Mobile Tests',   icon: Smartphone,    count: counts.mobile },
            { key: 'manual', label: 'Manual Tests',   icon: ClipboardList, count: counts.manual },
          ] as const).map(({ key, label, icon: Icon, count }) => {
            const active = typeFilter === key
            return (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                className={`w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium mb-0.5 transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </span>
                <span className={`text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center ${
                  active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>{count}</span>
              </button>
            )
          })}
        </div>

        <div className="border-t mx-3" />

        {/* Project filter */}
        <div className="px-3 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
            Project
          </p>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {/* GitHub sync helper */}
          {projectFilter && (
            <div className="mt-3">
              <Input
                placeholder="Project ID for GitHub sync"
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          )}
        </div>

        <div className="border-t mx-3" />

        {/* Quick stats */}
        <div className="px-3 py-4 mt-auto">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3 px-1">
            Stats
          </p>
          <div className="space-y-2">
            {[
              { label: 'Total',     value: counts.all,    color: 'text-foreground' },
              { label: 'Automated', value: automatedCount, color: 'text-blue-600 dark:text-blue-400' },
              { label: 'Manual',    value: counts.manual, color: 'text-slate-500' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between px-1">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className={`text-sm font-semibold tabular-nums ${color}`}>{value}</span>
              </div>
            ))}
          </div>

          {/* Type breakdown dots */}
          <div className="mt-4 space-y-1.5">
            {(['web','mobile','manual'] as const).map(type => {
              const meta = TYPE_META[type]
              const pct = counts.all > 0 ? Math.round((counts[type] / counts.all) * 100) : 0
              return (
                <div key={type} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${meta.dot}`} />
                  <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${meta.dot}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground w-6 text-right">{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>
      </aside>

      {/* ── Right Main Panel ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-card shrink-0">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{panelTitle}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {filteredCases.length} test case{filteredCases.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCrawlModalOpen(true)}>
              <Smartphone className="w-4 h-4 mr-1.5" />
              Crawl &amp; Generate
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAiModalOpen(true)}>
              <Wand2 className="w-4 h-4 mr-1.5" />
              Generate with AI
            </Button>
            <Button size="sm" onClick={handleCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Test Case
            </Button>
          </div>
        </div>

        {/* Main tabs: Cases / Flows */}
        <div className="flex items-center gap-0.5 px-6 border-b bg-card shrink-0">
          {([
            { key: 'cases', label: 'Test Cases' },
            { key: 'flows', label: 'Maestro Flows' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setMainTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                mainTab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto p-6">

          {mainTab === 'flows' && <MaestroFlowsViewer />}

          {mainTab === 'cases' && (
            <div className="space-y-4">

              {/* Search bar */}
              <form onSubmit={handleSearch} className="flex gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search test cases..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <Button type="submit" variant="outline" size="sm">Search</Button>
              </form>

              {/* GitHub sync panel */}
              {selectedProject && <GitHubSyncPanel projectId={selectedProject} />}

              {/* Bulk delete bar */}
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 px-4 py-2.5 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <span className="text-sm font-medium text-destructive">
                    {selectedIds.size} selected
                  </span>
                  <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                    <Trash className="mr-1.5 h-3.5 w-3.5" />
                    Delete Selected
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                    Clear
                  </Button>
                </div>
              )}

              {/* Table */}
              {filteredCases.length === 0 ? (
                <EmptyState typeFilter={typeFilter} onNew={handleCreate} />
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="w-10 px-4 py-3">
                          <input
                            type="checkbox"
                            checked={filteredCases.length > 0 && selectedIds.size === filteredCases.length}
                            onChange={toggleSelectAll}
                            className="rounded border-gray-300"
                          />
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Test Case</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Priority</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Steps</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Updated</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredCases.map((tc) => {
                        const type = inferTestType(tc)
                        const meta = TYPE_META[type]
                        const TypeIcon = meta.icon
                        return (
                          <tr
                            key={tc.id}
                            className={`hover:bg-muted/30 transition-colors ${
                              selectedIds.has(tc.id) ? 'bg-primary/5' : ''
                            }`}
                          >
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(tc.id)}
                                onChange={() => toggleSelect(tc.id)}
                                className="rounded border-gray-300"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-start gap-2.5">
                                <span className={`mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ${meta.badge}`}>
                                  <TypeIcon className="h-2.5 w-2.5" />
                                  {meta.label}
                                </span>
                                <div>
                                  <div className="font-medium text-foreground leading-snug">{tc.title}</div>
                                  {tc.description && (
                                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{tc.description}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${getPriorityColor(tc.priority)}`}>
                                {tc.priority}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                variant={tc.status === 'active' ? 'default' : 'secondary'}
                                className="text-[10px]"
                              >
                                {tc.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground tabular-nums">
                              {(tc.steps || []).length}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(tc.updated_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                {tc.customFields?.dartCode && <RunTestCaseButton testCase={tc} />}
                                <Button
                                  variant="ghost" size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => handleEdit(tc)}
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost" size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => handleDelete(tc.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      <CrawlGenerateModal
        open={crawlModalOpen}
        onClose={() => setCrawlModalOpen(false)}
        onSaved={(result) => {
          setCrawlModalOpen(false)
          dispatch(fetchTestCases({}))
          if (result) {
            dispatch(setGeneratedResults({
              testCases: result.testCases || [],
              maestroFlows: (result.maestroFlows || []).map((f: any) => ({
                name: f.name, yaml: f.yaml, savedPath: f.savedPath || null,
              })),
              savedToDb: result.savedToDb || false,
              savedCount: result.savedCount || 0,
            }))
            setMainTab('flows')
          }
        }}
      />

      <AIGenerateModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onSaved={() => { setAiModalOpen(false); dispatch(fetchTestCases({})) }}
      />

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <Card>
              <CardHeader>
                <CardTitle>{editingCase ? 'Edit Test Case' : 'New Test Case'}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="title">Title *</Label>
                    <Input id="title" value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })} required />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Input id="description" value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="priority">Priority *</Label>
                      <select id="priority" value={formData.priority}
                        onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="automation_type">Type *</Label>
                      <select id="automation_type" value={formData.automation_type}
                        onChange={(e) => setFormData({ ...formData, automation_type: e.target.value as any })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
                        <option value="manual">Manual</option>
                        <option value="automated">Automated</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="expected_result">Expected Result *</Label>
                    <textarea id="expected_result" value={formData.expected_result}
                      onChange={(e) => setFormData({ ...formData, expected_result: e.target.value })}
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Test Steps</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addStep}>
                        <Plus className="h-4 w-4 mr-2" /> Add Step
                      </Button>
                    </div>
                    {(formData.steps || []).map((step, index) => (
                      <div key={index} className="border rounded-lg p-4 mb-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Step {step.order}</span>
                          {(formData.steps || []).length > 1 && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeStep(index)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                        <Input placeholder="Description" value={step.description}
                          onChange={(e) => updateStep(index, 'description', e.target.value)} />
                        <Input placeholder="Expected result" value={step.expected}
                          onChange={(e) => updateStep(index, 'expected', e.target.value)} />
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="form_project">Project</Label>
                      <select id="form_project" value={formProjectId}
                        onChange={(e) => handleFormProjectChange(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <option value="">Select project...</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="form_suite">Test Suite</Label>
                      <select id="form_suite" value={formData.suite_id}
                        onChange={(e) => setFormData({ ...formData, suite_id: e.target.value })}
                        disabled={!formProjectId}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50">
                        <option value="">No suite</option>
                        {formSuites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                    <Button type="submit">{editingCase ? 'Update' : 'Create'} Test Case</Button>
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

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ typeFilter, onNew }: { typeFilter: TypeFilter; onNew: () => void }) {
  const messages: Record<TypeFilter, { icon: React.ElementType; title: string; desc: string }> = {
    all:    { icon: LayoutList,    title: 'No test cases yet',   desc: 'Create your first test case to get started.' },
    web:    { icon: Globe,         title: 'No web tests yet',    desc: 'Use the Web Visual Builder to generate Playwright tests automatically.' },
    mobile: { icon: Smartphone,   title: 'No mobile tests yet', desc: 'Use Crawl & Generate to create Flutter integration tests for your Android app.' },
    manual: { icon: ClipboardList, title: 'No manual tests yet', desc: 'Create manual test cases to track human-executed test scenarios.' },
  }
  const { icon: Icon, title, desc } = messages[typeFilter]
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs mb-6">{desc}</p>
      <Button size="sm" onClick={onNew}>
        <Plus className="h-4 w-4 mr-1.5" /> New Test Case
      </Button>
    </div>
  )
}

// ─── Run Test Case Button ─────────────────────────────────────────────────────

function RunTestCaseButton({ testCase }: { testCase: any }) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ success: boolean; output: string; duration: number } | null>(null)

  const handleRun = async () => {
    setRunning(true); setResult(null)
    try {
      const resp = await api.post(`/integration-tests/run-testcase/${testCase.id}`)
      const data = resp.data?.data
      setResult({ success: data?.success ?? false, output: data?.output || '', duration: data?.duration ?? 0 })
    } catch (err: any) {
      setResult({ success: false, output: err.response?.data?.error?.message || err.message || 'Run failed', duration: 0 })
    } finally { setRunning(false) }
  }

  const fmt = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`

  return (
    <div>
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
        onClick={handleRun} disabled={running}>
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
      </Button>
      {result && (
        <div className="absolute z-10 mt-1 p-3 bg-popover border rounded-lg shadow-lg text-xs w-80">
          <div className="flex items-center gap-1.5 mb-2">
            {result.success
              ? <><CheckCircle2 className="h-4 w-4 text-green-600" /><span className="font-semibold text-green-600">PASSED</span></>
              : <><XCircle className="h-4 w-4 text-red-600" /><span className="font-semibold text-red-600">FAILED</span></>
            }
            <span className="text-muted-foreground ml-auto">{fmt(result.duration)}</span>
          </div>
          {result.output && (
            <pre className="bg-gray-900 text-gray-100 p-2 rounded font-mono max-h-[160px] overflow-y-auto whitespace-pre-wrap break-all text-[10px]">
              {result.output.slice(-800)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export default TestCases
