import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { FileDown, Calendar, TrendingUp, TrendingDown } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { fetchReportSummary } from '../store/slices/reportsSlice'
import api from '../lib/api'

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899']

const Reports: React.FC = () => {
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  })
  const [exportingFormat, setExportingFormat] = useState<string | null>(null)

  const dispatch = useAppDispatch()
  const { summary, loading } = useAppSelector((state) => state.reports)

  useEffect(() => {
    dispatch(fetchReportSummary({ fromDate: dateRange.from, toDate: dateRange.to }))
  }, [dispatch, dateRange])

  const trendChartData =
    summary?.trendData.map((d) => ({
      name: d.date,
      passed: d.passed,
      failed: d.failed,
    })) ?? []

  const passFailDistribution = [
    {
      name: 'Passed',
      value: Math.round((summary?.totalTestsExecuted ?? 0) * ((summary?.passRate ?? 0) / 100)),
      color: '#10b981',
    },
    {
      name: 'Failed',
      value: Math.round((summary?.totalTestsExecuted ?? 0) * ((summary?.failRate ?? 0) / 100)),
      color: '#ef4444',
    },
  ]

  const topFailures =
    summary?.topFailures.map((f) => ({
      test_case_title: f.title,
      failure_count: f.failCount,
      percentage: f.failCount,
    })) ?? []

  const handleExport = async (format: string) => {
    try {
      setExportingFormat(format)
      const response = await api.get(`/reports/export?format=${format}`, {
        responseType: 'blob',
      })
      const ext = format === 'excel' ? 'xlsx' : format
      const url = URL.createObjectURL(response.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report-${dateRange.from}-${dateRange.to}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      console.error('Export failed')
    } finally {
      setExportingFormat(null)
    }
  }

  const handleDateChange = (field: 'from' | 'to', value: string) => {
    setDateRange((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">Test execution analytics and insights</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleExport('csv')} disabled={exportingFormat !== null}>
            <FileDown className="mr-2 h-4 w-4" />
            {exportingFormat === 'csv' ? 'Exporting...' : 'CSV'}
          </Button>
          <Button variant="outline" onClick={() => handleExport('excel')} disabled={exportingFormat !== null}>
            <FileDown className="mr-2 h-4 w-4" />
            {exportingFormat === 'excel' ? 'Exporting...' : 'Excel'}
          </Button>
          <Button variant="outline" onClick={() => handleExport('pdf')} disabled={exportingFormat !== null}>
            <FileDown className="mr-2 h-4 w-4" />
            {exportingFormat === 'pdf' ? 'Exporting...' : 'PDF'}
          </Button>
        </div>
      </div>

      {/* Date Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <Label htmlFor="from_date">From Date</Label>
              <Input
                id="from_date"
                type="date"
                value={dateRange.from}
                onChange={(e) => handleDateChange('from', e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="to_date">To Date</Label>
              <Input
                id="to_date"
                type="date"
                value={dateRange.to}
                onChange={(e) => handleDateChange('to', e.target.value)}
              />
            </div>
            <Button>
              <Calendar className="mr-2 h-4 w-4" />
              Apply Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Test Runs</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalTestRuns ?? 0}</div>
            <p className="text-xs text-muted-foreground">+12% from previous period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tests Executed</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalTestsExecuted ?? 0}</div>
            <p className="text-xs text-muted-foreground">+8% from previous period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Pass Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(summary?.passRate ?? 0).toFixed(1)}%</div>
            <p className="text-xs text-green-500">+2.3% from previous period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.activeProjects ?? 0}</div>
            <p className="text-xs text-muted-foreground">No change</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pass Rate Trend</CardTitle>
            <CardDescription>Test execution pass/fail over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="passed" stroke="#10b981" name="Passed" />
                <Line type="monotone" dataKey="failed" stroke="#ef4444" name="Failed" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pass/Fail Distribution</CardTitle>
            <CardDescription>Overall test results breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={passFailDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {passFailDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Test Runs by Status</CardTitle>
            <CardDescription>Distribution of test runs across statuses</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={summary?.testRunsByStatus ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" />
                <YAxis />
                <Tooltip />
                <Legend />
                {(summary?.testRunsByStatus ?? []).map((_, index) => (
                  <Bar key={index} dataKey="count" fill={COLORS[index % COLORS.length]} name="Count" />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekly Comparison</CardTitle>
            <CardDescription>Compare performance across weeks</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={[]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis yAxisId="left" orientation="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="passRate" fill="#10b981" name="Pass Rate %" />
                <Bar yAxisId="right" dataKey="testsExecuted" fill="#3b82f6" name="Tests Executed" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Failures */}
      <Card>
        <CardHeader>
          <CardTitle>Top Test Failures</CardTitle>
          <CardDescription>Most frequently failing test cases</CardDescription>
        </CardHeader>
        <CardContent>
          {topFailures.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-muted-foreground">
              No failure data available for the selected period.
            </div>
          ) : (
            <div className="space-y-4">
              {topFailures.map((failure, index) => (
                <div key={index} className="flex items-center justify-between border-b pb-3 last:border-0">
                  <div className="flex items-center gap-4">
                    <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-semibold">
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-medium">{failure.test_case_title}</div>
                      <div className="text-sm text-muted-foreground">
                        {failure.failure_count} failures
                      </div>
                    </div>
                  </div>
                  <div className="w-32">
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-red-500 h-2 rounded-full"
                        style={{
                          width: `${Math.min(
                            (failure.percentage /
                              Math.max(...topFailures.map((f) => f.percentage), 1)) *
                              100,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default Reports
