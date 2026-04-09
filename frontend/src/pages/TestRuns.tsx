import { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { fetchTestRuns, createTestRun, startTestRun, completeTestRun, deleteTestRun, fetchTestRun, updateTestResult } from '../store/slices/testRunsSlice'
import { fetchProjects } from '../store/slices/projectsSlice'
import { fetchTestCases } from '../store/slices/testCasesSlice'
import { api } from '../lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import {
  Plus, Play, CheckCircle, XCircle, AlertCircle, SkipForward, Clock,
  Trash2, FolderOpen, ChevronDown, ChevronRight, FolderPlus, Eye,
  ArrowRight, Loader2
} from 'lucide-react'

interface SuiteWithCases {
  id: string
  name: string
  description: string
  projectId: string
  projectName: string
  testCases: any[]
  isExpanded: boolean
}

const TestRuns: React.FC = () => {
  const dispatch = useAppDispatch()
  const { testRuns, currentRun, loading } = useAppSelector((state) => state.testRuns)
  const { projects } = useAppSelector((state) => state.projects)
  const { testCases } = useAppSelector((state) => state.testCases)

  const [suites, setSuites] = useState<SuiteWithCases[]>([])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isExecutionModalOpen, setIsExecutionModalOpen] = useState(false)
  const [runName, setRunName] = useState('')
  const [runEnv, setRunEnv] = useState('staging')
  const [selectedSuite, setSelectedSuite] = useState<SuiteWithCases | null>(null)
  const [currentResultIndex, setCurrentResultIndex] = useState(0)

  useEffect(() => {
    dispatch(fetchTestRuns())
    dispatch(fetchProjects())
    dispatch(fetchTestCases({ perPage: 500 }))
  }, [dispatch])

  // Build suites from test cases grouped by suiteId
  useEffect(() => {
    if (testCases.length === 0) return

    // Group cases by suite
    const grouped: Record<string, any[]> = {}
    const ungrouped: any[] = []

    for (const tc of testCases) {
      const suiteId = (tc as any).suiteId || (tc as any).suite_id
      if (suiteId) {
        if (!grouped[suiteId]) grouped[suiteId] = []
        grouped[suiteId].push(tc)
      } else {
        ungrouped.push(tc)
      }
    }

    // Build suite list
    const suiteList: SuiteWithCases[] = Object.entries(grouped).map(([id, cases]) => ({
      id,
      name: `Suite ${id.slice(0, 8)}`,
      description: `${cases.length} test cases`,
      projectId: '',
      projectName: '',
      testCases: cases,
      isExpanded: false,
    }))

    // Add ungrouped as pseudo-suite
    if (ungrouped.length > 0) {
      suiteList.unshift({
        id: 'ungrouped',
        name: 'Ungrouped Test Cases',
        description: `${ungrouped.length} test cases without a suite`,
        projectId: '',
        projectName: '',
        testCases: ungrouped,
        isExpanded: false,
      })
    }

    // Enrich with project names — use first available project as fallback
    for (const s of suiteList) {
      if (projects.length > 0) {
        s.projectId = projects[0].id
        s.projectName = projects[0].name
      }
    }

    setSuites(suiteList)
  }, [testCases, projects])

  const toggleSuite = (id: string) => {
    setSuites(prev => prev.map(s => s.id === id ? { ...s, isExpanded: !s.isExpanded } : s))
  }

  const handleCreateRunFromSuite = async (suite: SuiteWithCases) => {
    setSelectedSuite(suite)
    setRunName(`${suite.name} - Run ${new Date().toLocaleDateString()}`)
    setRunEnv('staging')
    setIsCreateModalOpen(true)
  }

  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSuite) return

    const caseIds = selectedSuite.testCases.map(tc => tc.id)
    let projectId = selectedSuite.projectId

    // For ungrouped cases, try to find a project from any test case's customFields
    if (!projectId && caseIds.length > 0) {
      // Find any project that has test cases matching these
      const firstCase = selectedSuite.testCases[0]
      if (firstCase) {
        // Use the first available project as fallback
        if (projects.length > 0) {
          projectId = projects[0].id
        }
      }
    }

    if (!projectId) {
      alert('Cannot create run: no project associated. Please assign test cases to a project first.')
      return
    }

    await dispatch(createTestRun({
      name: runName,
      description: `${selectedSuite.testCases.length} test cases from ${selectedSuite.name}`,
      projectId,
      suiteId: selectedSuite.id !== 'ungrouped' ? selectedSuite.id : undefined,
      includeAll: false,
      caseIds,
      environment: runEnv,
    } as any))

    setIsCreateModalOpen(false)
    setSelectedSuite(null)
    dispatch(fetchTestRuns())
  }

  const handleStartExecution = async (runId: string) => {
    await dispatch(fetchTestRun(runId))
    setCurrentResultIndex(0)
    setIsExecutionModalOpen(true)
  }

  const handleStartRun = async (runId: string) => {
    await dispatch(startTestRun(runId))
    await dispatch(fetchTestRun(runId))
  }

  const handleCompleteRun = async (runId: string) => {
    await dispatch(completeTestRun(runId))
    setIsExecutionModalOpen(false)
    dispatch(fetchTestRuns())
  }

  const handleDeleteRun = async (runId: string) => {
    if (window.confirm('Delete this test run?')) {
      await dispatch(deleteTestRun(runId))
    }
  }

  const handleUpdateResult = async (resultId: string, status: string, comment: string) => {
    await dispatch(updateTestResult({ id: resultId, status, comment }))
    if (currentResultIndex < (currentRun?.results?.length || 0) - 1) {
      setCurrentResultIndex(currentResultIndex + 1)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed': return 'bg-green-500'
      case 'failed': return 'bg-red-500'
      case 'skipped': return 'bg-yellow-500'
      case 'blocked': return 'bg-gray-500'
      default: return 'bg-gray-300'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed': return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'failed': return <XCircle className="h-5 w-5 text-red-500" />
      case 'skipped': return <SkipForward className="h-5 w-5 text-yellow-500" />
      case 'blocked': return <AlertCircle className="h-5 w-5 text-gray-500" />
      default: return <Clock className="h-5 w-5 text-gray-400" />
    }
  }

  const getRunStats = (run: any) => {
    const total = run.totalTests ?? run.total_tests ?? 0
    const done = (run.passedCount ?? 0) + (run.failedCount ?? 0) + (run.skippedCount ?? 0) + (run.blockedCount ?? 0)
    const pct = total > 0 ? (done / total) * 100 : 0
    return {
      totalTests: total,
      passedCount: run.passedCount ?? run.passed_count ?? 0,
      failedCount: run.failedCount ?? run.failed_count ?? 0,
      skippedCount: run.skippedCount ?? run.skipped_count ?? 0,
      blockedCount: run.blockedCount ?? run.blocked_count ?? 0,
      progressPct: pct,
      progressRounded: Math.round(pct),
      passRate: run.passRate ?? run.pass_rate ?? 0,
    }
  }

  const currentResult = currentRun?.results?.[currentResultIndex]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Test Runs</h1>
          <p className="text-muted-foreground">Create runs from suites and execute test cases</p>
        </div>
      </div>

      {/* Suites Section - Create Runs From Here */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Test Suites
          </CardTitle>
          <CardDescription>Select a suite to create a new test run</CardDescription>
        </CardHeader>
        <CardContent>
          {suites.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No suites yet. Add test cases to suites first.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {suites.map(suite => (
                <div key={suite.id} className="border rounded-lg">
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleSuite(suite.id)}
                  >
                    <div className="flex items-center gap-3">
                      {suite.isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      <FolderPlus className="w-4 h-4 text-blue-500" />
                      <div>
                        <div className="font-medium text-sm">{suite.name}</div>
                        {suite.projectName && <div className="text-xs text-muted-foreground">{suite.projectName}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">{suite.testCases.length} cases</Badge>
                      <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleCreateRunFromSuite(suite) }}
                        className="h-7 text-xs"
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Run
                      </Button>
                    </div>
                  </div>
                  {suite.isExpanded && (
                    <div className="border-t px-3 py-2">
                      <div className="space-y-1">
                        {suite.testCases.map(tc => (
                          <div key={tc.id} className="flex items-center justify-between py-1 px-2 text-sm">
                            <div className="flex items-center gap-2">
                              {(tc as any).customFields?.dartCode ? (
                                <Badge className="bg-purple-100 text-purple-800 text-[10px] px-1 py-0 h-4">Integration</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">{tc.automation_type || tc.automationType}</Badge>
                              )}
                              <span>{tc.title}</span>
                            </div>
                            <Badge className={`${tc.priority === 'critical' ? 'bg-red-500' : tc.priority === 'high' ? 'bg-orange-500' : tc.priority === 'medium' ? 'bg-yellow-500' : 'bg-green-500'} text-white text-[10px] px-1 py-0 h-4`}>
                              {tc.priority}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Previous Runs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Previous Runs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {testRuns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No test runs yet. Create one from a suite above.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {testRuns.map((run: any) => (
                <Card key={run.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-sm">{run.name}</CardTitle>
                        <CardDescription className="mt-0.5 text-xs">{run.description}</CardDescription>
                      </div>
                      <Badge className={`${getStatusColor(run.status)} text-white text-[10px] px-1.5 py-0 h-4`}>{run.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <span className="text-green-600">{getRunStats(run).passedCount} passed</span>
                      <span className="text-red-600">{getRunStats(run).failedCount} failed</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${getRunStats(run).progressPct}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{getRunStats(run).totalTests} tests</span>
                      <span>{getRunStats(run).passRate.toFixed(0)}% pass</span>
                    </div>
                    <div className="flex gap-1 pt-1">
                      {(run.status === 'pending' || run.status === 'running') ? (
                        <Button className="flex-1" size="sm" onClick={() => handleStartExecution(run.id)}>
                          <Play className="mr-1 h-3 w-3" /> {run.status === 'pending' ? 'Start' : 'Continue'}
                        </Button>
                      ) : (
                        <Button className="flex-1" size="sm" variant="outline" onClick={() => handleStartExecution(run.id)}>
                          <Eye className="mr-1 h-3 w-3" /> Results
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleDeleteRun(run.id)}>
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Run Modal */}
      {isCreateModalOpen && selectedSuite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setIsCreateModalOpen(false)}>
          <div className="bg-background rounded-lg shadow-lg w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Play className="w-4 h-4" />
                Create Test Run
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setIsCreateModalOpen(false)}>✕</Button>
            </div>
            <div className="space-y-4">
              <div className="bg-muted rounded p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{selectedSuite.name}</span>
                  <Badge variant="outline">{selectedSuite.testCases.length} cases</Badge>
                </div>
              </div>
              <form onSubmit={handleCreateRun} className="space-y-4">
                <div>
                  <Label>Run Name</Label>
                  <Input value={runName} onChange={e => setRunName(e.target.value)} required />
                </div>
                <div>
                  <Label>Environment</Label>
                  <select
                    value={runEnv}
                    onChange={e => setRunEnv(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="staging">Staging</option>
                    <option value="production">Production</option>
                    <option value="dev">Development</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
                  <Button type="submit">
                    <Play className="mr-2 h-4 w-4" />
                    Create & Run
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Execution Modal */}
      {isExecutionModalOpen && currentRun && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setIsExecutionModalOpen(false)}>
          <div className="bg-background rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{currentRun.name}</h2>
                  <p className="text-sm text-muted-foreground">{currentRun.description}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setIsExecutionModalOpen(false)}>✕</Button>
              </div>

              {currentRun.status === 'pending' && (
                <Button onClick={() => handleStartRun(currentRun.id)}>
                  <Play className="mr-2 h-4 w-4" />
                  Start Run
                </Button>
              )}

              {currentResult ? (
                <div className="space-y-4">
                  <div className="bg-muted rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Test {currentResultIndex + 1} of {currentRun.results?.length}</span>
                      <span className="text-sm text-muted-foreground">
                        {Math.round((currentResultIndex / (currentRun.results?.length || 1)) * 100)}% complete
                      </span>
                    </div>
                    <div className="w-full bg-muted-foreground/20 rounded-full h-2">
                      <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${(currentResultIndex / (currentRun.results?.length || 1)) * 100}%` }} />
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    {getStatusIcon(currentResult.status)}
                    <div>
                      <h3 className="text-lg font-semibold">{currentResult.test_case_title}</h3>
                      {currentResult.comment && <p className="text-sm text-muted-foreground mt-1">{currentResult.comment}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <Button variant="outline" className="flex-col h-20" onClick={() => handleUpdateResult(currentResult.id, 'passed', '')}>
                      <CheckCircle className="h-6 w-6 mb-1 text-green-500" /> Pass
                    </Button>
                    <Button variant="outline" className="flex-col h-20" onClick={() => handleUpdateResult(currentResult.id, 'failed', '')}>
                      <XCircle className="h-6 w-6 mb-1 text-red-500" /> Fail
                    </Button>
                    <Button variant="outline" className="flex-col h-20" onClick={() => handleUpdateResult(currentResult.id, 'skipped', '')}>
                      <SkipForward className="h-6 w-6 mb-1 text-yellow-500" /> Skip
                    </Button>
                    <Button variant="outline" className="flex-col h-20" onClick={() => handleUpdateResult(currentResult.id, 'blocked', '')}>
                      <AlertCircle className="h-6 w-6 mb-1 text-gray-500" /> Block
                    </Button>
                  </div>

                  <textarea
                    placeholder="Add a comment about this test result..."
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    onBlur={(e) => handleUpdateResult(currentResult.id, currentResult.status, e.target.value)}
                  />
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-lg font-medium mb-4">All tests completed!</p>
                  <Button onClick={() => handleCompleteRun(currentRun.id)}>Complete Test Run</Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TestRuns
