import React, { useState, useCallback, useEffect } from 'react';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { MOBILE_DEVICES, type MobileDevice, DEVICE_CATEGORIES } from '../config/devices';
import {
  Scan, Play, Loader2, CheckCircle2, XCircle, GripVertical,
  FileText, Type, MousePointerClick, Clock, Terminal, Code2, AlertTriangle,
  Eye, EyeOff, ArrowUp, ArrowDown, Plus, Trash2, Globe,
  ChevronDown, ChevronRight,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface WebInputElement {
  id: string;
  label: string;
  type: string;
  selector: string;
  name?: string;
  placeholder?: string;
  page?: string;
}

interface WebButtonElement {
  id: string;
  text: string;
  type: string;
  selector: string;
  page?: string;
  action?: string;
}

interface WebTextElement {
  id: string;
  text: string;
  selector: string;
  page?: string;
  isStatic: boolean;
}

interface WebPageElement {
  name: string;
  url: string;
  inputs: WebInputElement[];
  buttons: WebButtonElement[];
  texts: WebTextElement[];
  links: any[];
}

interface WebElementCatalog {
  baseUrl: string;
  scannedAt: string;
  pages: WebPageElement[];
  inputs: WebInputElement[];
  buttons: WebButtonElement[];
  texts: WebTextElement[];
  links: any[];
  routes: string[];
}

interface WebTestStep {
  id: string;
  type: 'tap' | 'enter_text' | 'navigate' | 'assert_visible' | 'assert_not_visible' | 'assert_text' | 'wait' | 'screenshot' | 'set_viewport' | 'hover' | 'select' | 'check' | 'uncheck' | 'press_key';
  elementId?: string;
  selector?: string;
  value?: string;
  value2?: string;
  text?: string;
  // Smart locator metadata (from scraper)
  role?: string;
  label?: string;
  placeholder?: string;
  tag?: string;
  fallbackSelectors?: string[];
}

interface WebTestResult {
  success: boolean;
  output: string;
  duration: number;
}

// ─── Step Categories ───────────────────────────────────────────────────────────

const STEP_CATEGORIES = [
  {
    name: 'Interactions',
    icon: MousePointerClick,
    color: 'bg-green-500',
    steps: [
      { type: 'tap' as const, label: 'Click', icon: MousePointerClick, desc: 'Click a button or element' },
      { type: 'enter_text' as const, label: 'Enter Text', icon: Type, desc: 'Fill an input field' },
      { type: 'hover' as const, label: 'Hover', icon: MousePointerClick, desc: 'Hover over an element' },
      { type: 'select' as const, label: 'Select', icon: Type, desc: 'Select from dropdown' },
      { type: 'check' as const, label: 'Check', icon: MousePointerClick, desc: 'Check a checkbox' },
      { type: 'uncheck' as const, label: 'Uncheck', icon: MousePointerClick, desc: 'Uncheck a checkbox' },
    ],
  },
  {
    name: 'Navigation',
    icon: MousePointerClick,
    color: 'bg-blue-500',
    steps: [
      { type: 'navigate' as const, label: 'Navigate', icon: Globe, desc: 'Go to a URL' },
      { type: 'press_key' as const, label: 'Press Key', icon: ArrowUp, desc: 'Press a keyboard key' },
    ],
  },
  {
    name: 'Assertions',
    icon: Eye,
    color: 'bg-purple-500',
    steps: [
      { type: 'assert_visible' as const, label: 'Assert Visible', icon: Eye, desc: 'Verify element is visible' },
      { type: 'assert_not_visible' as const, label: 'Assert Not Visible', icon: EyeOff, desc: 'Verify element is hidden' },
      { type: 'assert_text' as const, label: 'Assert Text', icon: Type, desc: 'Verify text content' },
    ],
  },
  {
    name: 'Utilities',
    icon: Clock,
    color: 'bg-gray-500',
    steps: [
      { type: 'wait' as const, label: 'Wait', icon: Clock, desc: 'Wait for N ms' },
      { type: 'screenshot' as const, label: 'Screenshot', icon: Eye, desc: 'Take a screenshot' },
      { type: 'set_viewport' as const, label: 'Set Viewport', icon: Type, desc: 'Set browser viewport size' },
    ],
  },
];

const STEP_TYPES = STEP_CATEGORIES.flatMap(cat => cat.steps);

// ─── Templates ─────────────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    name: 'Login Flow',
    icon: '🔐',
    build: (catalog: WebElementCatalog, baseUrl: string): WebTestStep[] => {
      const emailInput = catalog.inputs.find(i =>
        i.label.toLowerCase().includes('email') ||
        i.label.toLowerCase().includes('username') ||
        i.type === 'email'
      ) || catalog.inputs[0];

      const passInput = catalog.inputs.find(i =>
        i.label.toLowerCase().includes('password') ||
        i.type === 'password'
      ) || catalog.inputs[1];

      const loginBtn = catalog.buttons.find(b =>
        b.text.toLowerCase().includes('login') ||
        b.text.toLowerCase().includes('sign in') ||
        b.action === 'form_submit'
      ) || catalog.buttons[0];

      const steps: WebTestStep[] = [];
      if (baseUrl) steps.push({ id: `s_${Date.now()}_0`, type: 'navigate', value: baseUrl });
      if (emailInput) steps.push({ id: `s_${Date.now()}_1`, type: 'enter_text', elementId: emailInput.id, selector: emailInput.selector, value: '' });
      if (passInput) steps.push({ id: `s_${Date.now()}_2`, type: 'enter_text', elementId: passInput.id, selector: passInput.selector, value: '' });
      if (loginBtn) steps.push({ id: `s_${Date.now()}_3`, type: 'tap', elementId: loginBtn.id, selector: loginBtn.selector });
      steps.push({ id: `s_${Date.now()}_4`, type: 'wait', value: '2000' });
      if (loginBtn) steps.push({ id: `s_${Date.now()}_5`, type: 'assert_not_visible', elementId: loginBtn.id, selector: loginBtn.selector });
      return steps;
    },
  },
  {
    name: 'Navigate + Assert',
    icon: '🌐',
    build: (catalog: WebElementCatalog, baseUrl: string): WebTestStep[] => {
      const steps: WebTestStep[] = [];
      if (baseUrl) steps.push({ id: `s_${Date.now()}_0`, type: 'navigate', value: baseUrl });
      steps.push({ id: `s_${Date.now()}_1`, type: 'wait', value: '1000' });
      const firstText = catalog.texts[0];
      if (firstText) steps.push({ id: `s_${Date.now()}_2`, type: 'assert_text', selector: firstText.selector, text: firstText.text.slice(0, 50) });
      return steps;
    },
  },
];

