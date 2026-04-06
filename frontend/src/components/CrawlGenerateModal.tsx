import React, { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Smartphone, ChevronDown, ChevronUp, FileCode2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchProjects } from '../store/slices/projectsSlice';
import { api } from '../lib/api';

interface GeneratedTestCase {
  title: string;
  description: string;
  steps: { order: number; description: string; expected: string }[];
  expectedResult: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
}

interface MaestroFlow {
  name: string;
  yaml: string;
  savedPath: string | null;
}

interface CrawlResult {
  testCases: GeneratedTestCase[];
  maestroFlows: MaestroFlow[];
  savedToDb: boolean;
  savedCount: number;
  hierarchyPreview: string;
}

interface DetectedField {
  name: string;
  placeholder: string;
  type: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (result?: CrawlResult) => void;
}

const priorityColors: Record<GeneratedTestCase['priority'], string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-green-100 text-green-800',
};

type Stage = 'input' | 'detecting' | 'credentials' | 'crawling' | 'generating' | 'results';

const CrawlGenerateModal: React.FC<Props> = ({ open, onClose, onSaved }) => {
  const dispatch = useAppDispatch();
  const { projects } = useAppSelector((state) => state.projects);

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedSuiteId, setSelectedSuiteId] = useState('');
  const [availableSuites, setAvailableSuites] = useState<{ id: string; name: string }[]>([]);
  const [suitesLoading, setSuitesLoading] = useState(false);
  const [appId, setAppId] = useState('com.disciplinetracker.app');
  const [maxScreens, setMaxScreens] = useState(4);
  const [framework, setFramework] = useState<'native' | 'flutter' | 'auto'>('auto');
  const [stage, setStage] = useState<Stage>('input');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CrawlResult | null>(null);
  const [expandedCases, setExpandedCases] = useState<Set<number>>(new Set());
  const [expandedFlows, setExpandedFlows] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<'testcases' | 'flows'>('testcases');

  // Phase 1 state
  const [detectedFields, setDetectedFields] = useState<DetectedField[]>([]);
  const [loginSummary, setLoginSummary] = useState('');
  const [loginFields, setLoginFields] = useState<DetectedField[]>([]);
  const [submitText, setSubmitText] = useState('');

  // Phase 2 state
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) dispatch(fetchProjects());
  }, [open, dispatch]);

  useEffect(() => {
    if (!open) return;
    setSuitesLoading(true);
    // Fetch all suites for the org, then filter client-side by project
    api.get('/test-suites', { params: { perPage: 100 } })
      .then(r => {
        const payload = r.data?.data;
        const list = Array.isArray(payload) ? payload : [];
        setAvailableSuites(list);
      })
      .catch(() => setAvailableSuites([]))
      .finally(() => setSuitesLoading(false));
  }, [open]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const reset = useCallback(() => {
    setStage('input');
    setError(null);
    setResult(null);
    setExpandedCases(new Set());
    setExpandedFlows(new Set());
    setActiveTab('testcases');
    setDetectedFields([]);
    setLoginSummary('');
    setLoginFields([]);
    setSubmitText('');
    setCredentialValues({});
    setSelectedSuiteId('');
    setAvailableSuites([]);
    setSuitesLoading(false);
  }, []);

  const handleClose = () => { reset(); onClose(); };

  const handleDetectLogin = async () => {
    if (!selectedProjectId) { setError('Please select a project.'); return; }
    if (!appId.trim()) { setError('Please enter an app ID.'); return; }

    setError(null);
    setStage('detecting');

    try {
      console.log('[CrawlGenerateModal] Calling detect-login-screen API...');
      const resp = await api.post('/test-cases/detect-login-screen', {
        projectId: selectedProjectId,
        appId: appId.trim(),
        ...(selectedSuiteId ? { suiteId: selectedSuiteId } : {}),
      });
      console.log('[CrawlGenerateModal] API response:', resp.data);
      console.log('[CrawlGenerateModal] resp.data.data:', resp.data.data);

      // Extract data properly - backend returns { success: true, data: { fields, loginSummary, submitText } }
      const data = resp.data?.data;
      console.log('[CrawlGenerateModal] Extracted data:', data);

      if (!data) {
        console.error('[CrawlGenerateModal] ERROR: Response data is null/undefined!');
        // Fallback: proceed to manual input
        setError('AI detection unavailable. Please enter credentials manually.');
        setStage('credentials');
        return;
      }

      if (!data.fields) {
        console.error('[CrawlGenerateModal] ERROR: data.fields is undefined!');
        console.error('[CrawlGenerateModal] Full data object:', JSON.stringify(data, null, 2));
        // Fallback: proceed to manual input
        setError('AI detection unavailable. Please enter credentials manually.');
        setStage('credentials');
        return;
      }

      console.log('[CrawlGenerateModal] Fields from API:', data.fields);
      setDetectedFields(data.fields);
      setLoginFields(data.fields);
      setLoginSummary(data.loginSummary);
      setSubmitText(data.submitText || '');
      setCredentialValues(Object.fromEntries((data.fields as DetectedField[]).map(f => [f.name, ''])));
      setStage('credentials');
    } catch (err: unknown) {
      console.error('[CrawlGenerateModal] ERROR in handleDetectLogin:', err);
      // Fallback: proceed to manual credentials input
      setStage('credentials');
      if (err instanceof Error && err.message?.includes('500')) {
        setError('AI login detection service is temporarily unavailable. Please enter credentials manually.');
      } else if (err instanceof Error) {
        setError(err.message || 'Failed to detect login screen.');
      } else {
        setError('An unexpected error occurred.');
      }
    }
  };

  const handleCrawlGenerate = async () => {
    setError(null);
    setStage('crawling');

    try {
      await new Promise(r => setTimeout(r, 50));
      setStage('generating');

      const resp = await api.post('/test-cases/crawl-generate', {
        projectId: selectedProjectId,
        appId: appId.trim(),
        framework,
        loginSummary,
        loginFields,
        submitText,
        credentials: credentialValues,
        maxScreens,
        ...(selectedSuiteId ? { suiteId: selectedSuiteId } : {}),
      });

      console.log('[CrawlGenerateModal] Crawl-generate response:', resp.data);
      const data: CrawlResult = resp.data?.data;
      if (!data) {
        throw new Error('Invalid response format from server');
      }
      setResult(data);
      setStage('results');
    } catch (err: unknown) {
      setStage('credentials');
      if (err instanceof Error) {
        setError(err.message || 'Failed to crawl and generate test cases.');
      } else {
        setError('An unexpected error occurred.');
      }
    }
  };

  const setCredentialValue = (name: string, value: string) => {
    setCredentialValues(prev => ({ ...prev, [name]: value }));
  };

  const toggleCase = (i: number) => setExpandedCases(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  const toggleFlow = (i: number) => setExpandedFlows(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  if (!open) return null;

  const isLoading = stage === 'detecting' || stage === 'crawling' || stage === 'generating';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              {stage === 'results' ? 'Crawl & Generate — Results' : 'Crawl & Generate'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* INPUT STAGE */}
          {stage === 'input' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Phase 1 detects the login screen fields automatically. Phase 2 uses your credentials to log in and explore post-login screens.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select a project...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Test Suite <span className="text-gray-400 font-normal">(optional — generated test cases will be saved here)</span></label>
                <select
                  value={selectedSuiteId}
                  onChange={(e) => setSelectedSuiteId(e.target.value)}
                  disabled={!selectedProjectId || suitesLoading}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  {!selectedProjectId && <option value="">Select a project first...</option>}
                  {selectedProjectId && suitesLoading && <option value="">Loading suites...</option>}
                  {selectedProjectId && !suitesLoading && availableSuites.filter((s: any) => s.projectId === selectedProjectId).length === 0 && <option value="">No suites found for this project</option>}
                  {(!selectedProjectId || availableSuites.filter((s: any) => s.projectId === selectedProjectId).length > 0) && !suitesLoading && <option value="">No suite (generate only, don't save)</option>}
                  {availableSuites.filter((s: any) => !selectedProjectId || s.projectId === selectedProjectId).map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">App ID (package name)</label>
                <input
                  type="text"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="com.example.app"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">The Android app must be installed on the connected device.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">App Framework</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: 'auto' as const, label: 'Auto Detect', desc: '(recommended)' },
                    { value: 'native' as const, label: 'Native', desc: 'Android / iOS' },
                    { value: 'flutter' as const, label: 'Flutter', desc: 'Semantics' },
                  ].map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setFramework(f.value)}
                      className={`rounded-lg border-2 px-3 py-2 text-center transition-all ${
                        framework === f.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-sm font-medium">{f.label}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{f.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* DETECTING STAGE */}
          {stage === 'detecting' && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <div className="text-center">
                <p className="font-medium text-gray-800">Launching app &amp; analyzing login screen...</p>
                <p className="text-sm text-gray-500 mt-1">Connecting to Mac runner, running Maestro hierarchy capture</p>
              </div>
            </div>
          )}

          {/* CREDENTIALS STAGE */}
          {stage === 'credentials' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                <p className="text-sm text-green-800 font-medium">
                  Detected {detectedFields.length} login field{detectedFields.length !== 1 ? 's' : ''}
                </p>
              </div>

              {/* DEBUG INFO */}
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
                <p className="text-xs font-mono text-blue-800">
                  DEBUG: detectedFields={JSON.stringify(detectedFields)}
                </p>
              </div>

              <p className="text-sm text-gray-600">
                Enter your credentials for each detected field. AI will use them to log in and explore post-login screens.
              </p>

              <div className="space-y-3">
                {detectedFields.map((field, idx) => (
                  <div key={field.name || idx}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{field.name}</label>
                    <input
                      id={`field-${idx}`}
                      name={`field-${field.name}`}
                      type={field.type}
                      value={credentialValues[field.name] ?? ''}
                      onChange={(e) => setCredentialValue(field.name, e.target.value)}
                      placeholder={field.placeholder}
                      autoComplete="off"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max screens to explore after login: {maxScreens}
                </label>
                <input
                  type="range"
                  min={1}
                  max={8}
                  value={maxScreens}
                  onChange={(e) => setMaxScreens(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>1 (fast)</span><span>8 (thorough)</span>
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* CRAWLING / GENERATING STAGES */}
          {(stage === 'crawling' || stage === 'generating') && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <div className="text-center">
                <p className="font-medium text-gray-800">
                  {stage === 'crawling'
                    ? 'Running login flow & exploring screens...'
                    : 'AI generating test cases...'}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {stage === 'crawling'
                    ? `AI login flow → explore up to ${maxScreens} post-login screens`
                    : 'Sending UI elements to GLM-5.1, building test cases + flows'}
                </p>
              </div>
            </div>
          )}

          {/* RESULTS STAGE */}
          {stage === 'results' && result && (
            <div className="space-y-4">
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                Generated {result.testCases.length} test cases and {result.maestroFlows.length} Maestro flows.
                {result.savedToDb && ` Saved ${result.savedCount} test cases to database.`}
              </div>

              <div className="flex border-b">
                <button
                  onClick={() => setActiveTab('testcases')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'testcases'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Test Cases ({result.testCases.length})
                </button>
                <button
                  onClick={() => setActiveTab('flows')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'flows'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Maestro Flows ({result.maestroFlows.length})
                </button>
              </div>

              {activeTab === 'testcases' && (
                <div className="space-y-2">
                  {result.testCases.map((tc, i) => (
                    <div key={i} className="rounded-lg border border-gray-200 overflow-hidden">
                      <div
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => toggleCase(i)}
                      >
                        <span className="flex-1 font-semibold text-sm text-gray-900">{tc.title}</span>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityColors[tc.priority]}`}>
                          {tc.priority}
                        </span>
                        {expandedCases.has(i) ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                      {expandedCases.has(i) && (
                        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
                          <p className="text-sm text-gray-600">{tc.description}</p>
                          {tc.steps.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Steps</h4>
                              <ol className="space-y-2">
                                {tc.steps.map((step, si) => (
                                  <li key={si} className="text-sm">
                                    <span className="font-medium text-gray-700">{step.order}. {step.description}</span>
                                    <p className="text-gray-500 ml-4 text-xs mt-0.5">Expected: {step.expected}</p>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                          <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Expected Result</h4>
                            <p className="text-sm text-gray-600">{tc.expectedResult}</p>
                          </div>
                          {tc.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {tc.tags.map((tag, ti) => (
                                <span key={ti} className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'flows' && (
                <div className="space-y-2">
                  {result.maestroFlows.map((flow, i) => (
                    <div key={i} className="rounded-lg border border-gray-200 overflow-hidden">
                      <div
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => toggleFlow(i)}
                      >
                        <FileCode2 className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        <span className="flex-1 font-semibold text-sm text-gray-900 font-mono">{flow.name}</span>
                        {flow.savedPath && (
                          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">Saved</span>
                        )}
                        {expandedFlows.has(i) ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                      {expandedFlows.has(i) && (
                        <div className="border-t border-gray-100 bg-gray-900 px-4 py-3">
                          {flow.savedPath && (
                            <p className="text-xs text-gray-400 mb-2">Saved to: {flow.savedPath}</p>
                          )}
                          <pre className="text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">
                            {flow.yaml}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
          {stage === 'results' ? (
            <>
              <button
                onClick={reset}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                New Crawl
              </button>
              <button
                onClick={() => { onSaved(result ?? undefined); handleClose(); }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Done
              </button>
            </>
          ) : stage === 'credentials' ? (
            <>
              <button
                onClick={() => setStage('input')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                onClick={handleCrawlGenerate}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                <Smartphone className="h-4 w-4" />
                Crawl Post-Login Screens
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleClose}
                disabled={isLoading}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleDetectLogin}
                disabled={isLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Detecting...
                  </>
                ) : (
                  <>
                    <Smartphone className="h-4 w-4" />
                    Detect Login Screen
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CrawlGenerateModal;
