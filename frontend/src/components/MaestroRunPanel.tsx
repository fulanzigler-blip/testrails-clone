import React, { useEffect, useState, useRef } from "react";
import { Play, ChevronDown, ChevronRight, X, RefreshCw } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import {
  fetchMaestroRuns,
  triggerMaestroRun,
} from "../store/slices/maestroSlice";
import MaestroScreenshotGallery from "./MaestroScreenshotGallery";
import { api } from "../lib/api";

interface MaestroRun {
  id: string;
  testRunId: string;
  runId: string;
  status: "pending" | "running" | "passed" | "failed" | "error";
  triggeredAt: string;
  completedAt: string | null;
  flowCount: number;
  passCount: number;
  failCount: number;
  logUrl: string | null;
  screenshots: Array<{
    id: string;
    maestroRunId: string;
    testCaseId: string | null;
    stepIndex: number;
    filePath: string;
    takenAt: string;
  }>;
}

interface MaestroRunPanelProps {
  testRunId: string;
}

const statusColors: Record<MaestroRun["status"], string> = {
  pending: "bg-gray-200 text-gray-700",
  running: "bg-blue-100 text-blue-700",
  passed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  error: "bg-orange-100 text-orange-700",
};

const statusDotColors: Record<MaestroRun["status"], string> = {
  pending: "bg-gray-400",
  running: "bg-blue-500",
  passed: "bg-green-500",
  failed: "bg-red-500",
  error: "bg-orange-500",
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MaestroRunPanel: React.FC<MaestroRunPanelProps> = ({ testRunId }) => {
  const dispatch = useAppDispatch();
  const { runsByTestRunId, loading } = useAppSelector((state) => state.maestro);
  const filteredRuns: MaestroRun[] = runsByTestRunId[testRunId] ?? [];

  const cliEndRef = useRef<HTMLDivElement>(null);
  const [showModal, setShowModal] = useState(false);
  const [flowPathsText, setFlowPathsText] = useState("");
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [availableFlows, setAvailableFlows] = useState<string[]>([]);
  const [selectedFlows, setSelectedFlows] = useState<Set<string>>(new Set());
  const [loadingFlows, setLoadingFlows] = useState(false);

  useEffect(() => {
    dispatch(fetchMaestroRuns(testRunId));
  }, [dispatch, testRunId]);

  // Auto-scroll CLI output to bottom when new lines arrive
  useEffect(() => {
    cliEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filteredRuns]);

  const openTriggerModal = async () => {
    setShowModal(true);
    setLoadingFlows(true);
    try {
      const r = await api.get('/maestro/flows');
      const flows: string[] = r.data?.data?.flows ?? [];
      setAvailableFlows(flows);
    } catch {
      setAvailableFlows([]);
    } finally {
      setLoadingFlows(false);
    }
  };

  const toggleFlow = (path: string) => {
    setSelectedFlows(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const handleTriggerRun = async () => {
    // Combine checkbox selections + manual text
    const fromCheckboxes = Array.from(selectedFlows);
    const fromText = flowPathsText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    const flowPaths = [...new Set([...fromCheckboxes, ...fromText])];

    if (flowPaths.length === 0) return;

    setTriggering(true);
    try {
      await dispatch(triggerMaestroRun({ testRunId, flowPaths })).unwrap();
      setShowModal(false);
      setFlowPathsText("");
      setSelectedFlows(new Set());
      dispatch(fetchMaestroRuns(testRunId));
    } catch {
      // error handled via redux state
    } finally {
      setTriggering(false);
    }
  };

  const toggleExpanded = (runId: string) => {
    setExpandedRunId((prev) => (prev === runId ? null : runId));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Maestro Automation
        </h3>
        <button
          onClick={openTriggerModal}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
        >
          <Play className="h-4 w-4" />
          Trigger Run
        </button>
      </div>

      {/* Loading Skeleton */}
      {loading && filteredRuns.length === 0 && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 rounded-lg bg-gray-100 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredRuns.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 py-10 text-center">
          <p className="text-sm text-gray-500">
            No Maestro runs found. Trigger a run to get started.
          </p>
        </div>
      )}

      {/* Runs List */}
      {filteredRuns.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 divide-y divide-gray-200">
          {filteredRuns.map((run: MaestroRun) => {
            const isExpanded = expandedRunId === run.id;
            return (
              <div key={run.id}>
                {/* Row */}
                <button
                  type="button"
                  onClick={() => toggleExpanded(run.id)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="flex-shrink-0 text-gray-400">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </span>

                  <span className="font-mono text-sm text-gray-700 truncate max-w-[120px]">
                    {run.runId.slice(0, 8)}
                  </span>

                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      statusColors[run.status]
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        statusDotColors[run.status]
                      } ${run.status === "running" ? "animate-pulse" : ""}`}
                    />
                    {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                  </span>

                  <span className="text-sm text-gray-600">
                    <span className="text-green-600 font-medium">
                      {run.passCount}
                    </span>
                    <span className="mx-1 text-gray-300">/</span>
                    <span className="text-red-600 font-medium">
                      {run.failCount}
                    </span>
                  </span>

                  <span className="ml-auto text-xs text-gray-400">
                    {formatDate(run.triggeredAt)}
                  </span>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
                    {/* Live Flow Status */}
                    {run.status === 'running' && run.flowStatuses && run.flowStatuses.length > 0 && (
                      <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3">
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Live Flow Status</h4>
                        <div className="space-y-1">
                          {run.flowStatuses.map((fs, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              <span className={`inline-flex h-2 w-2 rounded-full ${
                                fs.status === 'passed' ? 'bg-green-500' :
                                fs.status === 'failed' ? 'bg-red-500' :
                                'bg-blue-500 animate-pulse'
                              }`} />
                              <span className="font-mono text-xs text-gray-700">{fs.name}</span>
                              <span className={`ml-auto text-xs ${
                                fs.status === 'passed' ? 'text-green-600' :
                                fs.status === 'failed' ? 'text-red-600' :
                                'text-blue-600'
                              }`}>
                                {fs.status === 'passed' ? `✓ ${fs.duration}s` :
                                 fs.status === 'failed' ? `✗ ${fs.duration}s` :
                                 'Running...'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mb-3 grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Flow Count:</span>{" "}
                        <span className="font-medium text-gray-800">
                          {run.flowCount}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Pass Count:</span>{" "}
                        <span className="font-medium text-green-700">
                          {run.passCount}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Fail Count:</span>{" "}
                        <span className="font-medium text-red-700">
                          {run.failCount}
                        </span>
                      </div>
                      {run.completedAt && (
                        <div>
                          <span className="text-gray-500">Completed:</span>{" "}
                          <span className="font-medium text-gray-800">
                            {formatDate(run.completedAt)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Live CLI Output Terminal */}
                    {run.cliOutput && run.cliOutput.length > 0 && (
                      <div className="mb-3 overflow-hidden rounded-lg border border-gray-800 bg-gray-950">
                        <div className="flex items-center justify-between border-b border-gray-700 px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-red-500" />
                            <div className="h-2 w-2 rounded-full bg-yellow-500" />
                            <div className="h-2 w-2 rounded-full bg-green-500" />
                            <span className="ml-2 text-xs text-gray-400 font-mono">Maestro CLI</span>
                          </div>
                          {run.status === 'running' && (
                            <span className="flex items-center gap-1 text-xs text-blue-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                              Running...
                            </span>
                          )}
                        </div>
                        <div
                          className="max-h-[400px] overflow-y-auto p-3 font-mono text-[11px] leading-relaxed text-gray-300"
                          style={{ scrollBehavior: 'smooth' }}
                        >
                          {run.cliOutput.slice(-200).map((line, i) => (
                            <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                          ))}
                          <div ref={cliEndRef} />
                        </div>
                      </div>
                    )}

                    {/* Screenshot Evidence */}
                    {run.screenshots && run.screenshots.length > 0 && (
                      <div className="mb-3">
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Screenshot Evidence ({run.screenshots.length})
                        </h4>
                        <MaestroScreenshotGallery screenshots={run.screenshots} />
                      </div>
                    )}

                    {run.logUrl && (
                      <div className="mb-3 text-sm">
                        <a
                          href={run.logUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 underline"
                        >
                          View Logs
                        </a>
                      </div>
                    )}

                    <MaestroScreenshotGallery screenshots={run.screenshots} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Trigger Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowModal(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h4 className="text-base font-semibold text-gray-900">
                Trigger Maestro Run
              </h4>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-md p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Available flows from Mac */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Flows on Mac runner
                  </label>
                  <button onClick={openTriggerModal} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                    <RefreshCw className="h-3 w-3" /> Refresh
                  </button>
                </div>
                {loadingFlows ? (
                  <p className="text-sm text-gray-400">Loading flows from Mac...</p>
                ) : availableFlows.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No flows found in ~/maestro-flows/. Use the text box below or run Crawl &amp; Generate first.</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {availableFlows.map(flow => (
                      <label key={flow} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedFlows.has(flow)}
                          onChange={() => toggleFlow(flow)}
                          className="rounded border-gray-300 text-indigo-600"
                        />
                        <span className="text-xs font-mono text-gray-700 truncate">{flow.split('/').pop()}</span>
                        <span className="text-xs text-gray-400 truncate ml-auto">{flow}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual input */}
              <div>
                <label htmlFor="flowPaths" className="block text-sm font-medium text-gray-700 mb-2">
                  Or enter paths manually (one per line)
                </label>
                <textarea
                  id="flowPaths"
                  rows={3}
                  value={flowPathsText}
                  onChange={(e) => setFlowPathsText(e.target.value)}
                  placeholder={`/Users/clawbot/maestro-flows/login_flow.yaml`}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTriggerRun}
                disabled={
                  triggering ||
                  (selectedFlows.size === 0 &&
                    flowPathsText.split("\n").map(l => l.trim()).filter(l => l.length > 0).length === 0)
                }
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
              >
                <Play className="h-4 w-4" />
                {triggering ? "Triggering..." : "Trigger Run"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaestroRunPanel;
