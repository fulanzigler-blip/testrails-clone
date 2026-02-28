import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../lib/api'

interface TestStep {
  order: number
  description: string
  expected: string
}

interface TestCase {
  id: string
  title: string
  description: string
  steps: TestStep[]
  expected_result: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  automation_type: 'manual' | 'automated'
  suite_id: string
  created_by: string
  version: number
  status: 'draft' | 'active' | 'archived'
  tags: string[]
  created_at: string
  updated_at: string
}

interface TestCasesState {
  testCases: TestCase[]
  loading: boolean
  error: string | null
  filters: {
    suite_id?: string
    status?: string
    priority?: string
    search?: string
  }
}

const initialState: TestCasesState = {
  testCases: [],
  loading: false,
  error: null,
  filters: {},
}

export const fetchTestCases = createAsyncThunk(
  'testCases/fetchTestCases',
  async (params?: {
    suite_id?: string
    status?: string
    priority?: string
    search?: string
    page?: number
    per_page?: number
  }) => {
    const response = await api.get('/test-cases', { params })
    return response.data.data
  }
)

export const createTestCase = createAsyncThunk(
  'testCases/createTestCase',
  async (data: Partial<TestCase>) => {
    const response = await api.post('/test-cases', data)
    return response.data.data
  }
)

export const updateTestCase = createAsyncThunk(
  'testCases/updateTestCase',
  async ({ id, ...data }: { id: string } & Partial<TestCase>) => {
    const response = await api.put(`/test-cases/${id}`, data)
    return response.data.data
  }
)

export const deleteTestCase = createAsyncThunk(
  'testCases/deleteTestCase',
  async (id: string) => {
    await api.delete(`/test-cases/${id}`)
    return id
  }
)

export const cloneTestCase = createAsyncThunk(
  'testCases/cloneTestCase',
  async (id: string) => {
    const response = await api.post(`/test-cases/${id}/clone`)
    return response.data.data
  }
)

const testCasesSlice = createSlice({
  name: 'testCases',
  initialState,
  reducers: {
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTestCases.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchTestCases.fulfilled, (state, action) => {
        state.loading = false
        state.testCases = action.payload
      })
      .addCase(fetchTestCases.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch test cases'
      })
      .addCase(createTestCase.fulfilled, (state, action) => {
        state.testCases.push(action.payload)
      })
      .addCase(updateTestCase.fulfilled, (state, action) => {
        const index = state.testCases.findIndex((tc) => tc.id === action.payload.id)
        if (index !== -1) {
          state.testCases[index] = action.payload
        }
      })
      .addCase(deleteTestCase.fulfilled, (state, action) => {
        state.testCases = state.testCases.filter((tc) => tc.id !== action.payload)
      })
      .addCase(cloneTestCase.fulfilled, (state, action) => {
        state.testCases.push(action.payload)
      })
  },
})

export const { setFilters } = testCasesSlice.actions
export default testCasesSlice.reducer
