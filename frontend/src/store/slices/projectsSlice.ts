import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../lib/api'

interface Project {
  id: string
  name: string
  description: string
  created_at: string
  test_cases_count: number
  test_runs_count: number
}

interface ProjectsState {
  projects: Project[]
  loading: boolean
  error: string | null
}

const initialState: ProjectsState = {
  projects: [],
  loading: false,
  error: null,
}

export const fetchProjects = createAsyncThunk('projects/fetchProjects', async () => {
  const response = await api.get('/projects')
  return response.data.data
})

export const createProject = createAsyncThunk(
  'projects/createProject',
  async (data: { name: string; description: string }) => {
    const response = await api.post('/projects', data)
    return response.data.data
  }
)

export const updateProject = createAsyncThunk(
  'projects/updateProject',
  async ({ id, ...data }: { id: string; name: string; description: string }) => {
    const response = await api.put(`/projects/${id}`, data)
    return response.data.data
  }
)

export const deleteProject = createAsyncThunk(
  'projects/deleteProject',
  async (id: string) => {
    await api.delete(`/projects/${id}`)
    return id
  }
)

const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjects.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchProjects.fulfilled, (state, action) => {
        state.loading = false
        state.projects = action.payload
      })
      .addCase(fetchProjects.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch projects'
      })
      .addCase(createProject.fulfilled, (state, action) => {
        state.projects.push(action.payload)
      })
      .addCase(updateProject.fulfilled, (state, action) => {
        const index = state.projects.findIndex((p) => p.id === action.payload.id)
        if (index !== -1) {
          state.projects[index] = action.payload
        }
      })
      .addCase(deleteProject.fulfilled, (state, action) => {
        state.projects = state.projects.filter((p) => p.id !== action.payload)
      })
  },
})

export default projectsSlice.reducer
