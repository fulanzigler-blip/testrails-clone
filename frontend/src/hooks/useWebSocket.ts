import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { connect, disconnect, subscribe } from '../lib/socket'
import { addNotification } from '../store/slices/notificationsSlice'

const useWebSocket = () => {
  const dispatch = useAppDispatch()
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated)

  useEffect(() => {
    const token = localStorage.getItem('access_token')

    if (isAuthenticated && token) {
      connect(token)

      const unsubscribeNotification = subscribe('notification', (data) => {
        dispatch(addNotification(data as Parameters<typeof addNotification>[0]))
      })

      const unsubscribeTestRunUpdate = subscribe('test_run_update', (data) => {
        console.log('test_run_update', data)
      })

      return () => {
        unsubscribeNotification()
        unsubscribeTestRunUpdate()
        disconnect()
      }
    }

    return () => {
      disconnect()
    }
  }, [isAuthenticated, dispatch])
}

export default useWebSocket
