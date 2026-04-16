import { useEffect, useState, useCallback } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { fetchTestCases } from '../store/slices/testCasesSlice'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import {
  FolderOpen, FolderPlus, TestTube, Play, ChevronRight,
  Search, X, CheckCircle2, XCircle, Loader2, Eye, Clock,
  Layers, Cpu, FileText, AlertCircle, Plus, Trash2,
} from 'lucide-react'
import { api } from '../lib/api'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TestCase {
  id: string
  title: string
  description?: string
  priority: string
  automationType: string
  status: string
  customFields?: { dartCode?: string }
}

interface Suite {
  id: string
  name: string
  description?: string
  testCases: TestCase[]
  isAuto?: boolean           // auto-grouped suggestion
}

interface RunResult {
  success: boolean
  duration: number
  output: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-600 border-red-500/30',
  high:     'bg-orange-500/15 text-orange-600 border-orange-500/30',
  medium:   'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
  low:      'bg-green-500/15 text-green-600 border-green-500/30',
}

function fmt(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function autoGroup(testCases: TestCase[]): Suite[] {
  const groups = new Map<string, TestCase[]>()
  const ungrouped: TestCase[] = []
  for (const tc of testCases) {
    const words = tc.title.split(' ')
    const prefix = words.length >= 2 ? words.slice(0, 2).join(' ') : words[0]
    const matching = testCases.filter(t => t.title.toLowerCase().startsWith(prefix.toLowerCase()))
    if (matching.length >= 2) {
      if (!groups.has(prefix)) groups.set(prefix, [])
      if (!groups.get(prefix)!.find(t => t.id === tc.id)) groups.get(prefix)!.push(tc)
    } else {
      if (!ungrouped.find(t => t.id === tc.id)) ungrouped.push(tc)
    }
  }
  const result: Suite[] = []
  for (const [name, cases] of groups) {
    result.push({ id: 'auto_' + name, name, description: `${cases.length} related test cases`, testCases: cases, isAuto: true })
  }
  if (ungrouped.length > 0) {
    result.push({ id: 'auto_ungrouped', name: 'Ungrouped', description: `${ungrouped.length} standalone test cases`, testCases: ungrouped, isAuto: true })
  }
  return result
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ onNew: () => void }> = ({ onNew }) => (
  <div className="flex flex-col items-center justify-center h-full text-center py-20">
    <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
      <FolderOpen className="h-7 w-7 text-muted-foreground" />
    </div>
    <h3 className="text-base font-semibold mb-1">No suite selected</h3>
    <p className="text-sm text-muted-foreground mb-5 max-w-xs">
      Pick a suite from the left, or create a new one to group your test cases.
    </p>
    <Button onClick={onNew} size="sm">
      <FolderPlus className="h-4 w-4 mr-2" /> New Suite
    </Button>
  </div>
)

const OutputModal: React.FC<{
  title: string; result: RunResult; onClose: () => void
}> = ({ title, result, onClose }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
    <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div className="flex items-center gap-2.5">
          {result.success
            ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            : <XCircle className="h-4 w-4 text-red-500" />}
          <span className="font-medium text-sm">{title}</span>
          <Badge variant="outline" className="text-xs">{fmt(result.duration)}</Badge>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
      <pre className="bg-zinc-950 text-zinc-100 p-5 text-xs font-mono max-h-[420px] overflow-y-auto whitespace-pre-wrap break-all leading-relaxed">
        {result.output || '(no output)'}
      </pre>
    </div>
  </div>
)

// ─── Main Page ─────────────────────────────────────────────────────────────────

const TestSuites: React.FC = () => {
  const dispatch = useAppDispatch()
  const { testCases } = useAppSelector(s => s.testCases)

  const [manualSuites, setManualSuites] = useState<Suite[]>([])
  const [activeSuiteId, setActiveSuiteId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showAutoSuggestions, setShowAutoSuggestions] = useState(false)

  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())
  const [runResults, setRunResults] = useState<Record<string, RunResult>>({})
  const [showOutput, setShowOutput] = useState<{ title: string; result: RunResult } | null>(null)

  // Create modal
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [caseSearch, setCaseSearch] = useState('')

  useEffect(() => { dispatch(fetchTestCases({ page: 1, perPage: 200 })) }, [dispatch])

  const autoSuites = autoGroup(testCases)
  const allSuites = [...manualSuites, ...(showAutoSuggestions ? autoSuites : [])]

  const filteredSuites = search.trim()
    ? allSuites.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    : allSuites

  const activeSuite = allSuites.find(s => s.id === activeSuiteId) || null

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleRunCase = useCallback(async (tc: TestCase) => {
    if (runningIds.has(tc.id)) return
    setRunningIds(p => new Set([...p, tc.id]))
    setRunResults(p => { const n = { ...p }; delete n[tc.id]; return n })
    try {
      const resp = await api.post(`/integration-tests/run-testcase/${tc.id}`)
      const d = resp.data?.data
      setRunResults(p => ({ ...p, [tc.id]: { success: d?.success ?? false, duration: d?.duration ?? 0, output: d?.output || '' } }))
    } catch (err: any) {
      setRunResults(p => ({ ...p, [tc.id]: { success: false, duration: 0, output: err.response?.data?.error?.message || err.message || 'Run failed' } }))
    } finally {
      setRunningIds(p => { const n = new Set(p); n.delete(tc.id); return n })
    }
  }, [runningIds])

  const handleCreateSuite = () => {
    if (!newName.trim()) return
    const suite: Suite = {
      id: 'manual_' + Date.now(),
      name: newName.trim(),
      description: newDesc.trim() || `${selectedIds.length} test cases`,
      testCases: testCases.filter(tc => selectedIds.includes(tc.id)),
    }
    setManualSuites(p => [suite, ...p])
    setActiveSuiteId(suite.id)
    setCreating(false)
    setNewName(''); setNewDesc(''); setSelectedIds([]); setCaseSearch('')
  }

  const handleDeleteSuite = (id: string) => {
    setManualSuites(p => p.filter(s => s.id !== id))
    if (activeSuiteId === id) setActiveSuiteId(null)
  }

  // ── Suite stats ────────────────────────────────────────────────────────────

  const suiteStats = (suite: Suite) => {
    const total = suite.testCases.length
    const automated = suite.testCases.filter(tc => tc.customFields?.dartCode).length
    const passed = suite.testCases.filter(tc => runResults[tc.id]?.success).length
    const failed = suite.testCases.filter(tc => runResults[tc.id] && !runResults[tc.id].success).length
    return { total, automated, passed, failed }
  }

  // ── Filtered cases for active suite ────────────────────────────────────────

  const filteredCases = activeSuite?.testCases || []

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">

      {/* ── Left panel: Suite list ─────────────────────────────────────── */}
      <aside className="w-72 border-r flex flex-col bg-card shrink-0">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Test Suites</h2>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Search suites..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Suite list */}
        <div className="flex-1 overflow-y-auto py-2">

          {/* Manual suites */}
          {manualSuites.length > 0 && (
            <div className="mb-1">
              <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                My Suites
              </div>
              {filteredSuites.filter(s => !s.isAuto).map(suite => {
                const st = suiteStats(suite)
                const active = activeSuiteId === suite.id
                return (
                  <button
                    key={suite.id}
                    onClick={() => setActiveSuiteId(suite.id)}
                    className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors ${
                      active ? 'bg-primary/8 border-r-2 border-primary' : 'hover:bg-muted/50'
                    }`}
                  >
                    <FolderOpen className={`h-4 w-4 mt-0.5 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{suite.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{st.total} cases</span>
                        {st.passed > 0 && <span className="text-[10px] text-emerald-500">✓{st.passed}</span>}
                        {st.failed > 0 && <span className="text-[10px] text-red-500">✗{st.failed}</span>}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Auto suggestions toggle */}
          <div className="px-4 py-1.5">
            <button
              onClick={() => setShowAutoSuggestions(p => !p)}
              className="w-full flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Suggested Groups</span>
              <ChevronRight className={`h-3 w-3 transition-transform ${showAutoSuggestions ? 'rotate-90' : ''}`} />
            </button>
          </div>

          {showAutoSuggestions && filteredSuites.filter(s => s.isAuto).map(suite => {
            const st = suiteStats(suite)
            const active = activeSuiteId === suite.id
            return (
              <button
                key={suite.id}
                onClick={() => setActiveSuiteId(suite.id)}
                className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors ${
                  active ? 'bg-primary/8 border-r-2 border-primary' : 'hover:bg-muted/50'
                }`}
              >
                <Layers className={`h-4 w-4 mt-0.5 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{suite.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{st.total} cases · auto</span>
                  </div>
                </div>
              </button>
            )
          })}

          {filteredSuites.length === 0 && !showAutoSuggestions && manualSuites.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-muted-foreground">No suites yet.</p>
              <button onClick={() => setCreating(true)} className="mt-2 text-xs text-primary hover:underline">
                Create your first suite
              </button>
            </div>
          )}
        </div>

        {/* Footer stats */}
        <div className="border-t px-4 py-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>{testCases.length} total cases</span>
          <span>{manualSuites.length} suite{manualSuites.length !== 1 ? 's' : ''}</span>
        </div>
      </aside>

      {/* ── Right panel: Suite detail ──────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-background">
        {!activeSuite ? (
          <EmptyState onNew={() => setCreating(true)} />
        ) : (
          <>
            {/* Suite header */}
            <div className="px-6 py-4 border-b flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  {activeSuite.isAuto
                    ? <Layers className="h-4.5 w-4.5 text-primary" />
                    : <FolderOpen className="h-4.5 w-4.5 text-primary" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-base font-semibold">{activeSuite.name}</h1>
                    {activeSuite.isAuto && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">auto-grouped</Badge>
                    )}
                  </div>
                  {activeSuite.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{activeSuite.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!activeSuite.isAuto && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => handleDeleteSuite(activeSuite.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                  </Button>
                )}
                {activeSuite.isAuto && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setNewName(activeSuite.name)
                      setSelectedIds(activeSuite.testCases.map(t => t.id))
                      setCreating(true)
                    }}
                  >
                    <FolderPlus className="h-3.5 w-3.5 mr-1.5" /> Save as Suite
                  </Button>
                )}
              </div>
            </div>

            {/* Stats bar */}
            {(() => {
              const st = suiteStats(activeSuite)
              return (
                <div className="px-6 py-3 border-b flex items-center gap-6 bg-muted/30">
                  {[
                    { icon: TestTube, label: 'Total', value: st.total, color: 'text-foreground' },
                    { icon: Cpu, label: 'Automated', value: st.automated, color: 'text-violet-500' },
                    { icon: CheckCircle2, label: 'Passed', value: st.passed, color: 'text-emerald-500' },
                    { icon: XCircle, label: 'Failed', value: st.failed, color: 'text-red-500' },
                  ].map(stat => {
                    const Icon = stat.icon
                    return (
                      <div key={stat.label} className="flex items-center gap-2">
                        <Icon className={`h-3.5 w-3.5 ${stat.color}`} />
                        <span className={`text-sm font-semibold ${stat.color}`}>{stat.value}</span>
                        <span className="text-xs text-muted-foreground">{stat.label}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* Test case list */}
            <div className="flex-1 overflow-y-auto">
              {filteredCases.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">No test cases in this suite</p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredCases.map(tc => {
                    const result = runResults[tc.id]
                    const isRunning = runningIds.has(tc.id)
                    const hasCode = !!tc.customFields?.dartCode

                    return (
                      <div key={tc.id} className="flex items-center gap-4 px-6 py-3 hover:bg-muted/30 transition-colors">
                        {/* Icon */}
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                          isRunning ? 'bg-blue-500/10' :
                          result?.success ? 'bg-emerald-500/10' :
                          result ? 'bg-red-500/10' : 'bg-muted'
                        }`}>
                          {isRunning
                            ? <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />
                            : result?.success
                            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            : result
                            ? <XCircle className="h-3.5 w-3.5 text-red-500" />
                            : <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                        </div>

                        {/* Title + description */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{tc.title}</span>
                            {hasCode && (
                              <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">auto</Badge>
                            )}
                          </div>
                          {tc.description && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{tc.description}</p>
                          )}
                        </div>

                        {/* Priority + Type */}
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge className={`text-[10px] px-1.5 py-0 border ${PRIORITY_COLOR[tc.priority] || PRIORITY_COLOR.low}`}>
                            {tc.priority}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {tc.automationType}
                          </Badge>
                        </div>

                        {/* Duration */}
                        {result && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                            <Clock className="h-3 w-3" />
                            {fmt(result.duration)}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {result && (
                            <button
                              onClick={() => setShowOutput({ title: tc.title, result })}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {hasCode && (
                            <button
                              onClick={() => handleRunCase(tc)}
                              disabled={isRunning}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                            >
                              {isRunning
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Play className="h-3 w-3" />}
                              {isRunning ? 'Running' : 'Run'}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* ── Create Suite Modal ─────────────────────────────────────────── */}
      {creating && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setCreating(false)}>
          <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold text-sm">Create Test Suite</h2>
              <button onClick={() => setCreating(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Suite Name <span className="text-red-500">*</span></Label>
                <Input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Login Flow"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Input
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="What does this suite cover?"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Assign Test Cases</Label>
                  <span className="text-xs text-muted-foreground">{selectedIds.length} selected</span>
                </div>
                <div className="relative mb-1.5">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none"
                    placeholder="Search..."
                    value={caseSearch}
                    onChange={e => setCaseSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-44 overflow-y-auto rounded-md border divide-y">
                  {testCases
                    .filter(tc => !caseSearch || tc.title.toLowerCase().includes(caseSearch.toLowerCase()))
                    .map(tc => (
                      <label key={tc.id} className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selectedIds.includes(tc.id)}
                          onChange={e => setSelectedIds(p => e.target.checked ? [...p, tc.id] : p.filter(id => id !== tc.id))}
                        />
                        <span className="truncate">{tc.title}</span>
                        {tc.customFields?.dartCode && <Cpu className="h-3 w-3 text-violet-500 shrink-0" />}
                      </label>
                    ))}
                  {testCases.length === 0 && (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground">No test cases yet</div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-muted/20">
              <Button variant="outline" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreateSuite} disabled={!newName.trim()}>
                <FolderPlus className="h-3.5 w-3.5 mr-1.5" /> Create Suite
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Output Modal ───────────────────────────────────────────────── */}
      {showOutput && (
        <OutputModal
          title={showOutput.title}
          result={showOutput.result}
          onClose={() => setShowOutput(null)}
        />
      )}
    </div>
  )
}

export default TestSuites
