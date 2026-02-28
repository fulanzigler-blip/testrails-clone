import React, { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { fetchTestRuns, createTestRun, startTestRun, completeTestRun, deleteTestRun, fetchTestRun, updateTestResult } from '../store/slices/testRunsSlice'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import { Plus, Play, CheckCircle, XCircle, AlertCircle, SkipForward, Clock, Trash2 } from 'lucide-react'

interface TestRunFormData {
  name: string
  description: string
  project_id: string
  suite_id: string
  include_all: boolean
  environment: string
}

const TestRuns: React.FC = () => {
  const dispatch = useAppDispatch()
  const { testRuns, currentRun, loading } = useAppSelector((state) => state.testRuns)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isExecutionModalOpen, setIsExecutionModalOpen] = useState(false)
  const [formData, setFormData] = useState<TestRunFormData>({
    name: '',
    description: '',
    project_id: '',
    suite_id: '',
    include_all: true,
    environment: 'staging'
  })
  const [currentResultIndex, setCurrentResultIndex] = useState(0)

  useEffect(() => {
    dispatch(fetchTestRuns())
  }, [dispatch])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await dispatch(createTestRun(formData))
    setIsCreateModalOpen(false)
    setFormData({
      name: '',
      description: '',
      project_id: '',
      suite_id: '',
      include_all: true,
      environment: 'staging'
    })
  }

  const handleStartExecution = async (runId: string) => {
    await dispatch(fetchTestRun(runId))
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
    if (window.confirm('Are you sure you want to delete this test run?')) {
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

  const currentResult = currentRun?.results?.[currentResultIndex]

  if (loading && testRuns.length === 0) {
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
          <h1 className="text-3xl font-bold tracking-tight">Test Runs</h1>
          <p className="text-muted-foreground">Execute and manage test runs</p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Test Run
        </Button>
      </div>

      {/* Test Runs Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {testRuns.map((run) => (
          <Card key={run.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg">{run.name}</CardTitle>
                  <CardDescription className="mt-1">{run.description}</CardDescription>
                </div>
                <Badge className={getStatusColor(run.status)}>{run.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>{run.passed_count} passed</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span>{run.failed_count} failed</span>
                </div>
                <div className="flex items-center gap-2">
                  <SkipForward className="h-4 w-4 text-yellow-500" />
                  <span>{run.skipped_count} skipped</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-gray-500" />
                  <span>{run.blocked_count} blocked</span>
                </div>
              </div>
              
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">
                    {run.total_tests > 0
                      ? Math.round(((run.passed_count + run.failed_count + run.skipped_count + run.blocked_count) / run.total_tests) * 100)
                      : 0}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{
                      width: `${run.total_tests > 0
                        ? ((run.passed_count + run.failed_count + run.skipped_count + run.blocked_count) / run.total_tests) * 100
                        : 0}%`
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{run.total_tests} tests</span>
                <span>{run.pass_rate.toFixed(1)}% pass rate</span>
              </div>

              <div className="flex gap-2 pt-2">
                {run.status === 'pending' ? (
                  <Button className="flex-1" size="sm" onClick={() => handleStartExecution(run.id)}>
                    <Play className="mr-2 h-4 w-4" />
                    Start
                  </Button>
                ) : run.status === 'running' ? (
                  <Button className="flex-1" size="sm" onClick={() => handleStartExecution(run.id)}>
                    <Play className="mr-2 h-4 w-4" />
                    Continue
                  </Button>
                ) : (
                  <Button className="flex-1" size="sm" variant="outline" onClick={() => handleStartExecution(run.id)}>
                    View Results
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => handleDeleteRun(run.id)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create Test Run Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <Card>
              <CardHeader>
                <CardTitle>New Test Run</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreate} className="space-y-4">
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
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
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
                        {/* Add project options */}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="suite_id">Suite *</Label>
                      <select
                        id="suite_id"
                        value={formData.suite_id}
                        onChange={(e) => setFormData({ ...formData, suite_id: e.target.value })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        required
                      >
                        <option value="">Select Suite</option>
                        {/* Add suite options */}
                      </select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="environment">Environment</Label>
                    <select
                      id="environment"
                      value={formData.environment}
                      onChange={(e) => setFormData({ ...formData, environment: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="staging">Staging</option>
                      <option value="production">Production</option>
                      <option value="dev">Development</option>
                    </select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="include_all"
                      checked={formData.include_all}
                      onChange={(e) => setFormData({ ...formData, include_all: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="include_all">Include all test cases</Label>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">Create Test Run</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Execution Modal */}
      {isExecutionModalOpen && currentRun && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{currentRun.name}</CardTitle>
                    <CardDescription>Executing test cases</CardDescription>
                  </div>
                  {currentRun.status === 'pending' && (
                    <Button onClick={() => handleStartRun(currentRun.id)}>
                      <Play className="mr-2 h-4 w-4" />
                      Start Run
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {currentResult ? (
                  <div className="space-y-6">
                    {/* Progress Bar */}
                    <div className="bg-muted rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Test {currentResultIndex + 1} of {currentRun.results?.length}</span>
                        <span className="text-sm text-muted-foreground">
                          {Math.round((currentResultIndex / (currentRun.results?.length || 1)) * 100)}% complete
                        </span>
                      </div>
                      <div className="w-full bg-muted-foreground/20 rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${(currentResultIndex / (currentRun.results?.length || 1)) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Test Case Details */}
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        {getStatusIcon(currentResult.status)}
                        <div>
                          <h3 className="text-lg font-semibold">{currentResult.test_case_title}</h3>
                          {currentResult.comment && (
                            <p className="text-sm text-muted-foreground mt-1">{currentResult.comment}</p>
                          )}
                        </div>
                      </div>

                      {/* Result Actions */}
                      <div className="grid grid-cols-4 gap-3">
                        <Button
                          variant="outline"
                          className="flex-col h-20"
                          onClick={() => handleUpdateResult(currentResult.id, 'passed', '')}
                        >
                          <CheckCircle className="h-6 w-6 mb-1 text-green-500" />
                          Pass
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-col h-20"
                          onClick={() => handleUpdateResult(currentResult.id, 'failed', '')}
                        >
                          <XCircle className="h-6 w-6 mb-1 text-red-500" />
                          Fail
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-col h-20"
                          onClick={() => handleUpdateResult(currentResult.id, 'skipped', '')}
                        >
                          <SkipForward className="h-6 w-6 mb-1 text-yellow-500" />
                          Skip
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-col h-20"
                          onClick={() => handleUpdateResult(currentResult.id, 'blocked', '')}
                        >
                          <AlertCircle className="h-6 w-6 mb-1 text-gray-500" />
                          Block
                        </Button>
                      </div>

                      {/* Comment Input */}
                      <div>
                        <Label htmlFor="comment">Comment</Label>
                        <textarea
                          id="comment"
                          placeholder="Add a comment about this test result..."
                          className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-lg font-medium mb-4">All tests completed!</p>
                    <Button onClick={() => handleCompleteRun(currentRun.id)}>
                      Complete Test Run
                    </Button>
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

export default TestRuns
