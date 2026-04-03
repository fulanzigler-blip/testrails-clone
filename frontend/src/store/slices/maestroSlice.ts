import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { api } from '../../lib/api';

export interface MaestroScreenshot {
  id: string;
  maestroRunId: string;
  testCaseId: string | null;
  stepIndex: number;
  filePath: string;
  takenAt: string;
}

export interface MaestroRun {
  id: string;
  testRunId: string;
  runId: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'error';
  triggeredAt: string;
  completedAt: string | null;
  flowCount: number;
  passCount: number;
  failCount: number;
  logUrl: string | null;
  screenshots: MaestroScreenshot[];
}

interface MaestroState {
  runs: MaestroRun[];
  loading: boolean;
  error: string | null;
}

const initialState: MaestroState = {
  runs: [],
  loading: false,
  error: null,
};

export const fetchMaestroRuns = createAsyncThunk<
  MaestroRun[],
  string,
  { rejectValue: string }
>('maestro/fetchMaestroRuns', async (testRunId, { rejectWithValue }) => {
  try {
    const response = await api.get<{ data: MaestroRun[] }>(`/maestro/runs/${testRunId}`);
    return response.data.data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    const message =
      err.response?.data?.message ||
      err.message ||
      'Failed to fetch Maestro runs';
    return rejectWithValue(message);
  }
});

export const triggerMaestroRun = createAsyncThunk<
  MaestroRun,
  { testRunId: string; flowPaths: string[] },
  { rejectValue: string }
>('maestro/triggerMaestroRun', async (payload, { rejectWithValue }) => {
  try {
    const response = await api.post<{ data: MaestroRun }>('/maestro/trigger', payload);
    return response.data.data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    const message =
      err.response?.data?.message ||
      err.message ||
      'Failed to trigger Maestro run';
    return rejectWithValue(message);
  }
});

const maestroSlice = createSlice({
  name: 'maestro',
  initialState,
  reducers: {
    updateMaestroRun(
      state,
      action: PayloadAction<Partial<MaestroRun> & { id: string }>
    ) {
      const index = state.runs.findIndex(
        (run) => run.id === action.payload.id
      );
      if (index !== -1) {
        state.runs[index] = { ...state.runs[index], ...action.payload };
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMaestroRuns.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMaestroRuns.fulfilled, (state, action) => {
        state.loading = false;
        state.runs = action.payload;
        state.error = null;
      })
      .addCase(fetchMaestroRuns.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Failed to fetch Maestro runs';
      })
      .addCase(triggerMaestroRun.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(triggerMaestroRun.fulfilled, (state, action) => {
        state.loading = false;
        state.runs.unshift(action.payload);
        state.error = null;
      })
      .addCase(triggerMaestroRun.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Failed to trigger Maestro run';
      });
  },
});

export const { updateMaestroRun } = maestroSlice.actions;
export default maestroSlice.reducer;
