import React, { useEffect } from 'react'
import { Bell, X } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { markAsRead, markAllAsRead, fetchNotifications } from '../store/slices/notificationsSlice'

interface NotificationsDrawerProps {
  open: boolean
  onClose: () => void
}

const getRelativeTime = (dateString: string): string => {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`

  return date.toLocaleDateString()
}

const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({ open, onClose }) => {
  const dispatch = useAppDispatch()
  const { notifications, loading } = useAppSelector((state) => state.notifications)

  useEffect(() => {
    if (open) {
      dispatch(fetchNotifications())
    }
  }, [open, dispatch])

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-40 backdrop-blur-sm bg-black/20" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 w-96 h-full bg-white shadow-xl flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <span className="font-semibold text-lg">Notifications</span>
          <div className="flex items-center gap-2">
            <button
              className="text-sm text-blue-600 hover:text-blue-800 whitespace-nowrap"
              onClick={() => dispatch(markAllAsRead())}
            >
              Mark all read
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 p-1 rounded-md hover:bg-gray-100"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800"></div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex justify-center items-center h-full text-gray-500 p-4">
              <p>No notifications</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="relative flex items-start gap-3 p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => dispatch(markAsRead(n.id))}
                >
                  {!n.read_at && (
                    <div className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                  )}
                  <div className="flex-shrink-0 mt-0.5">
                    <Bell size={20} className="text-gray-400" />
                  </div>
                  <div className="flex-1 pr-6">
                    <p className="font-medium text-gray-900">{n.title}</p>
                    <p className="text-sm text-gray-600 mt-1">{n.message}</p>
                    <p className="text-xs text-gray-400 mt-2">{getRelativeTime(n.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default NotificationsDrawer
