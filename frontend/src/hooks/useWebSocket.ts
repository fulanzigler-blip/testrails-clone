import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { connect, disconnect, subscribe } from '../lib/socket'
import { addNotification } from '../store/slices/notificationsSlice'
import { updateMaestroRun } from '../store/slices/maestroSlice'

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

      const unsubscribeMaestroRunUpdate = subscribe('maestro_run_update', (data) => {
        const payload = data as any;
        if (!payload || (!payload.id && !payload.maestroRunId)) {
          console.warn('[WS] maestro_run_update: invalid payload', data);
          return;
        }
        dispatch(updateMaestroRun({
          id: payload.id || payload.maestroRunId,
          status: payload.status,
          testRunId: payload.testRunId,
          flowCount: payload.flowCount,
          passCount: payload.passCount,
          failCount: payload.failCount,
          logUrl: payload.logUrl,
          completedAt: payload.completedAt,
          screenshots: payload.screenshots,
        }))
      })

      const unsubscribeMaestroFlowUpdate = subscribe('maestro_flow_update', (data) => {
        const payload = data as any;
        if (!payload || !payload.maestroRunId || !payload.flowName) {
          console.warn('[WS] maestro_flow_update: invalid payload', data);
          return;
        }
        dispatch(updateMaestroRun({
          maestroRunId: payload.maestroRunId,
          flowName: payload.flowName,
          flowStatus: payload.status,
          flowDuration: payload.duration,
        }))
      })

      const unsubscribeMaestroOutput = subscribe('maestro_output', (data) => {
        const payload = data as any;
        if (!payload || !payload.maestroRunId || !payload.line) return;
        // Dispatch output as flow status (we'll handle it in the panel directly via store)
        dispatch(updateMaestroRun({
          maestroRunId: payload.maestroRunId,
          cliOutput: payload.line,
        }))
      })

      return () => {
        unsubscribeNotification()
        unsubscribeTestRunUpdate()
        unsubscribeMaestroRunUpdate()
        unsubscribeMaestroFlowUpdate()
        unsubscribeMaestroOutput()
        // Don't disconnect on unmount — keep WS alive across route changes
      }
    }

    return () => {
      // Only disconnect on full logout
      if (!isAuthenticated) disconnect()
    }
  }, [isAuthenticated, dispatch])
}

export default useWebSocket
