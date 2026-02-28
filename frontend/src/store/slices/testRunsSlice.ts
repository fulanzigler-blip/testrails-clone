import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../lib/api'

interface TestResult {
  id: string
  test_case_id: string
  test_case_title: string
  status: 'passed' | 'failed' | 'skipped' | 'blocked'
  executed_by: { id: string; name: string }
  executed_at: string
  duration_ms: number
  comment: string
}

interface TestRun {
  id: string
  name: string
  description: string
  project_id: string
  suite_id: string
  created_by: { id: string; name: string }
  status: 'pending' | 'running' | 'completed' | 'failed'
  started_at: string | null
  completed_at: string | null
  passed_count: number
  failed_count: number
  skipped_count: number
  blocked_count: number
  total_tests: number
  pass_rate: number
  environment: string
  created_at: string
  results?: TestResult[]
}

interface TestRunsState {
  testRuns: TestRun[]
  currentRun: TestRun | null
  loading: boolean
  error: string | null
}

const initialState: TestRunsState = {
  testRuns: [],
  currentRun: null,
  loading: false,
  error: null,
}

export const fetchTestRuns = createAsyncThunk(
  'testRuns/fetchTestRuns',
  async (params?: {
    project_id?: string
    suite_id?: string
    status?: string
    page?: number
  }) => {
    const response = await api.get('/test-runs', { params })
    return response.data.data
  }
)

export const fetchTestRun = createAsyncThunk(
  'testRuns/fetchTestRun',
  async (id: string) => {
    const response = await api.get(`/test-runs/${id}`)
    return response.data.data
  }
)

export const createTestRun = createAsyncThunk(
  'testRuns/createTestRun',
  async (data: Partial<TestRun>) => {
    const response = await api.post('/test-runs', data)
    return response.data.data
  }
)

export const startTestRun = createAsyncThunk(
  'testRuns/startTestRun',
  async (id: string) => {
    const response = await api.post(`/test-runs/${id}/start`)
    return response.data.data
  }
)

export const completeTestRun = createAsyncThunk(
  'testRuns/completeTestRun',
  async (id: string) => {
    const response = await api.post(`/test-runs/${id}/complete`)
    return response.data.data
  }
)

export const deleteTestRun = createAsyncThunk(
  'testRuns/deleteTestRun',
  async (id: string) => {
    await api.delete(`/test-runs/${id}`)
    return id
  }
)

export const updateTestResult = createAsyncThunk(
  'testRuns/updateTestResult',
  async ({ id, ...data }: { id: string; status: string; comment?: string }) => {
    const response = await api.put(`/test-results/${id}`, data)
    return response.data.data
  }
)

const testRunsSlice = createSlice({
  name: 'testRuns',
  initialState,
  reducers: {
    clearCurrentRun: (state) => {
      state.currentRun = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTestRuns.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchTestRuns.fulfilled, (state, action) => {
        state.loading = false
        state.testRuns = action.payload
      })
      .addCase(fetchTestRuns.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch test runs'
      })
      .addCase(fetchTestRun.fulfilled, (state, action) => {
        state.currentRun = action.payload
      })
      .addCase(createTestRun.fulfilled, (state, action) => {
        state.testRuns.push(action.payload)
      })
      .addCase(startTestRun.fulfilled, (state, action) => {
        const index = state.testRuns.findIndex((tr) => tr.id === action.payload.id)
        if (index !== -1) {
          state.testRuns[index] = action.payload
        }
        if (state.currentRun?.id === action.payload.id) {
          state.currentRun = action.payload
        }
      })
      .addCase(completeTestRun.fulfilled, (state, action) => {
        const index = state.testRuns.findIndex((tr) => tr.id === action.payload.id)
        if (index !== -1) {
          state.testRuns[index] = action.payload
        }
        if (state.currentRun?.id === action.payload.id) {
          state.currentRun = action.payload
        }
      })
      .addCase(deleteTestRun.fulfilled, (state, action) => {
        state.testRuns = state.testRuns.filter((tr) => tr.id !== action.payload)
        if (state.currentRun?.id === action.payload) {
          state.currentRun = null
        }
      })
      .addCase(updateTestResult.fulfilled, (state, action) => {
        if (state.currentRun?.results) {
          const index = state.currentRun.results.findIndex(
            (r) => r.id === action.payload.id
          )
          if (index !== -1) {
            state.currentRun.results[index] = action.payload
          }
        }
      })
  },
})

export const { clearCurrentRun } = testRunsSlice.actions
export default testRunsSlice.reducer
