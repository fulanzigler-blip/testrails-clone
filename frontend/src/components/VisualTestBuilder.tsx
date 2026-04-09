import React, { useState, useCallback, useEffect } from 'react';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Scan, Play, Loader2, CheckCircle2, XCircle, GripVertical,
  FileText,
  Type, MousePointerClick, Clock, Terminal, Code2, AlertTriangle,
  Eye, EyeOff, ArrowUp, ArrowDown, Plus, Trash2,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ScreenElement {
  name: string;
  file: string;
  route?: string;
  inputs: { id: string; label: string; type: string; hasOnFieldSubmitted: boolean }[];
  buttons: { id: string; text: string; type: string; action?: string }[];
  texts: { id: string; text: string }[];
}

interface ElementCatalog {
  packageName: string;
  projectPath: string;
  scannedAt: string;
  screens: ScreenElement[];
  inputs: { id: string; label: string; type: string; screen?: string; hasOnFieldSubmitted: boolean }[];
  buttons: { id: string; text: string; type: string; screen?: string; action?: string }[];
  texts: { id: string; text: string; screen?: string; isStatic: boolean }[];
  auth?: { flow: 'tap' | 'onFieldSubmitted'; loginButton?: string; credentials: { email: string; password: string; role: string }[] };
  routes: string[];
}

interface TestStep {
  id: string;
  type: 'enter_text' | 'tap' | 'double_tap' | 'long_press' | 'scroll' | 'scroll_until_visible' | 'send_key' | 'hide_keyboard' | 'assert_visible' | 'assert_not_visible' | 'assert_text' | 'wait' | 'screenshot' | 'set_surface_size';
  elementId?: string;
  value?: string;
  text?: string;
  value2?: string; // For surface size width or scroll dy
}

interface TestResult {
  success: boolean;
  output: string;
  duration: number;
}

const STEP_CATEGORIES = [
  {
    name: 'Interactions',
    icon: MousePointerClick,
    color: 'bg-green-500',
    steps: [
      { type: 'enter_text' as const, label: 'Enter Text', icon: Type, desc: 'Enter text into a field' },
      { type: 'tap' as const, label: 'Tap', icon: MousePointerClick, desc: 'Tap a button or element' },
      { type: 'double_tap' as const, label: 'Double Tap', icon: MousePointerClick, desc: 'Double-tap an element' },
      { type: 'long_press' as const, label: 'Long Press', icon: Clock, desc: 'Long-press an element' },
    ],
  },
  {
    name: 'Navigation',
    icon: MousePointerClick,
    color: 'bg-blue-500',
    steps: [
      { type: 'scroll' as const, label: 'Scroll', icon: ArrowDown, desc: 'Scroll by offset (dx, dy)' },
      { type: 'scroll_until_visible' as const, label: 'Scroll Until Visible', icon: Eye, desc: 'Scroll until element is visible' },
      { type: 'send_key' as const, label: 'Send Key', icon: ArrowUp, desc: 'Send key event (Back, Enter, etc)' },
      { type: 'hide_keyboard' as const, label: 'Hide Keyboard', icon: EyeOff, desc: 'Dismiss the on-screen keyboard' },
    ],
  },
  {
    name: 'Assertions',
    icon: Eye,
    color: 'bg-purple-500',
    steps: [
      { type: 'assert_visible' as const, label: 'Assert Visible', icon: Eye, desc: 'Verify element is visible' },
      { type: 'assert_not_visible' as const, label: 'Assert Not Visible', icon: EyeOff, desc: 'Verify element is hidden' },
      { type: 'assert_text' as const, label: 'Assert Text Contains', icon: Type, desc: 'Verify text contains a string' },
    ],
  },
  {
    name: 'Utilities',
    icon: Clock,
    color: 'bg-gray-500',
    steps: [
      { type: 'wait' as const, label: 'Wait', icon: Clock, desc: 'Wait for N seconds' },
      { type: 'screenshot' as const, label: 'Take Screenshot', icon: Eye, desc: 'Capture screenshot at this step' },
      { type: 'set_surface_size' as const, label: 'Set Surface Size', icon: Type, desc: 'Set device viewport size' },
    ],
  },
];

