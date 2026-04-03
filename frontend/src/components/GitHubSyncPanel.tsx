import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Github, Download, Upload } from 'lucide-react';
import { api } from '../lib/api';

interface GitHubSyncPanelProps {
  projectId: string;
}

interface SyncResponseData {
  synced: number;
  created: number;
  updated: number;
}

interface PushResponseData {
  exported: number;
  commitUrl: string;
}

const GitHubSyncPanel: React.FC<GitHubSyncPanelProps> = ({ projectId }) => {
  const [syncLoading, setSyncLoading] = useState<boolean>(false);
  const [pushLoading, setPushLoading] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
  }, []);

  const scheduleAutoClear = useCallback((which: 'success' | 'error') => {
    if (which === 'success') {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setSuccessMessage(null), 5000);
    } else {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setErrorMessage(null), 5000);
    }
  }, []);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const handleSync = useCallback(async () => {
    setSyncLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const response = await api.post<{ success: true; data: SyncResponseData }>(
        '/integrations/github-scenarios/sync',
        { projectId }
      );
      const { synced, created, updated } = response.data.data;
      setSuccessMessage(`Synced ${synced} test cases (${created} created, ${updated} updated)`);
      scheduleAutoClear('success');
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'Failed to pull from GitHub';
      setErrorMessage(msg);
      scheduleAutoClear('error');
    } finally {
      setSyncLoading(false);
    }
  }, [projectId, scheduleAutoClear]);

  const handlePush = useCallback(async () => {
    setPushLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const response = await api.post<{ success: true; data: PushResponseData }>(
        '/integrations/github-scenarios/push',
        { projectId }
      );
      const { exported } = response.data.data;
      setSuccessMessage(`Exported ${exported} test cases to GitHub`);
      scheduleAutoClear('success');
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'Failed to push to GitHub';
      setErrorMessage(msg);
      scheduleAutoClear('error');
    } finally {
      setPushLoading(false);
    }
  }, [projectId, scheduleAutoClear]);

  const isAnyLoading = syncLoading || pushLoading;

  const Spinner = () => (
    <span className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent inline-block" />
  );

  return (
    <div className="border rounded-lg p-4 bg-muted/20">
      <div className="flex items-center gap-2 mb-3">
        <Github className="h-5 w-5" />
        <span className="font-semibold">GitHub Scenarios Sync</span>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSync}
          disabled={isAnyLoading}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {syncLoading ? <Spinner /> : <Download className="h-4 w-4" />}
          Pull from GitHub
        </button>

        <button
          type="button"
          onClick={handlePush}
          disabled={isAnyLoading}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {pushLoading ? <Spinner /> : <Upload className="h-4 w-4" />}
          Push to GitHub
        </button>
      </div>

      {successMessage && (
        <p className="mt-3 text-sm text-green-600 dark:text-green-400">{successMessage}</p>
      )}

      {errorMessage && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
      )}
    </div>
  );
};

export default GitHubSyncPanel;
