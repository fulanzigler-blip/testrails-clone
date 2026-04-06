import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Smartphone, ChevronRight, ChevronLeft, Save, Trash2, Plus, Eye, Edit3, ArrowRight, CheckCircle2, Loader2, Download } from 'lucide-react';

export interface CapturedElement {
  text: string;
  className?: string;
  clickable: boolean;
  bounds?: string;
}

export interface PageStep {
  id: string;
  action: 'tapOn' | 'assertVisible' | 'inputText' | 'waitFor' | 'hideKeyboard' | 'pressKey' | 'comment';
  target: string;
  value?: string;
  enabled: boolean;
}

export interface SavedPage {
  id: string;
  name: string;
  appId: string;
  steps: PageStep[];
}

export interface TestSuite {
  id: string;
  name: string;
  projectId: string;
}

export interface SuiteFlow {
  id: string;
  name: string;
  yaml: string;
  orderIndex: number;
  savedPath?: string | null;
}

const PageAutomation: React.FC = () => {
  // State
  const [appId, setAppId] = useState('com.disciplinetracker.app');
  const [capturing, setCapturing] = useState(false);
  const [elements, setElements] = useState<CapturedElement[]>([]);
  const [pageName, setPageName] = useState('');
  const [steps, setSteps] = useState<PageStep[]>([]);
  const [savedPages, setSavedPages] = useState<SavedPage[]>([]);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'capture' | 'edit' | 'yaml'>('capture');
  const [editStepValue, setEditStepValue] = useState<Record<string, string>>({});
  const [includeLaunch, setIncludeLaunch] = useState(true);

  // Test Suite integration
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [selectedSuiteId, setSelectedSuiteId] = useState('');
  const [suiteFlows, setSuiteFlows] = useState<SuiteFlow[]>([]);
  const [loadingSuites, setLoadingSuites] = useState(false);

  // Fetch test suites on mount
  useEffect(() => {
    fetchSuites();
  }, []);

  // Fetch suite flows when suite selected — also populate savedPages
  useEffect(() => {
    if (selectedSuiteId) {
      fetchSuiteFlows(selectedSuiteId);
    } else {
      setSuiteFlows([]);
      // If no suite selected, still show all flows from all suites as saved pages
      fetchAllFlowsForDisplay();
    }
  }, [selectedSuiteId]);

  const fetchAllFlowsForDisplay = async () => {
    try {
      const resp = await api.get('/test-suites/flows');
      const flows: SuiteFlow[] = resp.data?.data || [];
      // Convert flows to SavedPage format for display
      const pages: SavedPage[] = flows.map(f => ({
        id: f.id,
        name: f.name,
        appId,
        steps: [], // Steps not stored in DB, only YAML
      }));
      setSavedPages(pages);
    } catch {
      setSavedPages([]);
    }
  };

  const fetchSuites = async () => {
    try {
      setLoadingSuites(true);
      const resp = await api.get('/test-suites', { params: { perPage: 100 } });
      setSuites(resp.data?.data || []);
    } catch {
      // Silently fail
    } finally {
      setLoadingSuites(false);
    }
  };

  const fetchSuiteFlows = async (suiteId: string) => {
    try {
      const resp = await api.get(`/test-suites/${suiteId}/flows`);
      setSuiteFlows(resp.data?.data || []);
    } catch {
      setSuiteFlows([]);
    }
  };

  // Capture hierarchy
  const captureScreen = async () => {
    setCapturing(true);
    setElements([]);
    setSteps([]);
    setViewMode('capture');
    try {
      const resp = await api.get('/maestro/hierarchy', { params: { appId } });
      const captured = resp.data?.data?.elements || [];
      setElements(captured);
      
      // Auto-generate suggested steps from elements
      const suggested: PageStep[] = [];
      for (const el of captured) {
        const isInput = el.className?.includes('EditText') || el.className?.includes('TextInput');
        const isButton = el.className?.includes('Button') || el.clickable;
        const isText = !isInput && !isButton;
        
        if (isInput) {
          const coords = el.bounds?.match(/^\d+%,\d+%$/) ? el.bounds : el.text;
          suggested.push({ id: Date.now().toString() + suggested.length, action: 'tapOn', target: coords, enabled: true });
          suggested.push({ id: Date.now().toString() + suggested.length, action: 'inputText', target: coords, value: '', enabled: true });
        } else if (isButton && el.text && el.text.length < 30) {
          suggested.push({ id: Date.now().toString() + suggested.length, action: 'tapOn', target: el.text, enabled: true });
        } else if (isText && el.text && el.text.length < 30) {
          // Only add assert for visible text
          suggested.push({ id: Date.now().toString() + suggested.length, action: 'assertVisible', target: el.text, enabled: false }); // disabled by default
        }
      }
      setSteps(suggested);
      setPageName(`page_${savedPages.length + 1}`);
      setViewMode('edit');
    } catch (err) {
      console.error('Capture failed:', err);
      alert('Capture failed. Check console for details.');
    } finally {
      setCapturing(false);
    }
  };

  // Toggle step
  const toggleStep = (id: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  // Remove step
  const removeStep = (id: string) => {
    setSteps(prev => prev.filter(s => s.id !== id));
  };

  // Update step value
  const updateStepValue = (id: string, value: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, value } : s));
    setEditStepValue(prev => ({ ...prev, [id]: value }));
  };

  // Add manual step
  const addManualStep = (action: PageStep['action'], target: string) => {
    setSteps(prev => [...prev, { id: Date.now().toString(), action, target, enabled: true }]);
  };

  // Add step (used by element click)
  const addStep = (action: PageStep['action'], target: string, comment?: string) => {
    setSteps(prev => [...prev, { id: Date.now().toString() + Math.random(), action, target, comment, enabled: true }]);
  };

  // Save page
  const savePage = async () => {
    if (!pageName) {
      alert('Please enter a page name');
      return;
    }
    setSaving(true);
    try {
      const yaml = generateYaml();
      const enabledSteps = steps.filter(s => s.enabled);

      // Save to Mac
      let savedPath: string | undefined;
      try {
        const macResp = await api.post('/maestro/flows', {
          appId,
          flows: [{ name: pageName, yaml }],
          clearFirst: false,
        });
        savedPath = macResp.data?.data?.paths?.[0];
      } catch (macErr: any) {
        console.error('Mac save failed:', macErr);
        alert(`⚠️ Failed to save to Mac runner: ${macErr.response?.data?.error?.message || macErr.message}. Flow still saved to database.`);
      }

      // ALWAYS save to DB (pool)
      let suiteFlowId: string | undefined;
      try {
        const flowResp = await api.post('/maestro/flows/db', {
          name: pageName,
          yaml,
          orderIndex: 0,
          savedPath,
          suiteId: selectedSuiteId || undefined,
        });
        suiteFlowId = flowResp.data?.data?.id;
      } catch (err) {
        console.error('Failed to save flow to DB:', err);
      }

      const page: SavedPage = {
        id: suiteFlowId || Date.now().toString(),
        name: pageName,
        appId,
        steps: enabledSteps,
      };

      setSavedPages(prev => [...prev, page]);
      setElements([]);
      setSteps([]);
      setPageName('');
      setViewMode('capture');
      setIncludeLaunch(false);

      // Refresh display
      fetchAllFlowsForDisplay();
      if (selectedSuiteId) {
        fetchSuiteFlows(selectedSuiteId);
      }

      alert(`Page "${pageName}" saved!${selectedSuiteId ? ' Added to suite.' : ' Added to pool.'}`);
    } catch (err) {
      console.error('Save failed:', err);
      alert('Save failed. Check console for details.');
    } finally {
      setSaving(false);
    }
  };

  // Generate YAML from steps
  const generateYaml = (): string => {
    const lines = [`appId: ${appId}`, '---'];

    // Optional launchApp
    if (includeLaunch) {
      lines.push('- launchApp');
      lines.push('- waitForAnimationToEnd');
    }

    const enabledSteps = steps.filter(s => s.enabled);
    let prevAction = '';

    for (const step of enabledSteps) {
      // DON'T auto-hide keyboard after inputText - let Maestro handle focus naturally
      // (tapping next field automatically dismisses keyboard on most apps)

      switch (step.action) {
        case 'tapOn':
          if (step.target.match(/^\d+%,\d+%/)) {
            // Coordinate-based tap
            lines.push(`- tapOn:\n    point: "${step.target}"`);
          } else if (step.target.startsWith('id:')) {
            // Resource ID-based tap
            const id = step.target.replace('id:', '');
            lines.push(`- tapOn:\n    id: "${id}"`);
          } else {
            // Text-based tap
            lines.push(`- tapOn: "${step.target}"`);
          }
          prevAction = 'tapOn';
          break;
        case 'assertVisible':
          if (!step.target.match(/^(masuk|login|submit|lanjut|continue|daftar|enter)$/i)) {
            lines.push(`- assertVisible: "${step.target}"`);
            prevAction = 'assertVisible';
          }
          break;
        case 'inputText':
          lines.push(`- inputText: "${step.value || 'test'}"`);
          prevAction = 'inputText';
          break;
        case 'waitFor':
          lines.push('- waitForAnimationToEnd');
          prevAction = 'waitFor';
          break;
        case 'hideKeyboard':
          // Use pressKey: Back as alternative (safer on Huawei)
          lines.push('- pressKey: Back');
          prevAction = 'hideKeyboard';
          break;
        case 'pressKey':
          lines.push(`- pressKey: ${step.target}`);
          prevAction = 'pressKey';
          break;
        case 'comment':
          lines.push(`# ${step.target}`);
          prevAction = 'comment';
          break;
      }
    }

    // End with waitFor
    if (prevAction !== 'waitFor' && prevAction !== 'hideKeyboard') {
      lines.push('- waitForAnimationToEnd');
    }

    return lines.join('\n');
  };

  // Download all flows
  const downloadAll = () => {
    const content = savedPages.map(p => {
      const yamlLines = [`# Page: ${p.name}`, `appId: ${p.appId}`, '---'];
      for (const step of p.steps) {
        switch (step.action) {
          case 'tapOn':
            if (step.target.match(/^\d+%,\d+%/)) yamlLines.push(`- tapOn:\n    point: "${step.target}"`);
            else yamlLines.push(`- tapOn: "${step.target}"`);
            break;
          case 'assertVisible': yamlLines.push(`- assertVisible: "${step.target}"`); break;
          case 'inputText': yamlLines.push(`- inputText: "${step.value || 'test'}"`); break;
          case 'waitFor': yamlLines.push('- waitForAnimationToEnd'); break;
          case 'hideKeyboard': yamlLines.push('- hideKeyboard'); break;
          case 'pressKey': yamlLines.push(`- pressKey: ${step.target}`); break;
        }
      }
      return yamlLines.join('\n');
    }).join('\n\n');
    
    const blob = new Blob([content], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-pages-${Date.now()}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const enabledCount = steps.filter(s => s.enabled).length;
  const yaml = generateYaml();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Page Automation</h1>
          <p className="text-muted-foreground">Capture → Validate → Save → Next Page</p>
        </div>
        <div className="flex gap-2">
          {savedPages.length > 0 && (
            <Button variant="outline" onClick={downloadAll}>
              <Download className="w-4 h-4 mr-2" />
              Download All ({savedPages.length})
            </Button>
          )}
        </div>
      </div>

      {/* Saved pages summary */}
      {savedPages.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Saved Pages ({savedPages.length})</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {savedPages.map(p => (
                <Badge key={p.id} variant="outline" className="px-3 py-1">
                  <CheckCircle2 className="w-3 h-3 mr-1 text-green-500" />
                  {p.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Suite selector */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium whitespace-nowrap">Test Suite:</span>
            <select
              value={selectedSuiteId}
              onChange={(e) => setSelectedSuiteId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">-- None (save to Mac only) --</option>
              {loadingSuites ? (
                <option disabled>Loading...</option>
              ) : (
                suites.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))
              )}
            </select>
          </div>
          {selectedSuiteId && suiteFlows.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground mb-2">Flows in suite ({suiteFlows.length}):</p>
              <div className="flex flex-wrap gap-1">
                {suiteFlows.map(f => (
                  <Badge key={f.id} variant="outline" className="text-xs px-2 py-0.5">
                    {f.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Capture bar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <Input
              placeholder="App ID"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              className="flex-1"
            />
            <Button onClick={captureScreen} disabled={capturing}>
              {capturing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Smartphone className="w-4 h-4 mr-2" />}
              {capturing ? 'Capturing...' : 'Capture Screen'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            💡 Navigate to the desired screen on device first. Dismiss keyboard manually, then click Capture.
          </p>
        </CardContent>
      </Card>

      {/* Main area */}
      {viewMode === 'edit' && elements.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Captured elements */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">UI Elements ({elements.length})</CardTitle>
                <Badge variant="outline">{elements.filter(e => e.clickable).length} clickable</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                {elements.map((el, idx) => {
                  const isInput = el.className?.includes('EditText') || el.className?.includes('ImageView');
                  const isButton = el.className?.includes('Button') || (el.clickable && el.text?.length < 20);
                  return (
                    <div 
                      key={idx} 
                      className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer border border-transparent hover:border-primary/50 transition-colors"
                      onClick={() => {
                        if (isInput) {
                          // Input field - ask for label text and type value
                          // Labels are most reliable for Flutter apps
                          const defaultLabel = el.text || '';
                          const label = prompt(
                            `Text to tap before typing (label shown on screen):\n(e.g. "Personal Number", "Password", "Email")\n\nNote: Tapping the label usually focuses the input field.`,
                            defaultLabel
                          );
                          if (label) {
                            addStep('tapOn', label, `Tap ${label} label to focus`);
                            const val = prompt(`Text to type:`, '');
                            if (val) {
                              addStep('inputText', val, `Type '${val}'`);
                            }
                          }
                        } else {
                          // Button or text - just tap and assert
                          addStep('tapOn', el.text, `Tap ${el.text}`);
                          addStep('assertVisible', el.text, `Verify ${el.text} is visible`);
                        }
                      }}
                    >
                      <Badge variant="outline" className={`text-xs ${
                        isInput ? 'bg-yellow-100 text-yellow-800' : isButton ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {isInput ? 'Input' : isButton ? 'Button' : 'Text'}
                      </Badge>
                      <span className="flex-1 text-sm truncate">{el.text || '(no text)'}</span>
                      {el.bounds && (
                        <span className="text-xs text-muted-foreground">
                          {(() => {
                            if (typeof el.bounds === 'string' && el.bounds.startsWith('{')) {
                              try {
                                const parsed = JSON.parse(el.bounds);
                                if (parsed.resourceId) return `id: ${parsed.resourceId}`;
                                if (parsed.coords) return parsed.coords;
                              } catch { return el.bounds; }
                            }
                            return typeof el.bounds === 'string' ? el.bounds : '';
                          })()}
                        </span>
                      )}
                      <span className="text-xs text-primary">+ Add</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Right: Steps editor */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Page: <Input value={pageName} onChange={(e) => setPageName(e.target.value)} className="inline-block w-40 h-7 text-sm ml-2" />
                  <label className="ml-4 inline-flex items-center gap-1 text-sm text-muted-foreground">
                    <input type="checkbox" checked={includeLaunch} onChange={(e) => setIncludeLaunch(e.target.checked)} className="rounded" />
                    Include `launchApp` in YAML
                  </label>
                </CardTitle>
                <div className="flex gap-1">
                  <Button variant={viewMode === 'edit' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('edit')}>
                    <Edit3 className="w-3 h-3" />
                  </Button>
                  <Button variant={viewMode === 'yaml' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('yaml')}>
                    <Eye className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {viewMode === 'edit' ? (
                <>
                  {/* Steps list */}
                  <div className="space-y-1 max-h-[400px] overflow-y-auto mb-3">
                    {steps.map((step, idx) => (
                      <div key={step.id} className={`flex items-center gap-2 p-2 rounded border ${
                        step.enabled ? 'bg-muted/50' : 'bg-muted/20 opacity-50'
                      }`}>
                        <input
                          type="checkbox"
                          checked={step.enabled}
                          onChange={() => toggleStep(step.id)}
                          className="rounded"
                        />
                        <span className="text-xs w-5 text-center text-muted-foreground">{idx + 1}</span>
                        <Badge variant="outline" className="text-xs w-20 justify-center">
                          {step.action}
                        </Badge>
                        {step.action === 'inputText' ? (
                          <Input
                            value={editStepValue[step.id] || step.value || ''}
                            onChange={(e) => updateStepValue(step.id, e.target.value)}
                            placeholder="Enter value..."
                            className="flex-1 h-7 text-sm"
                          />
                        ) : (
                          <span className="flex-1 text-sm font-mono truncate">{step.target}</span>
                        )}
                        <button onClick={() => removeStep(step.id)} className="text-muted-foreground hover:text-red-500">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add manual steps */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    <Button variant="outline" size="sm" onClick={() => addManualStep('tapOn', '')}>
                      + tapOn
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => addManualStep('assertVisible', '')}>
                      + assertVisible
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => addManualStep('inputText', '')}>
                      + inputText
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => addManualStep('hideKeyboard', '')}>
                      + hideKeyboard
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => addManualStep('waitFor', '')}>
                      + waitFor
                    </Button>
                  </div>

                  {/* Save & next */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {enabledCount} of {steps.length} steps enabled
                    </span>
                    <Button onClick={savePage} disabled={saving || enabledCount === 0}>
                      {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                      Save & Next Page
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </>
              ) : (
                <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs font-mono max-h-[500px] overflow-y-auto whitespace-pre">
                  {yaml}
                </pre>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {viewMode === 'capture' && elements.length === 0 && !capturing && (
        <Card>
          <CardContent className="pt-12 text-center">
            <Smartphone className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Ready to Capture</h3>
            <p className="text-muted-foreground mb-4">
              Click "Capture Screen" to load current UI elements from device
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PageAutomation;
