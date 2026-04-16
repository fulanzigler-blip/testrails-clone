import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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

// ─── Searchable Element Picker ─────────────────────────────────────────────────

interface ElementOption {
  id: string;
  label: string;
  sublabel?: string;
  icon?: string;
  page?: string;   // page name for grouping
  data: any;
}

// Portal-based element picker — dropdown renders in document.body, avoids overflow/clip issues
const ElementSearchSelect: React.FC<{
  value: string;
  placeholder?: string;
  options: ElementOption[];
  onChange: (opt: ElementOption | null) => void;
  className?: string;
}> = ({ value, placeholder = 'Search element...', options, onChange, className = '' }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Assign stable index-based keys to prevent duplicate-id collisions
  const indexed = options.map((opt, idx) => ({ ...opt, _idx: idx }));

  const filtered = query.trim()
    ? indexed.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        (o.sublabel || '').toLowerCase().includes(query.toLowerCase()) ||
        (o.page || '').toLowerCase().includes(query.toLowerCase())
      )
    : indexed;

  const currentOpt = value ? indexed.find(o => o.id === value) : undefined;
  const selectedLabel = currentOpt ? `${currentOpt.icon || ''} ${currentOpt.label}` : '';

  const openDropdown = () => {
    setOpen(true);
    setQuery('');
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  const handleSelect = (opt: typeof indexed[0]) => {
    onChange(opt);
    setOpen(false);
    setQuery('');
  };

  const shortPage = (page: string) => {
    try { return new URL(page).pathname || page; } catch { return page; }
  };

  const grouped: { page: string; items: typeof indexed }[] = [];
  filtered.forEach(opt => {
    const page = opt.page || 'General';
    let g = grouped.find(x => x.page === page);
    if (!g) { g = { page, items: [] }; grouped.push(g); }
    g.items.push(opt);
  });

  // Modal-style dialog: backdrop + centered panel — no relative positioning needed
  const portal = open && createPortal(
    <>
      {/* Full-screen backdrop — catches outside clicks */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.3)' }}
        onClick={() => { setOpen(false); setQuery(''); }}
      />
      {/* Centered picker panel */}
      <div
        className="ess-portal rounded-lg border bg-popover shadow-2xl overflow-hidden"
        style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 440, maxWidth: '94vw', zIndex: 9999 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b">
          <span className="text-sm font-semibold text-foreground">Select element ({filtered.length})</span>
          <button
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
            onClick={() => { setOpen(false); setQuery(''); }}
          >✕</button>
        </div>
        {/* Search */}
        <div className="px-3 py-2">
          <input
            ref={searchRef}
            className="w-full rounded border px-2 py-1.5 text-sm bg-background outline-none focus:border-primary"
            placeholder={`Search ${options.length} elements...`}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        {/* List */}
        <div style={{ maxHeight: '480px', overflowY: 'auto' }} className="border-t">
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">No elements found</div>
          )}
          {grouped.map(group => (
            <div key={group.page}>
              {grouped.length > 1 && (
                <div className="sticky top-0 flex items-center gap-1 px-3 py-1 bg-muted/80 border-b text-[10px] font-semibold text-muted-foreground uppercase">
                  <Globe className="h-3 w-3 shrink-0" />
                  <span className="truncate">{shortPage(group.page)}</span>
                  <span className="ml-auto">{group.items.length}</span>
                </div>
              )}
              {group.items.map(opt => (
                <div
                  key={opt._idx}
                  className={`flex items-center gap-2 px-3 py-2.5 text-sm cursor-pointer hover:bg-accent/60 active:bg-accent border-b border-border/30 ${opt.id === value ? 'bg-accent/30 font-medium' : ''}`}
                  onClick={() => handleSelect(opt)}
                >
                  {opt.icon && <span className="shrink-0 text-base">{opt.icon}</span>}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{opt.label}</div>
                    {opt.sublabel && <div className="text-xs text-muted-foreground truncate mt-0.5">{opt.sublabel}</div>}
                  </div>
                  {opt.id === value && <span className="text-xs text-primary shrink-0 font-bold">✓</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>,
    document.body
  );

  return (
    <div ref={triggerRef} className={`relative ${className}`}>
      <div
        className="flex items-center rounded border bg-background px-2 py-1.5 text-sm cursor-pointer gap-1 min-h-[32px]"
        onClick={() => { open ? (setOpen(false), setQuery('')) : openDropdown(); }}
      >
        <span className={`flex-1 truncate ${selectedLabel ? 'text-foreground' : 'text-muted-foreground'}`}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown className={`h-3 w-3 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {portal}
    </div>
  );
};

// ─── Step Row ───────────────────────────────────────────────────────────────────

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

      case 'enter_text': {
        const inputOpts: ElementOption[] = (catalog?.inputs || []).map(inp => ({
          id: inp.id,
          label: inp.label || inp.placeholder || inp.id,
          sublabel: `${inp.type} · ${inp.selector}`,
          icon: '📥',
          page: inp.page,
          data: inp,
        }));
        return (
          <div className="flex gap-2 mt-2">
            <ElementSearchSelect
              className="flex-1 min-w-0"
              value={step.elementId || ''}
              placeholder="Search input field..."
              options={inputOpts}
              onChange={(opt) => {
                const el = opt?.data;
                onUpdate(step.id, {
                  elementId: opt?.id || '',
                  selector: el?.selector || '',
                  label: el?.label || el?.placeholder,
                  placeholder: el?.placeholder,
                  tag: el?.tag || el?.type,
                  fallbackSelectors: el?.fallbackSelectors,
                });
              }}
            />
            <Input placeholder="Value to enter" value={step.value || ''} onChange={(e) => onUpdate(step.id, { value: e.target.value })} className="flex-1 text-sm" />
          </div>
        );
      }

      case 'tap':
      case 'hover':
      case 'check':
      case 'uncheck': {
        // Use array index in ID to guarantee uniqueness even when backend IDs collide
        // (happens when multiple pages share the same title — scraper generates duplicate btn_pagename_N)
        const clickOpts: ElementOption[] = [
          ...(catalog?.buttons || []).map((btn, i) => ({
            id: `b:${i}:${btn.id}`,
            label: `"${btn.text}"`,
            sublabel: `${btn.type} · ${btn.selector}`,
            icon: btn.type === 'link' ? '🔗' : '🔘',
            page: btn.page,
            data: btn,
          })),
          ...(catalog?.texts || []).map((txt, i) => ({
            id: `t:${i}:${txt.id}`,
            label: `"${txt.text.slice(0, 60)}"`,
            sublabel: `text · ${txt.selector}`,
            icon: '📝',
            page: txt.page,
            data: txt,
          })),
        ];
        return (
          <div className="flex gap-2 mt-2">
            <ElementSearchSelect
              className="flex-1"
              value={step.elementId || ''}
              placeholder="Search element..."
              options={clickOpts}
              onChange={(opt) => {
                const el = opt?.data;
                onUpdate(step.id, {
                  elementId: opt?.id || '',
                  selector: el?.selector || '',
                  text: el?.text || (el as any)?.label,
                  tag: el?.tag,
                  role: el?.role || 'button',
                  fallbackSelectors: el?.fallbackSelectors,
                });
              }}
            />
          </div>
        );
      }

      case 'select': {
        const selectOpts: ElementOption[] = (catalog?.inputs || [])
          .filter(i => i.type === 'select')
          .map(inp => ({
            id: inp.id,
            label: inp.label || inp.id,
            sublabel: inp.selector,
            icon: '▾',
            page: inp.page,
            data: inp,
          }));
        return (
          <div className="flex gap-2 mt-2">
            <ElementSearchSelect
              className="flex-1"
              value={step.elementId || ''}
              placeholder="Search dropdown..."
              options={selectOpts}
              onChange={(opt) => {
                const el = opt?.data;
                onUpdate(step.id, { elementId: opt?.id || '', selector: el?.selector || '' });
              }}
            />
            <Input placeholder="Option value" value={step.value || ''} onChange={(e) => onUpdate(step.id, { value: e.target.value })} className="flex-1 text-sm" />
          </div>
        );
      }

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
      case 'assert_not_visible': {
        const assertOpts: ElementOption[] = [
          ...(catalog?.buttons || []).map((btn, i) => ({
            id: `b:${i}:${btn.id}`,
            label: `"${btn.text}"`,
            sublabel: btn.selector,
            icon: btn.type === 'link' ? '🔗' : '🔘',
            page: btn.page,
            data: btn,
          })),
          ...(catalog?.texts || []).map((txt, i) => ({
            id: `t:${i}:${txt.id}`,
            label: `"${txt.text.slice(0, 60)}"`,
            sublabel: txt.selector,
            icon: '📝',
            page: txt.page,
            data: txt,
          })),
          ...(catalog?.inputs || []).map((inp, i) => ({
            id: `i:${i}:${inp.id}`,
            label: inp.label || inp.id,
            sublabel: inp.selector,
            icon: '📥',
            page: inp.page,
            data: inp,
          })),
        ];
        return (
          <div className="flex gap-2 mt-2">
            <ElementSearchSelect
              className="flex-1"
              value={step.elementId || ''}
              placeholder="Search element..."
              options={assertOpts}
              onChange={(opt) => {
                const el = opt?.data;
                onUpdate(step.id, {
                  elementId: opt?.id || '',
                  selector: el?.selector || '',
                  text: el?.text || '',
                  tag: el?.tag,
                  role: el?.role,
                  fallbackSelectors: el?.fallbackSelectors,
                });
              }}
            />
          </div>
        );
      }

      case 'assert_text': {
        const assertTextOpts: ElementOption[] = [
          { id: '', label: '(body — any text on page)', sublabel: 'searches entire page', icon: '🌐', data: null },
          ...(catalog?.texts || []).map(txt => ({
            id: txt.selector,
            label: `"${txt.text.slice(0, 60)}"`,
            sublabel: txt.selector,
            icon: '📝',
            page: txt.page,
            data: txt,
          })),
        ];
        return (
          <div className="flex gap-2 mt-2">
            <ElementSearchSelect
              className="flex-1"
              value={step.selector || ''}
              placeholder="Search text element..."
              options={assertTextOpts}
              onChange={(opt) => onUpdate(step.id, { selector: opt?.id || '' })}
            />
            <Input placeholder="Text to search for" value={step.text || ''} onChange={(e) => onUpdate(step.id, { text: e.target.value })} className="flex-1 text-sm" />
          </div>
        );
      }

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
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveForm, setSaveForm] = useState({ title: '', description: '', priority: 'medium', suiteId: '' });
  const [suites, setSuites] = useState<{ id: string; name: string; projectName: string }[]>([]);
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
        maxPages: 10,
        maxDepth: 2,
      }, { timeout: 300000 }); // 5 min — crawling can be slow
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
    // Pre-fill title with a sensible default, then open dialog
    const defaultTitle = `Web Test - ${catalog?.baseUrl || targetUrl || 'untitled'}`;
    setSaveForm(f => ({ ...f, title: f.title || defaultTitle }));
    // Fetch suites for the dropdown
    try {
      const resp = await api.get('/test-suites?perPage=100');
      const list = resp.data?.data || [];
      setSuites(list.map((s: any) => ({ id: s.id, name: s.name, projectName: '' })));
    } catch { setSuites([]); }
    setShowSaveDialog(true);
  };

  const handleSaveDialogSubmit = async () => {
    if (!saveForm.title.trim()) return;
    setSavingTestCase(true);
    setError('');
    try {
      const resp = await api.post('/web-tests/save-testcase', {
        title: saveForm.title.trim(),
        description: saveForm.description.trim() || undefined,
        priority: saveForm.priority,
        suiteId: saveForm.suiteId || undefined,
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
      setShowSaveDialog(false);
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

  // ─── Catalog state ────────────────────────────────────────────────────────
  const pages = catalog?.pages || [];

  // ─── Element Filters ───────────────────────────────────────────────────────
  const [elementFilter, setElementFilter] = useState<'all' | 'inputs' | 'buttons' | 'texts'>('all');
  const [elementSearch, setElementSearch] = useState('');
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());
  const [pageTabMap, setPageTabMap] = useState<Record<number, 'inputs' | 'buttons' | 'texts'>>({});

  const getPageTab = (idx: number, page: WebPageElement): 'inputs' | 'buttons' | 'texts' => {
    if (pageTabMap[idx]) return pageTabMap[idx];
    if ((page.inputs?.length || 0) > 0) return 'inputs';
    if ((page.buttons?.length || 0) > 0) return 'buttons';
    return 'texts';
  };

  const setPageTab = (idx: number, tab: 'inputs' | 'buttons' | 'texts') => {
    setPageTabMap(prev => ({ ...prev, [idx]: tab }));
  };

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

      {/* Element Catalog */}
      {catalog && pages.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Element Catalog</CardTitle>
              <div className="flex gap-2">
                <Badge variant="outline">{pages.length} Pages</Badge>
                <Badge variant="outline">{catalog.inputs?.length || 0} Inputs</Badge>
                <Badge variant="outline">{catalog.buttons?.length || 0} Buttons</Badge>
                <Badge variant="outline">{catalog.texts?.length || 0} Texts</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Search + Filter bar */}
            <div className="flex flex-wrap gap-2 mb-3">
              <Input
                placeholder="Search pages or elements..."
                value={elementSearch}
                onChange={e => setElementSearch(e.target.value)}
                className="h-8 text-sm flex-1 min-w-[180px]"
              />
              <div className="flex rounded-md border overflow-hidden text-xs">
                {(['all', 'inputs', 'buttons', 'texts'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setElementFilter(f)}
                    className={`px-3 py-1.5 font-medium capitalize transition-colors ${
                      elementFilter === f
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    {f === 'all' ? 'All' : f === 'inputs' ? '⌨ Inputs' : f === 'buttons' ? '🖱 Buttons' : '📝 Texts'}
                  </button>
                ))}
              </div>
              {filteredPages.length !== pages.length && (
                <Badge variant="secondary" className="text-xs self-center">
                  {filteredPages.length} / {pages.length} pages
                </Badge>
              )}
            </div>

            {/* Collapsed page list */}
            <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
              {filteredPages.map((page, idx) => {
                const realIdx = pages.indexOf(page);
                const isOpen = expandedPages.has(realIdx);
                const tab = getPageTab(realIdx, page);
                const hasInputs = (page.inputs?.length || 0) > 0;
                const hasButtons = (page.buttons?.length || 0) > 0;
                const hasTexts = (page.texts?.length || 0) > 0;

                return (
                  <div key={realIdx} className="rounded border bg-background">
                    {/* Page header row — click to expand */}
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
                      onClick={() => togglePageExpanded(realIdx)}
                    >
                      {isOpen
                        ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      }
                      <Globe className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium truncate flex-1">{page.name || page.url}</span>
                      <div className="flex gap-1.5 flex-shrink-0">
                        {hasInputs && <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-blue-600 border-blue-200">{page.inputs.length} in</Badge>}
                        {hasButtons && <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-green-600 border-green-200">{page.buttons.length} btn</Badge>}
                        {hasTexts && <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-purple-600 border-purple-200">{page.texts.length} txt</Badge>}
                        {!hasInputs && !hasButtons && !hasTexts && (
                          <span className="text-[10px] text-muted-foreground">empty</span>
                        )}
                      </div>
                    </button>

                    {/* Expanded content with tabs */}
                    {isOpen && (
                      <div className="border-t px-3 pb-3">
                        <div className="text-[10px] text-muted-foreground truncate py-1.5">{page.url}</div>

                        {/* Tabs */}
                        {(hasInputs || hasButtons || hasTexts) && (
                          <>
                            <div className="flex gap-0 mb-2 border-b">
                              {hasInputs && (
                                <button
                                  onClick={() => setPageTab(realIdx, 'inputs')}
                                  className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                                    tab === 'inputs' ? 'border-blue-500 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'
                                  }`}
                                >
                                  <Type className="w-3 h-3 inline mr-1" />Inputs ({page.inputs.length})
                                </button>
                              )}
                              {hasButtons && (
                                <button
                                  onClick={() => setPageTab(realIdx, 'buttons')}
                                  className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                                    tab === 'buttons' ? 'border-green-500 text-green-600' : 'border-transparent text-muted-foreground hover:text-foreground'
                                  }`}
                                >
                                  <MousePointerClick className="w-3 h-3 inline mr-1" />Buttons ({page.buttons.length})
                                </button>
                              )}
                              {hasTexts && (
                                <button
                                  onClick={() => setPageTab(realIdx, 'texts')}
                                  className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                                    tab === 'texts' ? 'border-purple-500 text-purple-600' : 'border-transparent text-muted-foreground hover:text-foreground'
                                  }`}
                                >
                                  <FileText className="w-3 h-3 inline mr-1" />Texts ({page.texts.length})
                                </button>
                              )}
                            </div>

                            {/* Tab content */}
                            <div className="max-h-[200px] overflow-y-auto space-y-1">
                              {tab === 'inputs' && hasInputs && page.inputs.map(inp => (
                                <div key={inp.id} className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/20 rounded px-2 py-1">
                                  <Type className="w-3 h-3 text-blue-500 flex-shrink-0" />
                                  <span className="truncate text-xs flex-1">{inp.label || inp.placeholder || inp.id}</span>
                                  <span className="text-[10px] text-muted-foreground flex-shrink-0">({inp.type})</span>
                                </div>
                              ))}
                              {tab === 'buttons' && hasButtons && page.buttons.map(btn => (
                                <div key={btn.id} className="flex items-center gap-1.5 bg-green-50 dark:bg-green-950/20 rounded px-2 py-1">
                                  <MousePointerClick className="w-3 h-3 text-green-500 flex-shrink-0" />
                                  <span className="truncate text-xs flex-1">"{btn.text}"</span>
                                  <span className="text-[10px] text-muted-foreground flex-shrink-0">({btn.type})</span>
                                </div>
                              ))}
                              {tab === 'texts' && hasTexts && page.texts.map(txt => (
                                <div key={txt.id} className="flex items-center gap-1.5 bg-purple-50 dark:bg-purple-950/20 rounded px-2 py-1">
                                  <FileText className="w-3 h-3 text-purple-500 flex-shrink-0" />
                                  <span className="truncate text-xs flex-1">"{txt.text.slice(0, 80)}"</span>
                                  {txt.isStatic && <span className="text-[10px] text-muted-foreground flex-shrink-0">static</span>}
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                        {!hasInputs && !hasButtons && !hasTexts && (
                          <p className="text-xs text-muted-foreground py-2">No elements detected on this page</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredPages.length === 0 && (
                <div className="text-center py-6 text-muted-foreground text-sm">No pages match the filter</div>
              )}
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

      {/* ── Save as Test Case Dialog ─────────────────────────────────────── */}
      {showSaveDialog && createPortal(
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.4)' }}
            onClick={() => setShowSaveDialog(false)}
          />
          <div
            className="rounded-lg border bg-popover shadow-2xl overflow-hidden"
            style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 480, maxWidth: '94vw', zIndex: 9999 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <h3 className="text-sm font-semibold">Save as Test Case</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Fill in test case details before saving</p>
              </div>
              <button className="text-muted-foreground hover:text-foreground text-lg leading-none" onClick={() => setShowSaveDialog(false)}>✕</button>
            </div>
            {/* Form */}
            <div className="px-4 py-3 space-y-3">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Name <span className="text-red-500">*</span></label>
                <input
                  className="w-full rounded border px-2 py-1.5 text-sm bg-background outline-none focus:border-primary"
                  placeholder="e.g. Login flow test"
                  value={saveForm.title}
                  onChange={e => setSaveForm(f => ({ ...f, title: e.target.value }))}
                  autoFocus
                />
              </div>
              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Description</label>
                <textarea
                  className="w-full rounded border px-2 py-1.5 text-sm bg-background outline-none focus:border-primary resize-none"
                  placeholder="Optional description of what this test validates"
                  rows={2}
                  value={saveForm.description}
                  onChange={e => setSaveForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              {/* Priority + Suite row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Priority</label>
                  <select
                    className="w-full rounded border px-2 py-1.5 text-sm bg-background outline-none focus:border-primary"
                    value={saveForm.priority}
                    onChange={e => setSaveForm(f => ({ ...f, priority: e.target.value }))}
                  >
                    <option value="low">🟢 Low</option>
                    <option value="medium">🟡 Medium</option>
                    <option value="high">🔴 High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Test Suite (optional)</label>
                  <select
                    className="w-full rounded border px-2 py-1.5 text-sm bg-background outline-none focus:border-primary"
                    value={saveForm.suiteId}
                    onChange={e => setSaveForm(f => ({ ...f, suiteId: e.target.value }))}
                  >
                    <option value="">— No suite —</option>
                    {suites.map(s => (
                      <option key={s.id} value={s.id}>{s.projectName ? `[${s.projectName}] ` : ''}{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t bg-muted/30">
              <button
                className="px-3 py-1.5 rounded text-sm text-muted-foreground hover:bg-muted"
                onClick={() => setShowSaveDialog(false)}
              >Cancel</button>
              <button
                className="px-4 py-1.5 rounded text-sm bg-primary text-primary-foreground hover:bg-primary/90 font-medium disabled:opacity-50"
                disabled={!saveForm.title.trim() || savingTestCase}
                onClick={handleSaveDialogSubmit}
              >
                {savingTestCase ? 'Saving...' : 'Save Test Case'}
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

export default WebVisualBuilder;
