import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { api } from '../../lib/api'

interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  role: 'admin' | 'manager' | 'tester' | 'viewer'
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  loading: boolean
  error: string | null
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  // Start as loading if a valid token exists — prevents flash-redirect to login on refresh
  loading: !!localStorage.getItem('access_token') && localStorage.getItem('access_token') !== 'undefined',
  error: null,
}

export const login = createAsyncThunk(
  'auth/login',
  async (credentials: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/login', credentials)
      const { accessToken, access_token, refreshToken, refresh_token, user } = response.data.data
      localStorage.setItem('access_token', accessToken || access_token)
      if (refreshToken || refresh_token) {
        localStorage.setItem('refresh_token', refreshToken || refresh_token)
      }
      return user
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.error?.message || 'Invalid email or password')
    }
  }
)

export const logout = createAsyncThunk('auth/logout', async () => {
  await api.post('/auth/logout')
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
})

export const getCurrentUser = createAsyncThunk('auth/getCurrentUser', async () => {
  const response = await api.get('/auth/me')
  return response.data.data
})

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload
        state.isAuthenticated = true
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false
        state.error = (action.payload as string) || action.error.message || 'Login failed'
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null
        state.isAuthenticated = false
      })
      .addCase(getCurrentUser.pending, (state) => {
        state.loading = true
      })
      .addCase(getCurrentUser.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload
        state.isAuthenticated = true
      })
      .addCase(getCurrentUser.rejected, (state) => {
        state.loading = false
        state.isAuthenticated = false
        localStorage.removeItem('access_token')
      })
  },
})

export const { clearError } = authSlice.actions
export default authSlice.reducer
