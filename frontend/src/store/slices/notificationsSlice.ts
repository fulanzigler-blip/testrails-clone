import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { api } from '../../lib/api'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  read_at: string | null
  created_at: string
}

interface NotificationsState {
  notifications: Notification[]
  unreadCount: number
  loading: boolean
  error: string | null
}

const initialState: NotificationsState = {
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,
}

export const fetchNotifications = createAsyncThunk(
  'notifications/fetchNotifications',
  async (params?: {
    unread_only?: boolean
    page?: number
  }) => {
    const response = await api.get('/notifications', { params })
    return {
      notifications: response.data.data,
      unreadCount: response.data.meta.unread_count,
    }
  }
)

export const markAsRead = createAsyncThunk(
  'notifications/markAsRead',
  async (id: string) => {
    const response = await api.put(`/notifications/${id}/read`)
    return response.data.data
  }
)

export const markAllAsRead = createAsyncThunk(
  'notifications/markAllAsRead',
  async () => {
    await api.put('/notifications/read-all')
  }
)

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false
        state.notifications = action.payload.notifications
        state.unreadCount = action.payload.unreadCount
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch notifications'
      })
      .addCase(markAsRead.fulfilled, (state, action) => {
        const notification = state.notifications.find((n) => n.id === action.payload.id)
        if (notification) {
          notification.read_at = action.payload.read_at
          state.unreadCount = Math.max(0, state.unreadCount - 1)
        }
      })
      .addCase(markAllAsRead.fulfilled, (state) => {
        state.notifications.forEach((n) => {
          n.read_at = new Date().toISOString()
        })
        state.unreadCount = 0
      })
  },
})

export default notificationsSlice.reducer
