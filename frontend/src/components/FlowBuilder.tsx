import React, { useState, useCallback } from 'react';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { 
  Smartphone, RefreshCw, Save, Download, Play, Trash2, 
  ChevronDown, ChevronUp, Plus, X, Eye, Edit3, Loader2 
} from 'lucide-react';

export interface HierarchyElement {
  text: string;
  hint?: string;
  resourceId?: string;
  className?: string;
  clickable: boolean;
  enabled: boolean;
  scrollable: boolean;
  bounds?: string;
}

export interface FlowStep {
  id: string;
  type: 'tapOn' | 'assertVisible' | 'inputText' | 'waitFor' | 'pressKey' | 'scroll' | 'hideKeyboard' | 'comment';
  value: string;
  comment?: string;
}

export interface Flow {
  id: string;
  name: string;
  appId: string;
  steps: FlowStep[];
}

const FlowBuilder: React.FC = () => {
  // State
  const [appId, setAppId] = useState('com.disciplinetracker.app');
  const [elements, setElements] = useState<HierarchyElement[]>([]);
  const [loading, setLoading] = useState(false);
  const [flows, setFlows] = useState<Flow[]>([
    { id: '1', name: 'my_flow', appId, steps: [] }
  ]);
  const [activeFlowId, setActiveFlowId] = useState('1');
  const [expandedElements, setExpandedElements] = useState(false);
  const [showYaml, setShowYaml] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newStepType, setNewStepType] = useState<FlowStep['type']>('tapOn');
  const [newStepValue, setNewStepValue] = useState('');
  const [inputMode, setInputMode] = useState(false);
  const [inputTarget, setInputTarget] = useState('');

  const activeFlow = flows.find(f => f.id === activeFlowId) || flows[0];

  // Capture hierarchy
  const captureHierarchy = async () => {
    setLoading(true);
    try {
      const resp = await api.get('/maestro/hierarchy', { params: { appId } });
      setElements(resp.data?.data?.elements || []);
      setExpandedElements(true);
    } catch (err) {
      console.error('Failed to capture hierarchy:', err);
      alert('Failed to capture hierarchy. Make sure device is connected and screen is unlocked.');
    } finally {
      setLoading(false);
    }
  };

  // Add step to flow
  const addStep = useCallback((type: FlowStep['type'], value: string, comment?: string) => {
    setFlows(prev => prev.map(f => {
      if (f.id !== activeFlowId) return f;
      return {
        ...f,
        steps: [...f.steps, { id: Date.now().toString(), type, value, comment }],
      };
    }));
  }, [activeFlowId]);

  // Remove step
  const removeStep = (stepId: string) => {
    setFlows(prev => prev.map(f => {
      if (f.id !== activeFlowId) return f;
      return { ...f, steps: f.steps.filter(s => s.id !== stepId) };
    }));
  };

  // Move step
  const moveStep = (stepId: string, direction: 'up' | 'down') => {
    setFlows(prev => prev.map(f => {
      if (f.id !== activeFlowId) return f;
      const idx = f.steps.findIndex(s => s.id === stepId);
      if (idx < 0) return f;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= f.steps.length) return f;
      const newSteps = [...f.steps];
      [newSteps[idx], newSteps[newIdx]] = [newSteps[newIdx], newSteps[idx]];
      return { ...f, steps: newSteps };
    }));
  };

  // Add new flow
  const addFlow = () => {
    const id = Date.now().toString();
    setFlows(prev => [...prev, { id, name: `flow_${prev.length + 1}`, appId, steps: [] }]);
    setActiveFlowId(id);
  };

  // Remove flow
  const removeFlow = (flowId: string) => {
    if (flows.length <= 1) return;
    setFlows(prev => prev.filter(f => f.id !== flowId));
    if (activeFlowId === flowId) {
      setActiveFlowId(flows.find(f => f.id !== flowId)?.id || '');
    }
  };

  // Generate YAML
  const generateYaml = (flow: Flow): string => {
    const lines = [`appId: ${flow.appId}`, '---'];
    
    // Always start with launchApp if not already present
    const hasLaunch = flow.steps.some(s => s.type === 'launchApp' || s.value === 'launchApp');
    if (!hasLaunch) {
      lines.push('- launchApp');
      lines.push('- waitForAnimationToEnd');
    }
    
    for (const step of flow.steps) {
      switch (step.type) {
        case 'tapOn':
          if (step.value.match(/^\d+%,\d+%/)) {
            lines.push(`- tapOn:\n    point: "${step.value}"`);
          } else {
            lines.push(`- tapOn: "${step.value}"`);
          }
          break;
        case 'assertVisible':
          // Skip assertVisible for submit buttons (screen changes after tap)
          if (step.value.match(/^(masuk|login|submit|lanjut|continue|daftar|enter)$/i)) continue;
          lines.push(`- assertVisible: "${step.value}"`);
          break;
        case 'inputText':
          lines.push(`- inputText: "${step.value}"`);
          break;
        case 'waitFor':
          lines.push('- waitForAnimationToEnd');
          break;
        case 'pressKey':
          lines.push(`- pressKey: ${step.value}`);
          break;
        case 'scroll':
          lines.push('- scroll');
          break;
        case 'hideKeyboard':
          lines.push('- hideKeyboard');
          break;
        case 'comment':
          lines.push(`# ${step.value}`);
          break;
      }
    }
    
    // Auto-add hideKeyboard before last tapOn if there were inputText steps
    const hasInput = flow.steps.some(s => s.type === 'inputText');
    const lastStep = lines[lines.length - 1];
    if (hasInput && lastStep?.startsWith('- tapOn:')) {
      // Insert hideKeyboard before the last tapOn
      const hideKeyboardLine = '- hideKeyboard';
      lines.splice(lines.length - 1, 0, hideKeyboardLine);
    }
    
    // End with waitFor if not already present
    if (!lines[lines.length - 1]?.includes('waitFor')) {
      lines.push('- waitForAnimationToEnd');
    }
    
    return lines.join('\n');
  };

  // Save flows
  const saveFlows = async () => {
    setSaving(true);
    try {
      const yamlFlows = flows.map(f => ({ name: f.name, yaml: generateYaml(f) }));
      await api.post('/maestro/flows', { appId, flows: yamlFlows, clearFirst: true });
      alert(`${yamlFlows.length} flow(s) saved to Mac runner!`);
    } catch (err) {
      console.error('Failed to save flows:', err);
      alert('Failed to save flows. Check console for details.');
    } finally {
      setSaving(false);
    }
  };

  // Click element → add step
  const handleElementClick = (el: HierarchyElement) => {
    const isInput = el.className?.includes('EditText') || el.className?.includes('TextInput');
    const coords = el.bounds?.match(/^\d+%,\d+%$/) ? el.bounds : null;
    
    if (isInput && coords) {
      // For coordinate-based inputs, use tapOn with coordinates
      const value = prompt(`Enter text to type (will tap at ${coords} first):`);
      if (value) {
        addStep('tapOn', coords, `Tap input at ${coords}`);
        addStep('inputText', value, `Type '${value}'`);
      }
    } else if (isInput) {
      // Fallback: use the element text
      const value = prompt(`Enter text to type into "${el.text}":`);
      if (value) {
        addStep('tapOn', el.text, `Tap ${el.text}`);
        addStep('inputText', value, `Type '${value}'`);
      }
    } else if (inputMode && inputTarget) {
      addStep('inputText', el.text, `Input '${inputTarget}' into ${el.text}`);
      addStep('tapOn', el.text, `Tap ${el.text} to focus`);
      setInputMode(false);
      setInputTarget('');
    } else {
      addStep('tapOn', el.text, `Tap ${el.text}`);
      addStep('assertVisible', el.text, `Verify ${el.text} is visible`);
    }
  };

  // Manual step
  const addManualStep = () => {
    if (!newStepValue) return;
    addStep(newStepType, newStepValue);
    setNewStepValue('');
  };

  // Element type badge
  const getElementBadge = (el: HierarchyElement): { label: string; color: string } => {
    if (el.className?.includes('EditText') || el.className?.includes('TextInput')) return { label: 'Input', color: 'bg-yellow-100 text-yellow-800' };
    if (el.clickable && el.className?.includes('Button')) return { label: 'Button', color: 'bg-blue-100 text-blue-800' };
    if (el.clickable) return { label: 'Tappable', color: 'bg-green-100 text-green-800' };
    if (el.className?.includes('Scroll')) return { label: 'Scroll', color: 'bg-purple-100 text-purple-800' };
    return { label: 'Text', color: 'bg-gray-100 text-gray-800' };
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Flow Builder</h1>
          <p className="text-muted-foreground">Point &amp; click to build Maestro flows</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowYaml(!showYaml)}>
            <Eye className="w-4 h-4 mr-2" />
            {showYaml ? 'Hide' : 'Show'} YAML
          </Button>
          <Button variant="outline" onClick={() => {
            const blob = new Blob([generateYaml(activeFlow)], { type: 'text/yaml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${activeFlow.name}.yaml`;
            a.click();
            URL.revokeObjectURL(url);
          }}>
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
          <Button onClick={saveFlows} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save to Mac
          </Button>
        </div>
      </div>

      {/* App ID + Capture */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                placeholder="App ID (e.g. com.example.app)"
                value={appId}
                onChange={(e) => {
                  setAppId(e.target.value);
                  setFlows(prev => prev.map(f => ({ ...f, appId: e.target.value })));
                }}
              />
            </div>
            <Button onClick={captureHierarchy} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Smartphone className="w-4 h-4 mr-2" />}
              Capture Screen
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Hierarchy Panel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>UI Elements ({elements.length})</span>
              {elements.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setExpandedElements(!expandedElements)}>
                  {expandedElements ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {elements.length === 0 && !loading && (
              <p className="text-center text-muted-foreground py-8 text-sm">
                Click "Capture Screen" to load UI elements
              </p>
            )}
            {loading && (
              <div className="text-center py-8">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Capturing hierarchy...</p>
              </div>
            )}
            {expandedElements && elements.length > 0 && (
              <div className="space-y-1 max-h-[600px] overflow-y-auto">
                {elements.map((el, idx) => {
                  const badge = getElementBadge(el);
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer border border-transparent hover:border-primary/50 transition-colors"
                      onClick={() => handleElementClick(el)}
                    >
                      <Badge variant="outline" className={`text-xs ${badge.color}`}>
                        {badge.label}
                      </Badge>
                      <span className="flex-1 text-sm font-medium truncate">{el.text}</span>
                      {el.hint && (
                        <span className="text-xs text-muted-foreground truncate max-w-[120px]">{el.hint}</span>
                      )}
                      <Plus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Flow Editor */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Flow Editor</CardTitle>
              <div className="flex gap-1">
                {flows.map(f => (
                  <div key={f.id} className="flex items-center gap-1">
                    <button
                      className={`px-2 py-1 text-xs rounded ${
                        f.id === activeFlowId 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                      onClick={() => setActiveFlowId(f.id)}
                    >
                      {f.name}
                    </button>
                    {flows.length > 1 && (
                      <button
                        className="text-muted-foreground hover:text-red-500"
                        onClick={() => removeFlow(f.id)}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={addFlow}>
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Manual step input */}
            <div className="flex gap-2 mb-3">
              <select
                value={newStepType}
                onChange={(e) => setNewStepType(e.target.value as FlowStep['type'])}
                className="border rounded px-2 py-1 text-sm w-36"
              >
                <option value="tapOn">tapOn</option>
                <option value="assertVisible">assertVisible</option>
                <option value="inputText">inputText</option>
                <option value="waitFor">waitFor</option>
                <option value="hideKeyboard">hideKeyboard</option>
                <option value="pressKey">pressKey</option>
                <option value="scroll">scroll</option>
                <option value="comment">comment</option>
              </select>
              <Input
                placeholder="Value..."
                value={newStepValue}
                onChange={(e) => setNewStepValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addManualStep()}
                className="flex-1 text-sm"
              />
              <Button size="sm" onClick={addManualStep}>
                <Plus className="w-3 h-3" />
              </Button>
            </div>

            {/* Steps list */}
            {activeFlow.steps.length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">
                Click UI elements above or add steps manually
              </p>
            )}
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {activeFlow.steps.map((step, idx) => (
                <div key={step.id} className="flex items-center gap-2 p-2 rounded bg-muted/50">
                  <span className="text-xs text-muted-foreground w-6 text-right">{idx + 1}</span>
                  <Badge variant="outline" className="text-xs w-24 justify-center">
                    {step.type}
                  </Badge>
                  <span className="flex-1 text-sm font-mono truncate">{step.value}</span>
                  {step.comment && (
                    <span className="text-xs text-muted-foreground truncate max-w-[100px]">{step.comment}</span>
                  )}
                  <div className="flex gap-1">
                    <button onClick={() => moveStep(step.id, 'up')} className="text-muted-foreground hover:text-foreground">
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button onClick={() => moveStep(step.id, 'down')} className="text-muted-foreground hover:text-foreground">
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    <button onClick={() => removeStep(step.id)} className="text-muted-foreground hover:text-red-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* YAML Preview */}
            {showYaml && activeFlow.steps.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">YAML Preview</h4>
                <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs font-mono max-h-[300px] overflow-y-auto whitespace-pre">
                  {generateYaml(activeFlow)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default FlowBuilder;
