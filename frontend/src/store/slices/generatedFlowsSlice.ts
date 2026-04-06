import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface GeneratedMaestroFlow {
  name: string;
  yaml: string;
  savedPath: string | null;
}

export interface GeneratedTestCase {
  title: string;
  description: string;
  steps: { order: number; description: string; expected: string }[];
  expectedResult: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
}

interface GeneratedFlowsState {
  testCases: GeneratedTestCase[];
  maestroFlows: GeneratedMaestroFlow[];
  savedToDb: boolean;
  savedCount: number;
  lastGeneratedAt: string | null;
}

const initialState: GeneratedFlowsState = {
  testCases: [],
  maestroFlows: [],
  savedToDb: false,
  savedCount: 0,
  lastGeneratedAt: null,
};

const generatedFlowsSlice = createSlice({
  name: 'generatedFlows',
  initialState,
  reducers: {
    setGeneratedResults(
      state,
      action: PayloadAction<{
        testCases: GeneratedTestCase[];
        maestroFlows: GeneratedMaestroFlow[];
        savedToDb: boolean;
        savedCount: number;
      }>
    ) {
      state.testCases = action.payload.testCases;
      state.maestroFlows = action.payload.maestroFlows;
      state.savedToDb = action.payload.savedToDb;
      state.savedCount = action.payload.savedCount;
      state.lastGeneratedAt = new Date().toISOString();
    },
    updateFlowYaml(
      state,
      action: PayloadAction<{ index: number; yaml: string }>
    ) {
      if (state.maestroFlows[action.payload.index]) {
        state.maestroFlows[action.payload.index].yaml = action.payload.yaml;
      }
    },
    clearGeneratedResults(state) {
      state.testCases = [];
      state.maestroFlows = [];
      state.savedToDb = false;
      state.savedCount = 0;
      state.lastGeneratedAt = null;
    },
  },
});

export const { setGeneratedResults, updateFlowYaml, clearGeneratedResults } = generatedFlowsSlice.actions;
export default generatedFlowsSlice.reducer;
