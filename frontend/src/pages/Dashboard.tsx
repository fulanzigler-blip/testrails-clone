import React, { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { fetchTestRuns, fetchTestCases } from '../store/slices/testRunsSlice'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { TrendingUp, Activity, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'

const Dashboard: React.FC = () => {
  const dispatch = useAppDispatch()
  const { testRuns, loading } = useAppSelector((state) => state.testRuns)

  useEffect(() => {
    dispatch(fetchTestRuns())
  }, [dispatch])

  // Calculate statistics
  const totalRuns = testRuns.length
  const completedRuns = testRuns.filter((r) => r.status === 'completed').length
  const runningRuns = testRuns.filter((r) => r.status === 'running').length
  const totalTests = testRuns.reduce((sum, run) => sum + run.total_tests, 0)
  const totalPassed = testRuns.reduce((sum, run) => sum + run.passed_count, 0)
  const totalFailed = testRuns.reduce((sum, run) => sum + run.failed_count, 0)
  const totalSkipped = testRuns.reduce((sum, run) => sum + run.skipped_count, 0)
  const averagePassRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0

  // Chart data
  const passFailData = [
    { name: 'Passed', value: totalPassed, color: '#10b981' },
    { name: 'Failed', value: totalFailed, color: '#ef4444' },
    { name: 'Skipped', value: totalSkipped, color: '#f59e0b' },
  ]

  const trendData = testRuns.slice(-7).map((run) => ({
    name: new Date(run.created_at).toLocaleDateString(),
    passRate: run.pass_rate,
    total: run.total_tests,
  }))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Test execution overview and statistics</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Test Runs</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRuns}</div>
            <p className="text-xs text-muted-foreground">{runningRuns} currently running</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Pass Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{averagePassRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">+2.5% from last week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tests</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTests}</div>
            <p className="text-xs text-muted-foreground">{totalPassed} passed, {totalFailed} failed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Runs</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedRuns}</div>
            <p className="text-xs text-muted-foreground">Out of {totalRuns} total runs</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Test Results Distribution</CardTitle>
            <CardDescription>Overview of test execution results</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={passFailData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {passFailData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pass Rate Trend</CardTitle>
            <CardDescription>Test execution trends over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="passRate" stroke="#10b981" name="Pass Rate %" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Test Runs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Test Runs</CardTitle>
          <CardDescription>Latest test executions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {testRuns.slice(0, 5).map((run) => (
              <div key={run.id} className="flex items-center justify-between border-b pb-4">
                <div>
                  <div className="font-medium">{run.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {run.total_tests} tests · {run.pass_rate.toFixed(1)}% pass rate
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm">{run.passed_count}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm">{run.failed_count}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm">{run.skipped_count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default Dashboard
