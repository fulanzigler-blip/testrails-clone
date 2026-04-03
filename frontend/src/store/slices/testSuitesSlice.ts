import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { api } from '../../lib/api'

export interface TestSuite {
  id: string
  name: string
  description: string | null
  projectId: string
  parentSuiteId: string | null
  createdAt: string
  updatedAt: string
}

interface TestSuitesState {
  suites: TestSuite[]
  loading: boolean
  error: string | null
  total: number
}

const initialState: TestSuitesState = {
  suites: [],
  loading: false,
  error: null,
  total: 0,
}

export const fetchTestSuites = createAsyncThunk(
  'testSuites/fetchTestSuites',
  async (
    params?: {
      projectId?: string
      search?: string
      page?: number
      perPage?: number
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await api.get('/test-suites', { params })
      return response.data
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      return rejectWithValue(
        err.response?.data?.message || 'Failed to fetch test suites'
      )
    }
  }
)

export const createTestSuite = createAsyncThunk(
  'testSuites/createTestSuite',
  async (
    data: {
      name: string
      description?: string
      projectId: string
      parentSuiteId?: string
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await api.post('/test-suites', data)
      return response.data
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      return rejectWithValue(
        err.response?.data?.message || 'Failed to create test suite'
      )
    }
  }
)

export const updateTestSuite = createAsyncThunk(
  'testSuites/updateTestSuite',
  async (
    {
      id,
      ...data
    }: {
      id: string
      name?: string
      description?: string
      parentSuiteId?: string
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await api.put(`/test-suites/${id}`, data)
      return response.data
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      return rejectWithValue(
        err.response?.data?.message || 'Failed to update test suite'
      )
    }
  }
)

export const deleteTestSuite = createAsyncThunk(
  'testSuites/deleteTestSuite',
  async (id: string, { rejectWithValue }) => {
    try {
      await api.delete(`/test-suites/${id}`)
      return id
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      return rejectWithValue(
        err.response?.data?.message || 'Failed to delete test suite'
      )
    }
  }
)

const testSuitesSlice = createSlice({
  name: 'testSuites',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchTestSuites.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchTestSuites.fulfilled, (state, action) => {
        state.loading = false
        state.suites = action.payload.data
        state.total = action.payload.meta?.total ?? 0
      })
      .addCase(fetchTestSuites.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })
      .addCase(createTestSuite.fulfilled, (state, action) => {
        state.suites.push(action.payload.data)
      })
      .addCase(updateTestSuite.fulfilled, (state, action) => {
        const index = state.suites.findIndex(
          (suite) => suite.id === action.payload.data.id
        )
        if (index !== -1) {
          state.suites[index] = action.payload.data
        }
      })
      .addCase(deleteTestSuite.fulfilled, (state, action) => {
        state.suites = state.suites.filter(
          (suite) => suite.id !== action.payload
        )
      })
  },
})

export default testSuitesSlice.reducer
