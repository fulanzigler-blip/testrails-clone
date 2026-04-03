import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { api } from '../../lib/api'

export interface ReportSummary {
  totalTestRuns: number
  totalTestCases: number
  totalTestsExecuted: number
  passRate: number
  failRate: number
  activeProjects: number
  testRunsByStatus: { status: string; count: number }[]
  trendData: { date: string; passed: number; failed: number }[]
  topFailures: { testCaseId: string; title: string; failCount: number }[]
}

interface ReportsState {
  summary: ReportSummary | null
  loading: boolean
  error: string | null
}

const initialState: ReportsState = {
  summary: null,
  loading: false,
  error: null,
}

export const fetchReportSummary = createAsyncThunk<
  ReportSummary,
  { projectId?: string; fromDate?: string; toDate?: string } | undefined,
  { rejectValue: string }
>('reports/fetchReportSummary', async (params, { rejectWithValue }) => {
  try {
    const response = await api.get('/reports/summary', { params })
    return response.data.data
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } }; message?: string }
    const message =
      err.response?.data?.message ||
      err.message ||
      'Failed to fetch report summary'
    return rejectWithValue(message)
  }
})

const reportsSlice = createSlice({
  name: 'reports',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchReportSummary.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchReportSummary.fulfilled, (state, action) => {
        state.loading = false
        state.summary = action.payload
      })
      .addCase(fetchReportSummary.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload ?? 'Failed to fetch report summary'
      })
  },
})

export default reportsSlice.reducer