const STEP_TYPES = STEP_CATEGORIES.flatMap(cat => cat.steps);

const TEMPLATES = [
  {
    name: 'Login Flow',
    icon: '🔐',
    build: (catalog: ElementCatalog): TestStep[] => {
      let emailInput = catalog.inputs.find(i => i.label.toLowerCase().includes('email') || i.label.toLowerCase().includes('username'));
      let passInput = catalog.inputs.find(i => i.label.toLowerCase().includes('password'));
      if (!emailInput && catalog.inputs.length > 0) emailInput = catalog.inputs[0];
      if (!passInput && catalog.inputs.length > 1) passInput = catalog.inputs[1];

      const loginBtn = catalog.buttons.find(b => b.action?.includes('login')) || catalog.buttons[0];
      const cred = catalog.auth?.credentials?.[0];
      const steps: TestStep[] = [];
      if (emailInput) steps.push({ id: `s_${Date.now()}_1`, type: 'enter_text', elementId: emailInput.id, value: cred?.email || '' });
      if (passInput) steps.push({ id: `s_${Date.now()}_2`, type: 'enter_text', elementId: passInput.id, value: cred?.password || '' });
      // Always tap the login button — works on all apps (tap dismisses keyboard on real device)
      if (loginBtn) steps.push({ id: `s_${Date.now()}_3`, type: 'tap', elementId: loginBtn.id });
      // Optional: verify login succeeded
      if (loginBtn) steps.push({ id: `s_${Date.now()}_4`, type: 'assert_not_visible', elementId: loginBtn.id });
      return steps;
    },
  },
  {
    name: 'Login + Dashboard',
    icon: '📊',
    build: (catalog: ElementCatalog): TestStep[] => {
      let emailInput = catalog.inputs.find(i => i.label.toLowerCase().includes('email') || i.label.toLowerCase().includes('username'));
      let passInput = catalog.inputs.find(i => i.label.toLowerCase().includes('password'));
      if (!emailInput && catalog.inputs.length > 0) emailInput = catalog.inputs[0];
      if (!passInput && catalog.inputs.length > 1) passInput = catalog.inputs[1];

      const loginBtn = catalog.buttons.find(b => b.action?.includes('login')) || catalog.buttons[0];
      const dashboardText = catalog.texts.find(t => t.text.toLowerCase().includes('dashboard'));
      const cred = catalog.auth?.credentials?.find(c => c.role === 'manager') || catalog.auth?.credentials?.[0];
      const steps: TestStep[] = [];
      if (emailInput) steps.push({ id: `s_${Date.now()}_1`, type: 'enter_text', elementId: emailInput.id, value: cred?.email || '' });
      if (passInput) steps.push({ id: `s_${Date.now()}_2`, type: 'enter_text', elementId: passInput.id, value: cred?.password || '' });
      if (loginBtn) steps.push({ id: `s_${Date.now()}_3`, type: 'tap', elementId: loginBtn.id });
      steps.push({ id: `s_${Date.now()}_4`, type: 'wait', value: '2' });
      if (dashboardText) steps.push({ id: `s_${Date.now()}_5`, type: 'assert_visible', elementId: dashboardText.id });
      return steps;
    },
  },
];

// ─── Step Row Component ────────────────────────────────────────────────────────

