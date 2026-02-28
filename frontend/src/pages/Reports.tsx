import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Download, Calendar, TrendingUp, TrendingDown } from 'lucide-react'

const Reports: React.FC = () => {
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  })

  // Sample data - in production, this would come from the API
  const summaryData = {
    total_test_runs: 45,
    total_test_cases: 150,
    total_tests_executed: 900,
    average_pass_rate: 87.5,
    active_projects: 10,
    top_failures: [
      { test_case_title: 'Payment gateway timeout', failure_count: 15, percentage: 10.5 },
      { test_case_title: 'Login API returns 500', failure_count: 12, percentage: 8.4 },
      { test_case_title: 'Inventory sync fails', failure_count: 10, percentage: 7.0 },
      { test_case_title: 'User profile update', failure_count: 8, percentage: 5.6 },
      { test_case_title: 'Cart calculation error', failure_count: 7, percentage: 4.9 },
    ],
    trend: {
      dates: ['Jan 1', 'Jan 2', 'Jan 3', 'Jan 4', 'Jan 5', 'Jan 6', 'Jan 7'],
      pass_rates: [85, 87, 90, 88, 91, 86, 87.5],
      total_tests: [120, 115, 140, 130, 150, 135, 110],
    }
  }

  const priorityData = [
    { name: 'Critical', passed: 20, failed: 5, total: 25 },
    { name: 'High', passed: 45, failed: 8, total: 53 },
    { name: 'Medium', passed: 80, failed: 12, total: 92 },
    { name: 'Low', passed: 35, failed: 3, total: 38 },
  ]

  const trendComparisonData = [
    { name: 'This Week', passRate: 87.5, testsExecuted: 900 },
    { name: 'Last Week', passRate: 85.2, testsExecuted: 850 },
    { name: '2 Weeks Ago', passRate: 82.1, testsExecuted: 780 },
    { name: '3 Weeks Ago', passRate: 79.8, testsExecuted: 720 },
  ]

  const passFailDistribution = [
    { name: 'Passed', value: summaryData.total_tests_executed * (summaryData.average_pass_rate / 100), color: '#10b981' },
    { name: 'Failed', value: summaryData.total_tests_executed * (1 - summaryData.average_pass_rate / 100), color: '#ef4444' },
  ]

  const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#3b82f6']

  const handleExport = (format: string) => {
    console.log(`Exporting report in ${format} format`)
    // In production, this would call an API endpoint to generate and download the report
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">Test execution analytics and insights</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleExport('csv')}>
            <Download className="mr-2 h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline" onClick={() => handleExport('xlsx')}>
            <Download className="mr-2 h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" onClick={() => handleExport('pdf')}>
            <Download className="mr-2 h-4 w-4" />
            PDF
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
                onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="to_date">To Date</Label>
              <Input
                id="to_date"
                type="date"
                value={dateRange.to}
                onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
              />
            </div>
            <Button>
              <Calendar className="mr-2 h-4 w-4" />
              Apply Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Test Runs</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryData.total_test_runs}</div>
            <p className="text-xs text-muted-foreground">+12% from previous period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tests Executed</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryData.total_tests_executed}</div>
            <p className="text-xs text-muted-foreground">+8% from previous period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Pass Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryData.average_pass_rate}%</div>
            <p className="text-xs text-green-500">+2.3% from previous period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryData.active_projects}</div>
            <p className="text-xs text-muted-foreground">No change</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pass Rate Trend</CardTitle>
            <CardDescription>Test execution pass rate over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={summaryData.trend.dates.map((date, i) => ({
                name: date,
                passRate: summaryData.trend.pass_rates[i],
                total: summaryData.trend.total_tests[i]
              }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="passRate" stroke="#10b981" name="Pass Rate %" />
                <Line type="monotone" dataKey="total" stroke="#3b82f6" name="Total Tests" />
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
            <CardTitle>Results by Priority</CardTitle>
            <CardDescription>Test results grouped by priority level</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={priorityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="passed" fill="#10b981" name="Passed" />
                <Bar dataKey="failed" fill="#ef4444" name="Failed" />
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
              <BarChart data={trendComparisonData}>
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
          <div className="space-y-4">
            {summaryData.top_failures.map((failure, index) => (
              <div key={index} className="flex items-center justify-between border-b pb-3 last:border-0">
                <div className="flex items-center gap-4">
                  <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-semibold">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium">{failure.test_case_title}</div>
                    <div className="text-sm text-muted-foreground">
                      {failure.failure_count} failures ({failure.percentage}%)
                    </div>
                  </div>
                </div>
                <div className="w-32">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Failure rate</span>
                    <span className="font-medium text-red-600">{failure.percentage}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-red-500 h-2 rounded-full"
                      style={{ width: `${failure.percentage}%` }}
                    />
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

export default Reports
