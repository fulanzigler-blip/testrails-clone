import { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { fetchTestCases } from '../store/slices/testCasesSlice'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import {
  FolderOpen, ChevronDown, ChevronRight, Play, CheckCircle2, XCircle,
  Loader2, FolderPlus, TestTube, Eye, X
} from 'lucide-react'
import { api } from '../lib/api'

interface TestCase {
  id: string
  title: string
  description: string
  steps: any[]
  priority: string
  automationType: string
  status: string
  tags: string[]
  customFields?: { dartCode?: string }
  updatedAt: string
}

interface TestSuite {
  id: string
  name: string
  description: string
  testCases: TestCase[]
  isOpen: boolean
}

function getPriorityColor(p: string) {
  switch (p) {
    case 'critical': return 'bg-red-500 text-white'
    case 'high': return 'bg-orange-500 text-white'
    case 'medium': return 'bg-yellow-500 text-black'
    default: return 'bg-green-500 text-white'
  }
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function autoGroupTestCases(testCases: TestCase[]): TestSuite[] {
  if (testCases.length === 0) return []
  const groups: Map<string, TestCase[]> = new Map()
  const ungrouped: TestCase[] = []
  for (const tc of testCases) {
    const words = tc.title.split(' ')
    let prefix = ''
    if (words.length >= 3) prefix = words.slice(0, 3).join(' ')
    else if (words.length >= 2) prefix = words.slice(0, 2).join(' ')
    else prefix = words[0]
    const matching = testCases.filter(t => t.title.startsWith(prefix))
    if (matching.length >= 2) {
      if (!groups.has(prefix)) groups.set(prefix, [])
      if (!groups.get(prefix)!.find(t => t.id === tc.id)) groups.get(prefix)!.push(tc)
    } else {
      if (!ungrouped.find(t => t.id === tc.id)) ungrouped.push(tc)
    }
  }
  const suites: TestSuite[] = []
  for (const [name, cases] of groups) {
    suites.push({ id: 'auto_' + name.replace(/\s+/g, '_'), name, description: `Auto-grouped: ${cases.length} test cases`, testCases: cases, isOpen: true })
  }
  if (ungrouped.length > 0) {
    suites.push({ id: 'ungrouped', name: 'Ungrouped', description: `${ungrouped.length} test case(s) without a group`, testCases: ungrouped, isOpen: true })
  }
  return suites
}

const TestSuites: React.FC = () => {
  const dispatch = useAppDispatch()
  const { testCases } = useAppSelector((state) => state.testCases)
  const [suites, setSuites] = useState<TestSuite[]>([])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newSuiteName, setNewSuiteName] = useState('')
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([])
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())
  const [runResults, setRunResults] = useState<Record<string, { success: boolean; duration: number; output: string }>>({})
  const [showOutput, setShowOutput] = useState<{ title: string; success: boolean; duration: number; output: string } | null>(null)

  useEffect(() => { dispatch(fetchTestCases({ page: 1, perPage: 200 })) }, [dispatch])
  useEffect(() => { setSuites(autoGroupTestCases(testCases)) }, [testCases])

  const toggleSuite = (id: string) => setSuites(prev => prev.map(s => s.id === id ? { ...s, isOpen: !s.isOpen } : s))

  const handleRunTestCase = async (testCaseId: string) => {
    if (runningIds.has(testCaseId)) return
    setRunningIds(prev => new Set([...prev, testCaseId]))
    setRunResults(prev => { const n = { ...prev }; delete n[testCaseId]; return n })
    try {
      const resp = await api.post(`/integration-tests/run-testcase/${testCaseId}`)
      const data = resp.data?.data
      setRunResults(prev => ({ ...prev, [testCaseId]: { success: data?.success ?? false, duration: data?.duration ?? 0, output: data?.output || '' } }))
    } catch (err: any) {
      setRunResults(prev => ({ ...prev, [testCaseId]: { success: false, duration: 0, output: err.response?.data?.error?.message || err.message || 'Run failed' } }))
    } finally {
      setRunningIds(prev => { const n = new Set(prev); n.delete(testCaseId); return n })
    }
  }

  const handleCreateSuite = () => {
    if (!newSuiteName.trim()) return
    const newSuite: TestSuite = { id: 'manual_' + Date.now(), name: newSuiteName.trim(), description: `${selectedCaseIds.length} test case(s)`, testCases: testCases.filter(tc => selectedCaseIds.includes(tc.id)), isOpen: true }
    setSuites(prev => [newSuite, ...prev])
    setNewSuiteName('')
    setSelectedCaseIds([])
    setIsCreateModalOpen(false)
  }

  const totalCases = testCases.length
  const passedCount = Object.values(runResults).filter(r => r.success).length
  const failedCount = Object.values(runResults).filter(r => !r.success).length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Test Suites</h1>
          <p className="text-muted-foreground">Group and organize test cases</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm">{totalCases} test cases</Badge>
          {passedCount > 0 && <Badge className="bg-green-100 text-green-800">✓ {passedCount} passed</Badge>}
          {failedCount > 0 && <Badge className="bg-red-100 text-red-800">✗ {failedCount} failed</Badge>}
          <Button onClick={() => setIsCreateModalOpen(true)}><FolderPlus className="w-4 h-4 mr-2" /> New Suite</Button>
        </div>
      </div>

      {suites.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground"><FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No test cases yet. Create test cases first.</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {suites.map(suite => {
            const suiteCases = suite.testCases
            const passedInSuite = suiteCases.filter(tc => runResults[tc.id]?.success).length
            const failedInSuite = suiteCases.filter(tc => runResults[tc.id] && !runResults[tc.id]?.success).length
            const runningInSuite = suiteCases.filter(tc => runningIds.has(tc.id)).length
            return (
              <Card key={suite.id} className="overflow-hidden">
                <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50" onClick={() => toggleSuite(suite.id)}>
                  <div className="flex items-center gap-3">
                    {suite.isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    <FolderOpen className="w-5 h-5 text-blue-500" />
                    <div><div className="font-medium">{suite.name}</div><div className="text-sm text-muted-foreground">{suite.description}</div></div>
                  </div>
                  <div className="flex items-center gap-4">
                    {runningInSuite > 0 && <Badge className="bg-blue-100 text-blue-800"><Loader2 className="w-3 h-3 mr-1 animate-spin" />{runningInSuite}</Badge>}
                    {passedInSuite > 0 && <Badge className="bg-green-100 text-green-800">✓ {passedInSuite}</Badge>}
                    {failedInSuite > 0 && <Badge className="bg-red-100 text-red-800">✗ {failedInSuite}</Badge>}
                    <Badge variant="outline">{suiteCases.length} cases</Badge>
                  </div>
                </div>
                {suite.isOpen && suiteCases.length > 0 && (
                  <div className="border-t">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Test Case</th>
                          <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Priority</th>
                          <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Type</th>
                          <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Result</th>
                          <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suiteCases.map(tc => {
                          const result = runResults[tc.id]
                          const isRunning = runningIds.has(tc.id)
                          const hasCode = !!tc.customFields?.dartCode
                          return (
                            <tr key={tc.id} className="border-t hover:bg-muted/30">
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-2">{hasCode && <TestTube className="w-3 h-3 text-purple-500" />}<div className="font-medium text-sm">{tc.title}</div></div>
                                {tc.description && <div className="text-xs text-muted-foreground mt-0.5">{tc.description}</div>}
                              </td>
                              <td className="px-4 py-2"><Badge className={`${getPriorityColor(tc.priority)} text-[10px] px-1.5 py-0 h-4`}>{tc.priority}</Badge></td>
                              <td className="px-4 py-2"><Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{tc.automationType}</Badge></td>
                              <td className="px-4 py-2">
                                {isRunning ? <Badge className="bg-blue-100 text-blue-800"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running</Badge> : result ? (
                                  <div className="flex items-center gap-1">
                                    {result.success ? <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3 mr-1" />PASSED</Badge> : <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />FAILED</Badge>}
                                    <span className="text-xs text-muted-foreground">{formatDuration(result.duration)}</span>
                                  </div>
                                ) : <span className="text-xs text-muted-foreground">—</span>}
                              </td>
                              <td className="px-4 py-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {hasCode && <Button variant="ghost" size="sm" onClick={() => handleRunTestCase(tc.id)} disabled={isRunning} className="h-7 px-2 text-green-600 hover:text-green-700">{isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}</Button>}
                                  {result && <Button variant="ghost" size="sm" onClick={() => setShowOutput({ title: tc.title, success: result.success, duration: result.duration, output: result.output })} className="h-7 px-2"><Eye className="h-3.5 w-3.5" /></Button>}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Create Suite Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setIsCreateModalOpen(false)}>
          <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Create Test Suite</h2>
              <Button variant="ghost" size="sm" onClick={() => setIsCreateModalOpen(false)}><X className="w-4 h-4" /></Button>
            </div>
            <div className="space-y-4">
              <div><Label>Suite Name</Label><Input value={newSuiteName} onChange={e => setNewSuiteName(e.target.value)} placeholder="e.g. Login Flow" /></div>
              <div>
                <Label>Assign Test Cases</Label>
                <div className="max-h-40 overflow-y-auto space-y-1 border rounded p-2 mt-1">
                  {testCases.map(tc => (
                    <label key={tc.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedCaseIds.includes(tc.id)} onChange={e => setSelectedCaseIds(prev => e.target.checked ? [...prev, tc.id] : prev.filter(id => id !== tc.id))} className="rounded" />{tc.title}</label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button><Button onClick={handleCreateSuite} disabled={!newSuiteName.trim()}>Create</Button></div>
            </div>
          </div>
        </div>
      )}

      {/* Output Modal */}
      {showOutput && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowOutput(null)}>
          <div className="bg-background rounded-lg shadow-lg w-full max-w-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Run Output: {showOutput.title}</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowOutput(null)}><X className="w-4 h-4" /></Button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {showOutput.success ? <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3 mr-1" />PASSED</Badge> : <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />FAILED</Badge>}
                <span className="text-xs text-muted-foreground">{formatDuration(showOutput.duration)}</span>
              </div>
              {showOutput.output && <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono max-h-[400px] overflow-y-auto whitespace-pre-wrap break-all">{showOutput.output}</pre>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TestSuites
