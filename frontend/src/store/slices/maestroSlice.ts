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
  flowStatuses?: { name: string; status: 'running' | 'passed' | 'failed'; duration?: number }[];
  cliOutput?: string[]; // Live CLI output lines
}

interface MaestroState {
  runsByTestRunId: Record<string, MaestroRun[]>;
  loading: boolean;
  error: string | null;
}

const initialState: MaestroState = {
  runsByTestRunId: {},
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
      action: PayloadAction<Partial<MaestroRun> & { id?: string; maestroRunId?: string; testRunId?: string; flowName?: string; flowStatus?: string; flowDuration?: number; cliOutput?: string }>
    ) {
      const runId = action.payload.id || action.payload.maestroRunId;
      if (!runId) return;

      // Handle CLI output streaming
      if (action.payload.cliOutput) {
        for (const testRunId of Object.keys(state.runsByTestRunId)) {
          const runs = state.runsByTestRunId[testRunId];
          const run = runs.find(r => r.id === runId);
          if (run) {
            if (!run.cliOutput) run.cliOutput = [];
            run.cliOutput.push(action.payload.cliOutput);
            // Keep last 500 lines to avoid memory issues
            if (run.cliOutput.length > 500) run.cliOutput = run.cliOutput.slice(-500);
            break;
          }
        }
        return;
      }

      // Handle flow status updates from WebSocket
      if (action.payload.flowName && action.payload.flowStatus) {
        for (const testRunId of Object.keys(state.runsByTestRunId)) {
          const runs = state.runsByTestRunId[testRunId];
          const run = runs.find(r => r.id === runId);
          if (run) {
            if (!run.flowStatuses) run.flowStatuses = [];
            const existing = run.flowStatuses.find(f => f.name === action.payload.flowName);
            if (existing) {
              existing.status = action.payload.flowStatus as 'running' | 'passed' | 'failed';
              existing.duration = action.payload.flowDuration;
            } else {
              run.flowStatuses.push({
                name: action.payload.flowName,
                status: action.payload.flowStatus as 'running' | 'passed' | 'failed',
                duration: action.payload.flowDuration,
              });
            }
            break;
          }
        }
        return;
      }

      // Standard run status update
      for (const testRunId of Object.keys(state.runsByTestRunId)) {
        const runs = state.runsByTestRunId[testRunId];
        const index = runs.findIndex(r => r.id === runId);
        if (index !== -1) {
          runs[index] = { ...runs[index], ...action.payload, id: runId };
          break;
        }
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
        // Key by testRunId — won't clobber other test runs' data
        if (action.payload.length > 0) {
          const testRunId = action.payload[0].testRunId;
          state.runsByTestRunId[testRunId] = action.payload;
        }
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
        const { testRunId } = action.payload;
        if (!state.runsByTestRunId[testRunId]) {
          state.runsByTestRunId[testRunId] = [];
        }
        state.runsByTestRunId[testRunId].unshift(action.payload);
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
