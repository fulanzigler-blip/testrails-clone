import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/authSlice'
import projectsReducer from './slices/projectsSlice'
import testCasesReducer from './slices/testCasesSlice'
import testRunsReducer from './slices/testRunsSlice'
import usersReducer from './slices/usersSlice'
import notificationsReducer from './slices/notificationsSlice'
import testSuitesReducer from './slices/testSuitesSlice'
import reportsReducer from './slices/reportsSlice'
import maestroReducer from './slices/maestroSlice'
import generatedFlowsReducer from './slices/generatedFlowsSlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    projects: projectsReducer,
    testCases: testCasesReducer,
    testRuns: testRunsReducer,
    users: usersReducer,
    notifications: notificationsReducer,
    testSuites: testSuitesReducer,
    reports: reportsReducer,
    maestro: maestroReducer,
    generatedFlows: generatedFlowsReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
