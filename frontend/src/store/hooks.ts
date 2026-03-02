import { useDispatch, useSelector } from 'react-redux'
import type { RootState, AppDispatch } from './index'

// Export as arrow functions so hooks aren't called at module import time
export const useAppDispatch = () => useDispatch<AppDispatch>()
export const useAppSelector = <T>(selector: (state: RootState) => T) => useSelector<RootState, T>(selector)