// ─── Step Row Component ────────────────────────────────────────────────────────

const StepRow: React.FC<{
  step: WebTestStep;
  index: number;
  total: number;
  catalog: WebElementCatalog | null;
  onUpdate: (id: string, updates: Partial<WebTestStep>) => void;
  onDelete: (id: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}> = ({ step, index, total, catalog, onUpdate, onDelete, onMoveUp, onMoveDown }) => {
  const stepDef = STEP_TYPES.find(s => s.type === step.type);
  const Icon = stepDef?.icon || Type;

  const renderControls = () => {
    switch (step.type) {
      case 'navigate':
        return (
          <div className="flex gap-2 mt-2">
            <Input placeholder="https://example.com" value={step.value || ''} onChange={(e) => onUpdate(step.id, { value: e.target.value })} className="flex-1 text-sm" />
          </div>
        );

      case 'enter_text':
        return (
          <div className="flex gap-2 mt-2">
            <select
              className="flex-1 rounded border px-3 py-2 text-sm bg-background min-w-0"
              value={step.elementId || ''}
              onChange={(e) => {
                const el = catalog?.inputs.find(i => i.id === e.target.value);
                onUpdate(step.id, {
                  elementId: e.target.value,
                  selector: el?.selector || '',
                  label: el?.label || el?.placeholder,
                  placeholder: el?.placeholder,
                  tag: el?.tag || el?.type,
                  fallbackSelectors: el?.fallbackSelectors,
                });
              }}
            >
              <option value="">Select input field...</option>
              {catalog?.pages.filter(p => (p.inputs?.length || 0) > 0).map(page => (
                <optgroup key={page.name} label={`🌐 ${page.name}`}>
                  {(page.inputs || []).map(inp => (
                    <option key={inp.id} value={inp.id}>{inp.label || inp.placeholder || inp.id} ({inp.type})</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <Input placeholder="Value to enter" value={step.value || ''} onChange={(e) => onUpdate(step.id, { value: e.target.value })} className="flex-1 text-sm" />
          </div>
        );

      case 'tap':
      case 'hover':
      case 'check':
      case 'uncheck':
        return (
          <div className="flex gap-2 mt-2">
            <select
              className="flex-1 rounded border px-3 py-2 text-sm bg-background"
              value={step.elementId || ''}
              onChange={(e) => {
                const btn = catalog?.buttons.find(b => b.id === e.target.value);
                const txt = catalog?.texts.find(t => t.id === e.target.value);
                const el = btn || txt;
                onUpdate(step.id, {
                  elementId: e.target.value,
                  selector: el?.selector || '',
                  text: el?.text || (el as any)?.label,
                  tag: el?.tag,
                  role: el?.role || 'button',
                  fallbackSelectors: el?.fallbackSelectors,
                });
              }}
            >
              <option value="">Select element...</option>
              {catalog?.pages.filter(p => (p.buttons?.length || 0) > 0).map(page => (
                <optgroup key={page.name} label={`🌐 ${page.name}`}>
                  {(page.buttons || []).map(btn => (
                    <option key={btn.id} value={btn.id}>"{btn.text}" ({btn.type})</option>
                  ))}
                </optgroup>
              ))}
              {catalog?.pages.filter(p => (p.texts?.length || 0) > 0).map(page => (
                <optgroup key={`texts-${page.name}`} label={`📝 ${page.name} (Texts)`}>
                  {(page.texts || []).slice(0, 30).map(txt => (
                    <option key={txt.id} value={txt.id}>"{txt.text.slice(0, 60)}"</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        );

      case 'select':
        return (
          <div className="flex gap-2 mt-2">
            <select
              className="flex-1 rounded border px-3 py-2 text-sm bg-background"
              value={step.elementId || ''}
              onChange={(e) => {
                const el = catalog?.inputs.find(i => i.id === e.target.value);
                onUpdate(step.id, { elementId: e.target.value, selector: el?.selector || '' });
              }}
            >
              <option value="">Select dropdown...</option>
              {catalog?.inputs.filter(i => i.type === 'select').map(inp => (
                <option key={inp.id} value={inp.id}>{inp.label || inp.id}</option>
              ))}
            </select>
            <Input placeholder="Option value" value={step.value || ''} onChange={(e) => onUpdate(step.id, { value: e.target.value })} className="flex-1 text-sm" />
          </div>
        );

      case 'press_key':
        return (
          <div className="flex gap-2 mt-2">
            <select
              className="flex-1 rounded border px-3 py-2 text-sm bg-background"
              value={step.value || ''}
              onChange={(e) => onUpdate(step.id, { value: e.target.value })}
            >
              <option value="">Select key...</option>
              <option value="Enter">Enter</option>
              <option value="Tab">Tab</option>
              <option value="Escape">Escape</option>
              <option value="Backspace">Backspace</option>
              <option value="Delete">Delete</option>
              <option value="ArrowUp">Arrow Up</option>
              <option value="ArrowDown">Arrow Down</option>
            </select>
          </div>
        );

      case 'assert_visible':
      case 'assert_not_visible':
        return (
          <div className="flex gap-2 mt-2">
            <select
              className="flex-1 rounded border px-3 py-2 text-sm bg-background"
              value={step.elementId || ''}
              onChange={(e) => {
                const btn = catalog?.buttons.find(b => b.id === e.target.value);
                const txt = catalog?.texts.find(t => t.id === e.target.value);
                const inp = catalog?.inputs.find(i => i.id === e.target.value);
                const el = btn || txt || inp;
                onUpdate(step.id, {
                  elementId: e.target.value,
                  selector: el?.selector || '',
                  text: el?.text || '',
                  tag: el?.tag,
                  role: el?.role,
                  fallbackSelectors: el?.fallbackSelectors,
                });
              }}
            >
              <option value="">Select element...</option>
              {catalog?.buttons.map(btn => (
                <option key={btn.id} value={btn.id}>🔘 "{btn.text}"</option>
              ))}
              {catalog?.texts.slice(0, 50).map(txt => (
                <option key={txt.id} value={txt.id}>📝 "{txt.text.slice(0, 60)}"</option>
              ))}
              {catalog?.inputs.map(inp => (
                <option key={inp.id} value={inp.id}>📥 {inp.label || inp.id}</option>
              ))}
            </select>
          </div>
        );

      case 'assert_text':
        return (
          <div className="flex gap-2 mt-2">
            <select
              className="flex-1 rounded border px-3 py-2 text-sm bg-background"
              value={step.selector || ''}
              onChange={(e) => onUpdate(step.id, { selector: e.target.value })}
            >
              <option value="">(body - any text on page)</option>
              {catalog?.texts.slice(0, 50).map(txt => (
                <option key={txt.id} value={txt.selector}>"{txt.text.slice(0, 60)}"</option>
              ))}
            </select>
            <Input placeholder="Text to search for" value={step.text || ''} onChange={(e) => onUpdate(step.id, { text: e.target.value })} className="flex-1 text-sm" />
          </div>
        );

      case 'wait':
        return (
          <div className="flex gap-2 mt-2 items-center">
            <span className="text-sm text-muted-foreground">Wait</span>
            <Input type="number" value={step.value || '1000'} onChange={(e) => onUpdate(step.id, { value: e.target.value })} className="w-24 text-sm" min="100" max="30000" />
            <span className="text-sm text-muted-foreground">ms</span>
          </div>
        );

      case 'screenshot':
        return (
          <div className="flex gap-2 mt-2">
            <Input placeholder="Screenshot name" value={step.value || ''} onChange={(e) => onUpdate(step.id, { value: e.target.value })} className="flex-1 text-sm" />
          </div>
        );

      case 'set_viewport':
        return (
          <div className="flex gap-2 mt-2 items-center">
            <span className="text-sm text-muted-foreground">W:</span>
            <Input type="number" value={step.value || '1280'} onChange={(e) => onUpdate(step.id, { value: e.target.value })} className="w-20 text-sm" />
            <span className="text-sm text-muted-foreground">H:</span>
            <Input type="number" value={step.value2 || '720'} onChange={(e) => onUpdate(step.id, { value2: e.target.value })} className="w-20 text-sm" />
          </div>
        );

      default:
        return null;
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

const WebVisualBuilder: React.FC = () => {
  const [catalog, setCatalog] = useState<WebElementCatalog | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [steps, setSteps] = useState<WebTestStep[]>([]);
  const [generatedCode, setGeneratedCode] = useState('');
  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);
  const [testResult, setTestResult] = useState<WebTestResult | null>(null);
  const [error, setError] = useState('');
  const [savingTestCase, setSavingTestCase] = useState(false);
  const [savedTestCase, setSavedTestCase] = useState<{id: string; title: string} | null>(null);
  const [devices, setDevices] = useState<{ desktop: any[]; mobile: any[] }>({ desktop: [], mobile: [] });
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [showDevicePicker, setShowDevicePicker] = useState(false);

  // Load devices on mount
  useEffect(() => {
    const load = async () => {
      try {
        const resp = await api.get('/web-tests/web-test-steps');
        const data = resp.data?.data || resp.data;
        if (data?.devices) setDevices(data.devices);
      } catch {}
    };
    load();
  }, []);

  const handleScan = async () => {
    if (!targetUrl.trim()) {
      setScanError('Please enter a URL to scan');
      return;
    }
    setScanning(true);
    setScanError('');
    try {
      const resp = await api.post('/web-tests/scan', {
        url: targetUrl.trim(),
        maxPages: 20,
        maxDepth: 3,
      }, { timeout: 60000 });
      setCatalog(resp.data?.data || resp.data);
    } catch (err: any) {
      setScanError(err.response?.data?.error?.message || err.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const addStep = useCallback((type: string) => {
    const newStep: WebTestStep = { id: `step_${Date.now()}`, type: type as WebTestStep['type'] };
    if (type === 'wait') newStep.value = '1000';
    if (type === 'navigate' && catalog?.baseUrl) newStep.value = catalog.baseUrl;
    setSteps(prev => [...prev, newStep]);
  }, [catalog]);

  const moveStep = (index: number, direction: 'up' | 'down') => {
    setSteps(prev => {
      const updated = [...prev];
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= updated.length) return prev;
      [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
      return updated;
    });
  };

  const updateStep = (id: string, updates: Partial<WebTestStep>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const deleteStep = (id: string) => setSteps(prev => prev.filter(s => s.id !== id));

  const applyTemplate = (buildFn: (cat: WebElementCatalog, url: string) => WebTestStep[]) => {
    if (!catalog) { setScanError('Scan a website first'); return; }
    setSteps(buildFn(catalog, catalog.baseUrl));
  };

  const handleGenerate = async () => {
    if (steps.length === 0) { setError('Add at least one step'); return; }
    setGenerating(true);
    setError('');
    try {
      const resp = await api.post('/web-tests/generate', {
        steps,
        baseUrl: catalog?.baseUrl || undefined,
        device: selectedDevice || undefined,
      });
      setGeneratedCode(resp.data?.data?.playwrightCode || '');
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
      const resp = await api.post('/web-tests/run', {
        steps,
        baseUrl: catalog?.baseUrl || undefined,
        device: selectedDevice || undefined,
      }, { timeout: 120000 });
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
      const title = `Web Test - ${catalog?.baseUrl || targetUrl || 'untitled'}`;
      const resp = await api.post('/web-tests/save-testcase', {
        title,
        steps,
        generatedCode,
        baseUrl: catalog?.baseUrl || targetUrl,
        testResult: testResult ? {
          success: testResult.success,
          output: testResult.output,
          duration: testResult.duration,
        } : undefined,
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

  // ─── Catalog pagination ───────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(0);
  const pages = catalog?.pages || [];
  const totalPages = pages.length;
  const current = pages[currentPage];

  // ─── Element Filters ───────────────────────────────────────────────────────
  const [elementFilter, setElementFilter] = useState<'all' | 'inputs' | 'buttons' | 'texts'>('all');
  const [elementSearch, setElementSearch] = useState('');
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());

  const togglePageExpanded = (pageIndex: number) => {
    setExpandedPages(prev => {
      const next = new Set(prev);
      if (next.has(pageIndex)) {
        next.delete(pageIndex);
      } else {
        next.add(pageIndex);
      }
      return next;
    });
  };

  const filteredPages = pages.filter((page, idx) => {
    // Text search filter
    if (elementSearch) {
      const searchLower = elementSearch.toLowerCase();
      const matchesSearch =
        page.name?.toLowerCase().includes(searchLower) ||
        page.url?.toLowerCase().includes(searchLower) ||
        (page.inputs || []).some(i => i.label?.toLowerCase().includes(searchLower) || i.selector?.toLowerCase().includes(searchLower)) ||
        (page.buttons || []).some(b => b.text?.toLowerCase().includes(searchLower) || b.selector?.toLowerCase().includes(searchLower)) ||
        (page.texts || []).some(t => t.text?.toLowerCase().includes(searchLower) || t.selector?.toLowerCase().includes(searchLower));
      if (!matchesSearch) return false;
    }

    // Element type filter
    if (elementFilter === 'all') return true;
    if (elementFilter === 'inputs') return (page.inputs?.length || 0) > 0;
    if (elementFilter === 'buttons') return (page.buttons?.length || 0) > 0;
    if (elementFilter === 'texts') return (page.texts?.length || 0) > 0;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Web Visual Builder</h1>
          <p className="text-muted-foreground">Scan a website, pick elements, compose Playwright test scenarios</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Device Picker */}
          <div className="relative">
            <button
              onClick={() => setShowDevicePicker(!showDevicePicker)}
              className="flex items-center gap-2 px-3 py-2 rounded border bg-background hover:bg-muted transition-colors text-sm"
            >
              <span className="text-lg">{selectedDevice ? (devices.mobile.find(d => d.id === selectedDevice)?.icon || devices.desktop.find(d => d.id === selectedDevice)?.icon || '🖥️') : '🖥️'}</span>
              <span className="text-sm">{selectedDevice ? (devices.mobile.find(d => d.id === selectedDevice)?.label || devices.desktop.find(d => d.id === selectedDevice)?.label || 'Desktop') : 'Desktop'}</span>
              <span className="text-xs text-muted-foreground">▼</span>
            </button>
            {showDevicePicker && (
              <div className="absolute right-0 top-full mt-1 bg-card border rounded-lg shadow-lg w-64 z-50">
                <div className="p-3">
                  <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Desktop</div>
                  <div className="space-y-1">
                    {devices.desktop.map(d => (
                      <button
                        key={d.id || 'default'}
                        onClick={() => { setSelectedDevice(d.id); setShowDevicePicker(false); }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                          selectedDevice === d.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                        }`}
                      >
                        <span>{d.icon}</span>
                        <span className="truncate">{d.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="border-t p-3">
                  <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Mobile</div>
                  <div className="space-y-1">
                    {devices.mobile.map(d => (
                      <button
                        key={d.id}
                        onClick={() => { setSelectedDevice(d.id); setShowDevicePicker(false); }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                          selectedDevice === d.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                        }`}
                      >
                        <span>{d.icon}</span>
                        <span className="truncate">{d.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* URL Input */}
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Target URL:</Label>
            <div className="flex gap-2">
              <Input
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example.com"
                className="min-w-[300px]"
              />
              <Button onClick={handleScan} disabled={scanning} size="sm">
                {scanning ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Globe className="w-3 h-3 mr-1" />}
                {scanning ? 'Scanning...' : 'Scan'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {scanError && (
        <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 p-3 rounded">
          <AlertTriangle className="w-4 h-4" /> {scanError}
        </div>
      )}

      {/* Catalog Summary */}
      {catalog && current && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Element Catalog — {current.name}
              </CardTitle>
              <div className="flex gap-3">
                <Badge variant="outline">{current.inputs?.length || 0} Inputs</Badge>
                <Badge variant="outline">{current.buttons?.length || 0} Buttons</Badge>
                <Badge variant="outline">{current.texts?.length || 0} Texts</Badge>
                <Badge variant="secondary">Page {currentPage + 1} / {totalPages}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-3 p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Filter:</Label>
                <div className="flex rounded-md shadow-sm">
                  <button
                    onClick={() => setElementFilter('all')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-l-md border ${
                      elementFilter === 'all'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setElementFilter('inputs')}
                    className={`px-3 py-1.5 text-xs font-medium border-t border-b ${
                      elementFilter === 'inputs'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    <Type className="w-3 h-3 inline mr-1" />
                    Inputs
                  </button>
                  <button
                    onClick={() => setElementFilter('buttons')}
                    className={`px-3 py-1.5 text-xs font-medium border-t border-b ${
                      elementFilter === 'buttons'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    <MousePointerClick className="w-3 h-3 inline mr-1" />
                    Buttons
                  </button>
                  <button
                    onClick={() => setElementFilter('texts')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-r-md border ${
                      elementFilter === 'texts'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    <FileText className="w-3 h-3 inline mr-1" />
                    Texts
                  </button>
                </div>
              </div>
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder="Search elements..."
                  value={elementSearch}
                  onChange={e => setElementSearch(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              {filteredPages.length !== pages.length && (
                <Badge variant="secondary" className="text-xs">
                  Showing {filteredPages.length} of {pages.length} pages
                </Badge>
              )}
            </div>

            <div className="text-xs text-muted-foreground mb-3 truncate">{current.url}</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Inputs */}
              {current.inputs && current.inputs.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <div className="w-2 h-2 rounded bg-blue-500" /> Inputs
                  </div>
                  <div className="space-y-1">
                    {current.inputs.map(inp => (
                      <div key={inp.id} className="flex items-center gap-1.5 bg-muted/30 rounded px-2 py-1">
                        <Type className="w-3 h-3 text-blue-500" />
                        <span className="truncate text-xs">{inp.label || inp.placeholder || inp.id}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">({inp.type})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Buttons */}
              {current.buttons && current.buttons.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <div className="w-2 h-2 rounded bg-green-500" /> Buttons
                  </div>
                  <div className="space-y-1">
                    {current.buttons.map(btn => (
                      <div key={btn.id} className="flex items-center gap-1.5 bg-muted/30 rounded px-2 py-1">
                        <MousePointerClick className="w-3 h-3 text-green-500" />
                        <span className="truncate text-xs">"{btn.text}"</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">({btn.type})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Texts */}
              {current.texts && current.texts.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <div className="w-2 h-2 rounded bg-purple-500" /> Texts
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {current.texts.slice(0, 20).map(txt => (
                      <span key={txt.id} className="rounded px-1.5 py-0.5 truncate max-w-full text-[11px] bg-muted/30 border">
                        "{txt.text.slice(0, 50)}"
                      </span>
                    ))}
                    {current.texts.length > 20 && (
                      <span className="text-muted-foreground text-xs">+{current.texts.length - 20} more</span>
                    )}
                  </div>
                </div>
              )}
              {(!current.inputs?.length && !current.buttons?.length && !current.texts?.length) && (
                <div className="col-span-3 text-center text-muted-foreground py-4">No elements detected</div>
              )}
            </div>

            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t">
                <button
                  disabled={currentPage === 0}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded border text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted transition-colors"
                >
                  ← Prev
                </button>
                <div className="flex gap-1">
                  {Array.from({ length: totalPages }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentPage(i)}
                      className={`w-8 h-8 rounded text-xs font-medium transition-colors ${
                        i === currentPage
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <button
                  disabled={currentPage >= totalPages - 1}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded border text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
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
              {STEP_CATEGORIES.map(cat => {
                const Icon = cat.icon;
                return (
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
                );
              })}
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
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Code2 className="w-4 h-4" /> Generated Playwright Code
              </CardTitle>
            </CardHeader>
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
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-500">
                  <AlertTriangle className="w-3 h-3" /> {error}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default WebVisualBuilder;