const StepRow: React.FC<{
  step: TestStep;
  index: number;
  total: number;
  catalog: ElementCatalog | null;
  onUpdate: (id: string, updates: Partial<TestStep>) => void;
  onDelete: (id: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}> = ({ step, index, total, catalog, onUpdate, onDelete, onMoveUp, onMoveDown }) => {
  const stepDef = STEP_TYPES.find(s => s.type === step.type);
  const Icon = stepDef?.icon || Type;

  const renderControls = () => {
    switch (step.type) {
      case 'enter_text':
        return (
          <div className="flex gap-2 mt-2">
            <select
              className="flex-1 rounded border px-3 py-2 text-sm bg-background min-w-0"
              value={step.elementId || ''}
              onChange={(e) => onUpdate(step.id, { elementId: e.target.value })}
            >
              <option value="">Select input field...</option>
              {catalog?.screens.filter(s => (s.inputs?.length || 0) > 0).map(screen => (
                <optgroup key={screen.name} label={`📱 ${screen.name}`}>
                  {(screen.inputs || []).map(inp => (
                    <option key={inp.id} value={inp.id}>{inp.label || inp.id} ({inp.type}){inp.hasOnFieldSubmitted ? ' ⚡' : ''}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <Input placeholder="Value to enter" value={step.value || ''} onChange={(e) => onUpdate(step.id, { value: e.target.value })} className="flex-1 text-base py-2" />
          </div>
        );
      case 'tap':
        return (
          <div className="flex gap-2 mt-2">
            <select
              className="flex-1 rounded border px-3 py-2 text-sm bg-background"
              value={step.elementId || ''}
              onChange={(e) => onUpdate(step.id, { elementId: e.target.value })}
            >
              <option value="">Select button...</option>
              {catalog?.screens.filter(s => (s.buttons?.length || 0) > 0).map(screen => (
                <optgroup key={screen.name} label={`📱 ${screen.name}`}>
                  {(screen.buttons || []).map(btn => (
                    <option key={btn.id} value={btn.id}>"{btn.text}" ({btn.type})</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {catalog?.auth?.flow === 'onFieldSubmitted' && (
              <Badge variant="outline" className="text-xs self-center">⚡ prev field auto-submits</Badge>
            )}
          </div>
        );
      case 'hide_keyboard':
        return (
          <div className="mt-1 text-xs text-muted-foreground">
            Submits form via keyboard "Done" using <code className="bg-muted px-1 rounded">receiveAction(TextInputAction.done)</code>
          </div>
        );
      case 'double_tap':
      case 'long_press':
        return (
          <div className="flex gap-2 mt-2">
            <select
              className="flex-1 rounded border px-3 py-2 text-sm bg-background"
              value={step.elementId || ''}
              onChange={(e) => onUpdate(step.id, { elementId: e.target.value })}
            >
              <option value="">Select element...</option>
              {catalog?.screens.filter(s => (s.buttons?.length || 0) > 0).map(screen => (
                <optgroup key={screen.name} label={`📱 ${screen.name}`}>
                  {(screen.buttons || []).map(btn => (
                    <option key={btn.id} value={btn.id}>"{btn.text}"</option>
                  ))}
                  {(screen.texts || []).slice(0, 15).map(txt => (
                    <option key={txt.id} value={txt.id}>"{txt.text}"</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        );
      case 'scroll':
        return (
          <div className="flex gap-2 mt-2 items-center">
            <span className="text-sm text-muted-foreground">dy:</span>
            <Input type="number" value={step.value || '-300'} onChange={(e) => onUpdate(step.id, { value: e.target.value })} className="w-20 text-sm" />
            <span className="text-sm text-muted-foreground">dx:</span>
            <Input type="number" value={step.value2 || '0'} onChange={(e) => onUpdate(step.id, { value2: e.target.value })} className="w-20 text-sm" />
          </div>
        );
      case 'scroll_until_visible':
        return (
          <div className="flex gap-2 mt-2">
            <select
              className="flex-1 rounded border px-3 py-2 text-sm bg-background"
              value={step.elementId || ''}
              onChange={(e) => onUpdate(step.id, { elementId: e.target.value })}
            >
              <option value="">Select target element...</option>
              {catalog?.screens.filter(s => (s.texts?.length || 0) > 0 || (s.buttons?.length || 0) > 0).map(screen => (
                <optgroup key={screen.name} label={`📱 ${screen.name}`}>
                  {(screen.buttons || []).map(btn => (
                    <option key={btn.id} value={btn.id}>"{btn.text}"</option>
                  ))}
                  {(screen.texts || []).slice(0, 20).map(txt => (
                    <option key={txt.id} value={txt.id}>"{txt.text}"</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        );
      case 'send_key':
        return (
          <div className="flex gap-2 mt-2">
            <select
              className="flex-1 rounded border px-3 py-2 text-sm bg-background"
              value={step.value || ''}
              onChange={(e) => onUpdate(step.id, { value: e.target.value })}
            >
              <option value="">Select key...</option>
              <optgroup label="Keyboard">
                <option value="receiveAction">Submit Form (Done on keyboard)</option>
              </optgroup>
              <optgroup label="Key Events">
                <option value="LogicalKeyboardKey.enter">Enter</option>
                <option value="LogicalKeyboardKey.escape">Escape</option>
                <option value="LogicalKeyboardKey.tab">Tab</option>
                <option value="LogicalKeyboardKey.delete">Delete</option>
                <option value="LogicalKeyboardKey.backspace">Backspace</option>
              </optgroup>
            </select>
          </div>
        );
      case 'assert_text':
        return (
          <div className="flex gap-2 mt-2">
            <Input placeholder="Text to search for" value={step.text || ''} onChange={(e) => onUpdate(step.id, { text: e.target.value })} className="flex-1 text-sm" />
          </div>
        );
      case 'screenshot':
        return (
          <div className="mt-1 text-xs text-muted-foreground">
            Captures a screenshot and saves it to test output <code className="bg-muted px-1 rounded">binding.takeScreenshot('name')</code>
          </div>
        );
      case 'set_surface_size':
        return (
          <div className="flex gap-2 mt-2 items-center">
            <span className="text-sm text-muted-foreground">W:</span>
            <Input type="number" value={step.value || '375'} onChange={(e) => onUpdate(step.id, { value: e.target.value })} className="w-20 text-sm" />
            <span className="text-sm text-muted-foreground">H:</span>
            <Input type="number" value={step.value2 || '812'} onChange={(e) => onUpdate(step.id, { value2: e.target.value })} className="w-20 text-sm" />
          </div>
        );
      case 'assert_visible':
      case 'assert_not_visible':
        return (
          <div className="flex gap-2 mt-2">
            <select
              className="flex-1 rounded border px-3 py-2 text-sm bg-background"
              value={step.elementId || ''}
              onChange={(e) => onUpdate(step.id, { elementId: e.target.value })}
            >
              <option value="">Select text/button...</option>
              {catalog?.screens.filter(s => ((s.buttons?.length || 0) > 0 || (s.texts?.length || 0) > 0)).map(screen => (
                <optgroup key={screen.name} label={`📱 ${screen.name}`}>
                  {(screen.buttons || []).map(btn => (
                    <option key={btn.id} value={btn.id}>"{btn.text}"</option>
                  ))}
                  {(screen.texts || []).slice(0, 15).map(txt => (
                    <option key={txt.id} value={txt.id}>"{txt.text}"</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        );
      case 'wait':
        return (
          <div className="flex gap-2 mt-2 items-center">
            <span className="text-sm text-muted-foreground">Wait</span>
            <Input type="number" value={step.value || '2'} onChange={(e) => onUpdate(step.id, { value: e.target.value })} className="w-24 text-base py-2" min="1" max="30" />
            <span className="text-sm text-muted-foreground">seconds</span>
          </div>
        );
    }
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded border bg-background transition-all hover:shadow-sm">
      <div className="flex flex-col items-center gap-0.5 text-muted-foreground cursor-grab active:cursor-grabbing select-none">
        <ArrowUp className="w-3 h-3 hover:text-primary" onClick={() => onMoveUp(index)} />
        <GripVertical className="w-4 h-4" />
        <ArrowDown className="w-3 h-3 hover:text-primary" onClick={() => onMoveDown(index)} />
      </div>
      <div className={`w-8 h-8 rounded ${stepDef?.color} flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{stepDef?.label}</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onDelete(step.id)}>
            <Trash2 className="w-3 h-3 text-red-500" />
          </Button>
        </div>
        {renderControls()}
      </div>
      <span className="text-xs text-muted-foreground self-center">#{index + 1}</span>
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────

const VisualTestBuilder: React.FC = () => {
  const [catalog, setCatalog] = useState<ElementCatalog | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [runners, setRunners] = useState<Array<{id: string; name: string; host: string; deviceId?: string; isDefault: boolean}>>([]);
  const [selectedRunner, setSelectedRunner] = useState<string>('');
  const [steps, setSteps] = useState<TestStep[]>([]);
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [generatedCode, setGeneratedCode] = useState('');
  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);
  const [noBuild, setNoBuild] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState('');
  const [savingTestCase, setSavingTestCase] = useState(false);
  const [savedTestCase, setSavedTestCase] = useState<{id: string; title: string} | null>(null);

  // Load runners on mount (no auto-scan)
  useEffect(() => {
    const load = async () => {
      try {
        const resp = await api.get('/integration-tests/runners');
        const list = resp.data?.data || resp.data || [];
        setRunners(list);
        const def = list.find((r: any) => r.isDefault) || list[0];
        if (def) setSelectedRunner(def.id);
      } catch {}
    };
    load();
  }, []);

  const handleScan = async () => {
    setScanning(true);
    setScanError('');
    try {
      const payload = selectedRunner ? { runnerId: selectedRunner } : {};
      const resp = await api.post('/integration-tests/scan', payload);
      setCatalog(resp.data?.data || resp.data);
    } catch (err: any) {
      setScanError(err.response?.data?.error?.message || err.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const addStep = useCallback((type: string) => {
    const newStep: TestStep = { id: `step_${Date.now()}`, type: type as TestStep['type'] };
    if (type === 'wait') newStep.value = '2';
    setSteps(prev => [...prev, newStep]);
  }, []);

  const moveStep = (index: number, direction: 'up' | 'down') => {
    setSteps(prev => {
      const updated = [...prev];
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= updated.length) return prev;
      [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
      return updated;
    });
  };

  const updateStep = (id: string, updates: Partial<TestStep>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const deleteStep = (id: string) => setSteps(prev => prev.filter(s => s.id !== id));

  const applyTemplate = (buildFn: (cat: ElementCatalog) => TestStep[]) => {
    if (!catalog) { setScanError('Scan the project first'); return; }
    setSteps(buildFn(catalog));
  };

  const handleGenerate = async () => {
    if (steps.length === 0) { setError('Add at least one step'); return; }
    setGenerating(true);
    setError('');
    try {
      const resp = await api.post('/integration-tests/generate-deterministic', {
        steps,
        credentials: credentials.email ? { email: credentials.email, password: credentials.password } : undefined,
      });
      setGeneratedCode(resp.data?.data?.dartCode || '');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleRun = async () => {
    if (!generatedCode) { setError('Generate code first'); return; }
    setRunning(true);
    setError('');
    setTestResult(null);
    setSavedTestCase(null);
    try {
      const resp = await api.post('/integration-tests/run-generated', {
        dartCode: generatedCode,
        credentials: credentials.email ? { email: credentials.email, password: credentials.password } : undefined,
        noBuild,
        runnerId: selectedRunner || undefined,
      });
      setTestResult({
        success: resp.data?.data?.success ?? resp.data?.success ?? false,
        output: resp.data?.data?.output || resp.data?.output || '',
        duration: resp.data?.data?.duration ?? resp.data?.duration ?? 0,
      });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Run failed');
    } finally {
      setRunning(false);
    }
  };

  const handleSaveAsTestCase = async () => {
    if (!generatedCode) { setError('Generate code first'); return; }
    setSavingTestCase(true);
    setError('');
    try {
      const resp = await api.post('/integration-tests/save-as-testcase', {
        dartCode: generatedCode,
        testResult: testResult ? {
          success: testResult.success,
          output: testResult.output,
          duration: testResult.duration,
        } : undefined,
        runnerId: selectedRunner || undefined,
      });
      const saved = resp.data?.data;
      setSavedTestCase({ id: saved?.id, title: saved?.title });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Save failed');
    } finally {
      setSavingTestCase(false);
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Visual Test Builder</h1>
          <p className="text-muted-foreground">Scan your Flutter app, pick elements, compose test scenarios</p>
        </div>
        <div className="flex items-center gap-3">
          {runners.length > 1 && (
            <select
              value={selectedRunner}
              onChange={(e) => setSelectedRunner(e.target.value)}
              className="rounded border px-3 py-2 text-sm bg-background"
            >
              {runners.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.deviceId ? `(${r.deviceId})` : ''} {r.isDefault ? '★' : ''}
                </option>
              ))}
            </select>
          )}
          <Button onClick={handleScan} disabled={scanning}>
            {scanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Scan className="w-4 h-4 mr-2" />}
            {scanning ? 'Scanning...' : 'Scan Codebase'}
          </Button>
        </div>
      </div>

      {scanError && <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 p-3 rounded"><AlertTriangle className="w-4 h-4" /> {scanError}</div>}

      {/* Catalog Summary */}
      {catalog && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Element Catalog: {catalog.packageName}</CardTitle>
              <div className="flex gap-3">
                <Badge variant="outline">{(catalog.screens || []).length} Screens</Badge>
                <Badge variant="outline">{(catalog.inputs || []).length} Inputs</Badge>
                <Badge variant="outline">{(catalog.buttons || []).length} Buttons</Badge>
                <Badge variant="outline">{(catalog.texts || []).length} Texts</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Credentials */}
            {catalog.auth?.credentials?.length ? (
              <div className="flex gap-2 mb-4">
                <Label className="text-sm self-center">Credentials:</Label>
                {catalog.auth.credentials.map((c, i) => (
                  <Button key={i} variant={credentials.email === c.email ? 'default' : 'outline'} size="sm"
                    onClick={() => setCredentials({ email: c.email, password: c.password })}>
                    {c.role}: {c.email}
                  </Button>
                ))}
              </div>
            ) : (
              <div className="flex gap-2 mb-4">
                <Input placeholder="Email" className="w-48" value={credentials.email} onChange={e => setCredentials(p => ({...p, email: e.target.value}))} />
                <Input placeholder="Password" className="w-48" value={credentials.password} onChange={e => setCredentials(p => ({...p, password: e.target.value}))} />
              </div>
            )}

            {/* Screen-by-screen element list */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(catalog.screens || []).map(screen => (
                <div key={screen.name} className="rounded border bg-muted/20 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold">📱 {screen.name}</span>
                    {screen.route && <Badge variant="outline" className="text-xs">{screen.route}</Badge>}
                  </div>
                  <div className="space-y-2 text-xs">
                    {screen.inputs && screen.inputs.length > 0 && (
                      <div>
                        <div className="text-muted-foreground font-medium mb-1">Inputs ({screen.inputs.length})</div>
                        <div className="space-y-1">
                          {screen.inputs.map(inp => (
                            <div key={inp.id} className="flex items-center gap-1.5 bg-background rounded px-2 py-1">
                              <Type className="w-3 h-3 text-blue-500" />
                              <span className="truncate">{inp.label || inp.id}</span>
                              <span className="text-muted-foreground ml-auto">({inp.type})</span>
                              {inp.hasOnFieldSubmitted && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-amber-50 text-amber-700 border-amber-200">
                                  ⚡ auto-submit
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {screen.buttons && screen.buttons.length > 0 && (
                      <div>
                        <div className="text-muted-foreground font-medium mb-1">Buttons ({screen.buttons.length})</div>
                        <div className="space-y-1">
                          {screen.buttons.map(btn => (
                            <div key={btn.id} className="flex items-center gap-1.5 bg-background rounded px-2 py-1">
                              <MousePointerClick className="w-3 h-3 text-green-500" />
                              <span className="truncate">"{btn.text}"</span>
                              <span className="text-muted-foreground ml-auto">({btn.type})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {screen.texts && screen.texts.length > 0 && (
                      <div>
                        <div className="text-muted-foreground font-medium mb-1">Texts ({screen.texts.length})</div>
                        <div className="flex flex-wrap gap-1">
                          {screen.texts.slice(0, 12).map(txt => (
                            <span key={txt.id} className="bg-background rounded px-1.5 py-0.5 truncate max-w-full">
                              "{txt.text}"
                            </span>
                          ))}
                          {screen.texts.length > 12 && (
                            <span className="text-muted-foreground">+{screen.texts.length - 12} more</span>
                          )}
                        </div>
                      </div>
                    )}
                    {(!screen.inputs?.length && !screen.buttons?.length && !screen.texts?.length) && (
                      <div className="text-muted-foreground">No elements detected</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Builder */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left: Palette + Templates */}
        <div className="col-span-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Step Palette</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-4">
              {STEP_CATEGORIES.map(cat => (
                <div key={cat.name}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-3 h-3 rounded ${cat.color}`} />
                    <span className="text-xs font-semibold text-muted-foreground uppercase">{cat.name}</span>
                  </div>
                  <div className="space-y-1">
                    {cat.steps.map(st => (
                      <button key={st.type} onClick={() => addStep(st.type)}
                        className="w-full flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted transition-colors text-left">
                        <div className={`w-6 h-6 rounded ${cat.color} flex items-center justify-center`}>
                          <st.icon className="w-3 h-3 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{st.label}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{st.desc}</div>
                        </div>
                        <Plus className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          {catalog && (
            <Card className="mt-4">
              <CardHeader className="pb-2"><CardTitle className="text-base">Templates</CardTitle></CardHeader>
              <CardContent className="pt-0 space-y-2">
                {TEMPLATES.map(t => (
                  <Button key={t.name} variant="outline" className="w-full justify-start" onClick={() => applyTemplate(t.build)}>
                    <span className="mr-2">{t.icon}</span> {t.name}
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Center: Test Flow */}
        <div className="col-span-5">
          <Card className="h-full">
            <CardHeader className="pb-2"><CardTitle className="text-base">Test Flow ({steps.length} steps)</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2 min-h-[300px] max-h-[600px] overflow-y-auto">
                {steps.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Plus className="w-8 h-8 mx-auto mb-3" />
                    <p className="text-sm">Click steps from palette or use a template</p>
                  </div>
                ) : (
                  steps.map((step, index) => (
                    <StepRow key={step.id} step={step} index={index} total={steps.length} catalog={catalog}
                      onUpdate={updateStep} onDelete={deleteStep} onMoveUp={(i) => moveStep(i, 'up')} onMoveDown={(i) => moveStep(i, 'down')} />
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Code + Results */}
        <div className="col-span-4">
          <Card className="h-full">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Code2 className="w-4 h-4" /> Generated Code</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="flex gap-2 items-center flex-wrap">
                <Button onClick={handleGenerate} disabled={generating || steps.length === 0} size="sm">
                  {generating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Code2 className="w-3 h-3 mr-1" />} Generate
                </Button>
                <Button onClick={handleRun} disabled={running || !generatedCode} size="sm" variant="secondary">
                  {running ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />} Run Test
                </Button>
                {testResult && (
                  <Button onClick={handleSaveAsTestCase} disabled={savingTestCase || savedTestCase} size="sm" variant="outline" className="border-blue-300 text-blue-600">
                    {savingTestCase ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <FileText className="w-3 h-3 mr-1" />}
                    {savedTestCase ? '✓ Saved!' : 'Save as Test Case'}
                  </Button>
                )}
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none ml-2">
                  <input type="checkbox" checked={noBuild} onChange={e => setNoBuild(e.target.checked)} className="rounded" />
                  Skip APK build (--no-build)
                </label>
              </div>
              {generatedCode && (
                <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs font-mono max-h-[300px] overflow-y-auto whitespace-pre-wrap break-all">{generatedCode}</pre>
              )}
              {testResult && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3 mr-1" />PASSED</Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />FAILED</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{formatDuration(testResult.duration)}</span>
                  </div>
                  {testResult.output && (
                    <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all">{testResult.output}</pre>
                  )}
                  {savedTestCase && (
                    <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 p-2 rounded">
                      <CheckCircle2 className="w-3 h-3" />
                      Test case saved: <strong>{savedTestCase.title}</strong>
                      <a href="/test-cases" className="underline ml-1 text-blue-700">View in Test Cases →</a>
                    </div>
                  )}
                </div>
              )}
              {error && <div className="flex items-center gap-2 text-sm text-red-500"><AlertTriangle className="w-3 h-3" /> {error}</div>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default VisualTestBuilder;
