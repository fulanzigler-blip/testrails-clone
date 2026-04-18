import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Play, Loader2, CheckCircle2, XCircle, GripVertical,
  FileText, Type, MousePointerClick, Clock, Terminal, Code2, AlertTriangle,
  Eye, EyeOff, ArrowUp, ArrowDown, Plus, Trash2, Globe,
  ChevronDown, ChevronRight, MonitorPlay, LogIn, LogOut, RefreshCw,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface WebInputElement {
  id: string; label: string; type: string; selector: string;
  name?: string; placeholder?: string; page?: string;
  tag?: string; role?: string; ariaLabel?: string; fallbackSelectors?: string[];
}
interface WebButtonElement {
  id: string; text: string; type: string; selector: string;
  page?: string; action?: string; tag?: string; role?: string;
  ariaLabel?: string; fallbackSelectors?: string[];
}
interface WebTextElement {
  id: string; text: string; selector: string; page?: string;
  isStatic: boolean; tag?: string; fallbackSelectors?: string[];
}
interface WebPageElement {
  name: string; url: string;
  inputs: WebInputElement[]; buttons: WebButtonElement[];
  texts: WebTextElement[]; links: any[];
}
interface WebElementCatalog {
  baseUrl: string; scannedAt: string; pages: WebPageElement[];
  inputs: WebInputElement[]; buttons: WebButtonElement[];
  texts: WebTextElement[]; links: any[]; routes: string[];
}
interface WebTestStep {
  id: string;
  type: 'tap' | 'enter_text' | 'navigate' | 'assert_visible' | 'assert_not_visible' | 'assert_text'
      | 'wait' | 'screenshot' | 'set_viewport' | 'hover' | 'select' | 'check' | 'uncheck' | 'press_key';
  elementId?: string; selector?: string; value?: string; value2?: string; text?: string;
  role?: string; label?: string; placeholder?: string; tag?: string; fallbackSelectors?: string[];
}
interface WebTestResult { success: boolean; output: string; duration: number; }
interface PageSnapshot {
  url: string; title: string; screenshot: string; // base64
  elements: WebPageElement;
}

// ─── Step Categories ───────────────────────────────────────────────────────────

const STEP_CATEGORIES = [
  { name: 'Interactions', color: 'bg-green-500', steps: [
    { type: 'tap' as const, label: 'Click', icon: MousePointerClick, desc: 'Click a button or element' },
    { type: 'enter_text' as const, label: 'Enter Text', icon: Type, desc: 'Fill an input field' },
    { type: 'hover' as const, label: 'Hover', icon: MousePointerClick, desc: 'Hover over an element' },
    { type: 'select' as const, label: 'Select', icon: Type, desc: 'Select from dropdown' },
    { type: 'check' as const, label: 'Check', icon: MousePointerClick, desc: 'Check a checkbox' },
    { type: 'uncheck' as const, label: 'Uncheck', icon: MousePointerClick, desc: 'Uncheck a checkbox' },
  ]},
  { name: 'Navigation', color: 'bg-blue-500', steps: [
    { type: 'navigate' as const, label: 'Navigate', icon: Globe, desc: 'Go to a URL' },
    { type: 'press_key' as const, label: 'Press Key', icon: ArrowUp, desc: 'Press a keyboard key' },
  ]},
  { name: 'Assertions', color: 'bg-purple-500', steps: [
    { type: 'assert_visible' as const, label: 'Assert Visible', icon: Eye, desc: 'Verify element is visible' },
    { type: 'assert_not_visible' as const, label: 'Assert Not Visible', icon: EyeOff, desc: 'Verify element is hidden' },
    { type: 'assert_text' as const, label: 'Assert Text', icon: Type, desc: 'Verify text content' },
  ]},
  { name: 'Utilities', color: 'bg-gray-500', steps: [
    { type: 'wait' as const, label: 'Wait', icon: Clock, desc: 'Wait for N ms' },
    { type: 'screenshot' as const, label: 'Screenshot', icon: Eye, desc: 'Take a screenshot' },
    { type: 'set_viewport' as const, label: 'Set Viewport', icon: Type, desc: 'Set browser viewport size' },
  ]},
];
const STEP_TYPES = STEP_CATEGORIES.flatMap(c => c.steps);

// ─── Searchable Element Picker ─────────────────────────────────────────────────

interface ElementOption { id: string; label: string; sublabel?: string; icon?: string; page?: string; data: any; }

const ElementSearchSelect: React.FC<{
  value: string; placeholder?: string; options: ElementOption[];
  onChange: (opt: ElementOption | null) => void; className?: string;
}> = ({ value, placeholder = 'Search element...', options, onChange, className = '' }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const indexed = options.map((opt, idx) => ({ ...opt, _idx: idx }));
  const filtered = query.trim()
    ? indexed.filter(o => o.label.toLowerCase().includes(query.toLowerCase()) || (o.sublabel || '').toLowerCase().includes(query.toLowerCase()) || (o.page || '').toLowerCase().includes(query.toLowerCase()))
    : indexed;
  const currentOpt = value ? indexed.find(o => o.id === value) : undefined;
  const selectedLabel = currentOpt ? `${currentOpt.icon || ''} ${currentOpt.label}` : '';

  const grouped: { page: string; items: typeof indexed }[] = [];
  filtered.forEach(opt => {
    const page = opt.page || 'General';
    let g = grouped.find(x => x.page === page);
    if (!g) { g = { page, items: [] }; grouped.push(g); }
    g.items.push(opt);
  });

  const shortPage = (p: string) => { try { return new URL(p).pathname || p; } catch { return p; } };

  const portal = open && createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.3)' }} onClick={() => { setOpen(false); setQuery(''); }} />
      <div className="rounded-lg border bg-popover shadow-2xl overflow-hidden" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 440, maxWidth: '94vw', zIndex: 9999 }}>
        <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b">
          <span className="text-sm font-semibold">Select element ({filtered.length})</span>
          <button className="text-muted-foreground hover:text-foreground text-lg" onClick={() => { setOpen(false); setQuery(''); }}>✕</button>
        </div>
        <div className="px-3 py-2">
          <input ref={searchRef} className="w-full rounded border px-2 py-1.5 text-sm bg-background outline-none focus:border-primary" placeholder={`Search ${options.length} elements...`} value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div style={{ maxHeight: '480px', overflowY: 'auto' }} className="border-t">
          {filtered.length === 0 && <div className="px-3 py-4 text-sm text-muted-foreground text-center">No elements found</div>}
          {grouped.map(group => (
            <div key={group.page}>
              {grouped.length > 1 && <div className="sticky top-0 flex items-center gap-1 px-3 py-1 bg-muted/80 border-b text-[10px] font-semibold text-muted-foreground uppercase"><Globe className="h-3 w-3 shrink-0" /><span className="truncate">{shortPage(group.page)}</span><span className="ml-auto">{group.items.length}</span></div>}
              {group.items.map(opt => (
                <div key={opt._idx} className={`flex items-center gap-2 px-3 py-2.5 text-sm cursor-pointer hover:bg-accent/60 border-b border-border/30 ${opt.id === value ? 'bg-accent/30 font-medium' : ''}`} onClick={() => { onChange(opt); setOpen(false); setQuery(''); }}>
                  {opt.icon && <span className="shrink-0 text-base">{opt.icon}</span>}
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{opt.label}</div>{opt.sublabel && <div className="text-xs text-muted-foreground truncate mt-0.5">{opt.sublabel}</div>}</div>
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
    <div className={`relative ${className}`}>
      <div className="flex items-center rounded border bg-background px-2 py-1.5 text-sm cursor-pointer gap-1 min-h-[32px]" onClick={() => { open ? (setOpen(false), setQuery('')) : (setOpen(true), setQuery(''), setTimeout(() => searchRef.current?.focus(), 0)); }}>
        <span className={`flex-1 truncate ${selectedLabel ? 'text-foreground' : 'text-muted-foreground'}`}>{selectedLabel || placeholder}</span>
        <ChevronDown className={`h-3 w-3 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {portal}
    </div>
  );
};

// ─── Step Row ───────────────────────────────────────────────────────────────────

const StepRow: React.FC<{
  step: WebTestStep; index: number; total: number; catalog: WebElementCatalog | null;
  onUpdate: (id: string, updates: Partial<WebTestStep>) => void;
  onDelete: (id: string) => void; onMoveUp: (i: number) => void; onMoveDown: (i: number) => void;
}> = ({ step, index, total, catalog, onUpdate, onDelete, onMoveUp, onMoveDown }) => {
  const stepDef = STEP_TYPES.find(s => s.type === step.type);
  const Icon = stepDef?.icon || Type;
  const catDef = STEP_CATEGORIES.find(c => c.steps.some(s => s.type === step.type));

  const renderControls = () => {
    switch (step.type) {
      case 'navigate':
        return <div className="flex gap-2 mt-2"><Input placeholder="https://example.com" value={step.value || ''} onChange={e => onUpdate(step.id, { value: e.target.value })} className="flex-1 text-sm" /></div>;

      case 'enter_text': {
        const opts: ElementOption[] = (catalog?.inputs || []).map(i => ({ id: i.id, label: i.label || i.placeholder || i.id, sublabel: `${i.type} · ${i.selector}`, icon: '📥', page: i.page, data: i }));
        return (<div className="flex gap-2 mt-2">
          <ElementSearchSelect className="flex-1 min-w-0" value={step.elementId || ''} placeholder="Search input..." options={opts} onChange={opt => { const el = opt?.data; onUpdate(step.id, { elementId: opt?.id, selector: el?.selector, label: el?.label || el?.placeholder, placeholder: el?.placeholder, tag: el?.tag || el?.type, fallbackSelectors: el?.fallbackSelectors }); }} />
          <Input placeholder="Value to type" value={step.value || ''} onChange={e => onUpdate(step.id, { value: e.target.value })} className="flex-1 text-sm" />
        </div>);
      }
      case 'tap': case 'hover': case 'check': case 'uncheck': {
        const opts: ElementOption[] = [
          ...(catalog?.buttons || []).map((b, i) => ({ id: `b:${i}:${b.id}`, label: `"${b.text}"`, sublabel: `${b.type} · ${b.selector}`, icon: '🔘', page: b.page, data: b })),
          ...(catalog?.texts || []).map((t, i) => ({ id: `t:${i}:${t.id}`, label: `"${t.text.slice(0, 60)}"`, sublabel: `text · ${t.selector}`, icon: '📝', page: t.page, data: t })),
        ];
        return (<div className="flex gap-2 mt-2"><ElementSearchSelect className="flex-1" value={step.elementId || ''} placeholder="Search element..." options={opts} onChange={opt => { const el = opt?.data; onUpdate(step.id, { elementId: opt?.id, selector: el?.selector, text: el?.text || el?.label, tag: el?.tag, role: el?.role || 'button', fallbackSelectors: el?.fallbackSelectors }); }} /></div>);
      }
      case 'select': {
        const opts: ElementOption[] = (catalog?.inputs || []).filter(i => i.type === 'select').map(i => ({ id: i.id, label: i.label || i.id, sublabel: i.selector, icon: '▾', page: i.page, data: i }));
        return (<div className="flex gap-2 mt-2"><ElementSearchSelect className="flex-1" value={step.elementId || ''} placeholder="Search dropdown..." options={opts} onChange={opt => { onUpdate(step.id, { elementId: opt?.id, selector: opt?.data?.selector }); }} /><Input placeholder="Option value" value={step.value || ''} onChange={e => onUpdate(step.id, { value: e.target.value })} className="flex-1 text-sm" /></div>);
      }
      case 'press_key':
        return (<div className="flex gap-2 mt-2"><select className="flex-1 rounded border px-3 py-2 text-sm bg-background" value={step.value || ''} onChange={e => onUpdate(step.id, { value: e.target.value })}><option value="">Select key...</option>{['Enter','Tab','Escape','Backspace','Delete','ArrowUp','ArrowDown'].map(k => <option key={k} value={k}>{k}</option>)}</select></div>);
      case 'assert_visible': case 'assert_not_visible': {
        const opts: ElementOption[] = [
          ...(catalog?.buttons || []).map((b, i) => ({ id: `b:${i}:${b.id}`, label: `"${b.text}"`, sublabel: b.selector, icon: '🔘', page: b.page, data: b })),
          ...(catalog?.texts || []).map((t, i) => ({ id: `t:${i}:${t.id}`, label: `"${t.text.slice(0, 60)}"`, sublabel: t.selector, icon: '📝', page: t.page, data: t })),
          ...(catalog?.inputs || []).map((inp, i) => ({ id: `i:${i}:${inp.id}`, label: inp.label || inp.id, sublabel: inp.selector, icon: '📥', page: inp.page, data: inp })),
        ];
        return (<div className="flex gap-2 mt-2"><ElementSearchSelect className="flex-1" value={step.elementId || ''} placeholder="Search element..." options={opts} onChange={opt => { const el = opt?.data; onUpdate(step.id, { elementId: opt?.id, selector: el?.selector, text: el?.text || '', tag: el?.tag, role: el?.role, fallbackSelectors: el?.fallbackSelectors }); }} /></div>);
      }
      case 'assert_text': {
        const opts: ElementOption[] = [
          { id: '', label: '(body — any text on page)', sublabel: 'searches entire page', icon: '🌐', data: null },
          ...(catalog?.texts || []).map(t => ({ id: t.selector, label: `"${t.text.slice(0, 60)}"`, sublabel: t.selector, icon: '📝', page: t.page, data: t })),
        ];
        return (<div className="flex gap-2 mt-2"><ElementSearchSelect className="flex-1" value={step.selector || ''} placeholder="Search text element..." options={opts} onChange={opt => onUpdate(step.id, { selector: opt?.id || '' })} /><Input placeholder="Expected text" value={step.text || ''} onChange={e => onUpdate(step.id, { text: e.target.value })} className="flex-1 text-sm" /></div>);
      }
      case 'wait':
        return (<div className="flex gap-2 mt-2 items-center"><span className="text-sm text-muted-foreground">Wait</span><Input type="number" value={step.value || '1000'} onChange={e => onUpdate(step.id, { value: e.target.value })} className="w-24 text-sm" /><span className="text-sm text-muted-foreground">ms</span></div>);
      case 'screenshot':
        return (<div className="flex gap-2 mt-2"><Input placeholder="Screenshot name" value={step.value || ''} onChange={e => onUpdate(step.id, { value: e.target.value })} className="flex-1 text-sm" /></div>);
      case 'set_viewport':
        return (<div className="flex gap-2 mt-2 items-center"><span className="text-sm text-muted-foreground">W:</span><Input type="number" value={step.value || '1280'} onChange={e => onUpdate(step.id, { value: e.target.value })} className="w-20 text-sm" /><span className="text-sm text-muted-foreground">H:</span><Input type="number" value={step.value2 || '720'} onChange={e => onUpdate(step.id, { value2: e.target.value })} className="w-20 text-sm" /></div>);
      default: return null;
    }
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded border bg-background hover:shadow-sm transition-all">
      <div className="flex flex-col items-center gap-0.5 text-muted-foreground cursor-grab select-none">
        <ArrowUp className="w-3 h-3 hover:text-primary" onClick={() => onMoveUp(index)} />
        <GripVertical className="w-4 h-4" />
        <ArrowDown className="w-3 h-3 hover:text-primary" onClick={() => onMoveDown(index)} />
      </div>
      <div className={`w-8 h-8 rounded ${catDef?.color || 'bg-gray-500'} flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{stepDef?.label}</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onDelete(step.id)}><Trash2 className="w-3 h-3 text-red-500" /></Button>
        </div>
        {renderControls()}
      </div>
      <span className="text-xs text-muted-foreground self-center">#{index + 1}</span>
    </div>
  );
};

// ─── Element Quick-Add Panel ────────────────────────────────────────────────────

const ElementQuickAdd: React.FC<{
  snapshot: PageSnapshot;
  onAddStep: (step: Partial<WebTestStep>) => void;
  onNavigate?: (selector: string) => void;
  navigating?: boolean;
}> = ({ snapshot, onAddStep, onNavigate, navigating }) => {
  const [tab, setTab] = useState<'inputs' | 'buttons' | 'texts'>('inputs');
  const els = snapshot.elements;
  const hasInputs = els.inputs.length > 0;
  const hasButtons = els.buttons.length > 0;
  const hasTexts = els.texts.length > 0;

  // Auto-select first non-empty tab
  const activeTab = (tab === 'inputs' && !hasInputs) ? (hasButtons ? 'buttons' : 'texts')
                  : (tab === 'buttons' && !hasButtons) ? (hasInputs ? 'inputs' : 'texts')
                  : (tab === 'texts' && !hasTexts) ? (hasInputs ? 'inputs' : 'buttons')
                  : tab;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tabs */}
      <div className="flex border-b shrink-0">
        {hasInputs && (
          <button onClick={() => setTab('inputs')} className={`flex-1 px-2 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === 'inputs' ? 'border-blue-500 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            📥 Inputs ({els.inputs.length})
          </button>
        )}
        {hasButtons && (
          <button onClick={() => setTab('buttons')} className={`flex-1 px-2 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === 'buttons' ? 'border-green-500 text-green-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            🔘 Buttons ({els.buttons.length})
          </button>
        )}
        {hasTexts && (
          <button onClick={() => setTab('texts')} className={`flex-1 px-2 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === 'texts' ? 'border-purple-500 text-purple-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            📝 Texts ({els.texts.length})
          </button>
        )}
      </div>

      {/* Element list */}
      <div className="overflow-y-auto flex-1 space-y-1 p-2">
        {activeTab === 'inputs' && els.inputs.map((inp, i) => (
          <div key={i} className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/20 rounded px-2 py-1.5 group">
            <Type className="w-3 h-3 text-blue-500 shrink-0" />
            <span className="text-xs flex-1 truncate">{inp.label || inp.placeholder || inp.name || inp.id}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">({inp.type})</span>
            <button
              onClick={() => onAddStep({ type: 'enter_text', elementId: inp.id, selector: inp.selector, label: inp.label || inp.placeholder, placeholder: inp.placeholder, tag: inp.tag, fallbackSelectors: inp.fallbackSelectors })}
              className="opacity-0 group-hover:opacity-100 shrink-0 bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded hover:bg-blue-600 transition-all"
            >
              + Enter Text
            </button>
          </div>
        ))}
        {activeTab === 'buttons' && els.buttons.map((btn, i) => (
          <div key={i} className="flex items-center gap-1.5 bg-green-50 dark:bg-green-950/20 rounded px-2 py-1.5 group">
            <MousePointerClick className="w-3 h-3 text-green-500 shrink-0" />
            <span className="text-xs flex-1 truncate">"{btn.text}"</span>
            <span className="text-[10px] text-muted-foreground shrink-0">({btn.type})</span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
              {onNavigate && (
                <button
                  disabled={navigating}
                  onClick={() => onNavigate(btn.selector)}
                  className="bg-orange-400 text-white text-[10px] px-1.5 py-0.5 rounded hover:bg-orange-500 disabled:opacity-50"
                  title="Click this element in the browser and load the resulting page"
                >
                  {navigating ? '...' : '→ Go'}
                </button>
              )}
              <button onClick={() => onAddStep({ type: 'tap', elementId: `b:${i}:${btn.id}`, selector: btn.selector, text: btn.text, tag: btn.tag, role: btn.role || 'button', fallbackSelectors: btn.fallbackSelectors })} className="bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded hover:bg-green-600">+ Click</button>
              <button onClick={() => onAddStep({ type: 'assert_visible', elementId: `b:${i}:${btn.id}`, selector: btn.selector, text: btn.text, tag: btn.tag, role: btn.role, fallbackSelectors: btn.fallbackSelectors })} className="bg-purple-500 text-white text-[10px] px-1.5 py-0.5 rounded hover:bg-purple-600">+ Assert</button>
            </div>
          </div>
        ))}
        {activeTab === 'texts' && els.texts.slice(0, 60).map((txt, i) => (
          <div key={i} className="flex items-center gap-1.5 bg-purple-50 dark:bg-purple-950/20 rounded px-2 py-1.5 group">
            <FileText className="w-3 h-3 text-purple-500 shrink-0" />
            <span className="text-xs flex-1 truncate">"{txt.text.slice(0, 70)}"</span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
              <button onClick={() => onAddStep({ type: 'assert_text', selector: txt.selector, text: txt.text.slice(0, 80) })} className="bg-purple-500 text-white text-[10px] px-1.5 py-0.5 rounded hover:bg-purple-600">+ Assert Text</button>
              <button onClick={() => onAddStep({ type: 'assert_visible', elementId: `t:${i}:${txt.id}`, selector: txt.selector, tag: txt.tag, fallbackSelectors: txt.fallbackSelectors })} className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded hover:bg-blue-600">+ Visible</button>
            </div>
          </div>
        ))}
        {activeTab === 'inputs' && !hasInputs && <p className="text-xs text-muted-foreground py-3 text-center">No inputs on this page</p>}
        {activeTab === 'buttons' && !hasButtons && <p className="text-xs text-muted-foreground py-3 text-center">No buttons on this page</p>}
        {activeTab === 'texts' && !hasTexts && <p className="text-xs text-muted-foreground py-3 text-center">No texts on this page</p>}
      </div>
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────

const WebVisualBuilder: React.FC = () => {
  // ── Session state ──
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<'idle' | 'starting' | 'loading' | 'ready'>('idle');
  const [sessionError, setSessionError] = useState('');
  const [navigating, setNavigating] = useState(false);
  const [pageUrl, setPageUrl] = useState('');
  const [snapshot, setSnapshot] = useState<PageSnapshot | null>(null);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [authConfig, setAuthConfig] = useState({ loginUrl: '', usernameSelector: '', usernameValue: '', passwordSelector: '', passwordValue: '', submitSelector: '', waitAfterLogin: 2000 });

  // ── Catalog (accumulates pages as user loads them) ──
  const [catalog, setCatalog] = useState<WebElementCatalog | null>(null);
  const [loadedPageUrls, setLoadedPageUrls] = useState<string[]>([]);
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());

  // ── Test builder state ──
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
  const [suites, setSuites] = useState<{ id: string; name: string }[]>([]);
  const [devices, setDevices] = useState<{ desktop: any[]; mobile: any[] }>({ desktop: [], mobile: [] });
  const [selectedDevice, setSelectedDevice] = useState('');
  const [showDevicePicker, setShowDevicePicker] = useState(false);

  useEffect(() => {
    api.get('/web-tests/web-test-steps').then(r => {
      const d = r.data?.data || r.data;
      if (d?.devices) setDevices(d.devices);
    }).catch(() => {});
  }, []);

  // ── Session ──────────────────────────────────────────────────────────────────

  const handleStartSession = async () => {
    setSessionStatus('starting');
    setSessionError('');
    try {
      const body: any = {};
      if (requiresLogin) {
        body.auth = {
          loginUrl: authConfig.loginUrl || undefined,
          usernameSelector: authConfig.usernameSelector,
          usernameValue: authConfig.usernameValue,
          passwordSelector: authConfig.passwordSelector,
          passwordValue: authConfig.passwordValue,
          submitSelector: authConfig.submitSelector || undefined,
          waitAfterLogin: authConfig.waitAfterLogin,
        };
      }
      const resp = await api.post('/web-tests/session', body, { timeout: 60000 });
      const id = resp.data?.data?.sessionId || resp.data?.sessionId;
      setSessionId(id);
      setSessionStatus('ready');
    } catch (err: any) {
      setSessionError(err.response?.data?.error?.message || err.message || 'Failed to start session');
      setSessionStatus('idle');
    }
  };

  const handleEndSession = async () => {
    if (sessionId) {
      await api.delete(`/web-tests/session/${sessionId}`).catch(() => {});
    }
    setSessionId(null);
    setSessionStatus('idle');
    setSnapshot(null);
    setSessionError('');
  };

  const handleLoadPage = async () => {
    if (!sessionId || !pageUrl.trim()) return;
    setSessionStatus('loading');
    setSessionError('');
    try {
      const resp = await api.post(`/web-tests/session/${sessionId}/load`, { url: pageUrl.trim() }, { timeout: 45000 });
      const data: PageSnapshot = resp.data?.data || resp.data;
      setSnapshot(data);
      setSessionStatus('ready');

      // Merge this page into the catalog
      setCatalog(prev => {
        const newPage = data.elements;
        if (!prev) {
          return {
            baseUrl: data.url,
            scannedAt: new Date().toISOString(),
            pages: [newPage],
            inputs: newPage.inputs,
            buttons: newPage.buttons,
            texts: newPage.texts,
            links: newPage.links,
            routes: [data.url],
          };
        }
        // Replace page if URL already loaded, otherwise append
        const existingIdx = prev.pages.findIndex(p => p.url.split('?')[0] === data.url.split('?')[0]);
        const pages = existingIdx >= 0
          ? prev.pages.map((p, i) => i === existingIdx ? newPage : p)
          : [...prev.pages, newPage];
        return {
          ...prev,
          pages,
          inputs: pages.flatMap(p => p.inputs),
          buttons: pages.flatMap(p => p.buttons),
          texts: pages.flatMap(p => p.texts),
          links: pages.flatMap(p => p.links),
          routes: pages.map(p => p.url),
        };
      });
      setLoadedPageUrls(prev => prev.includes(data.url) ? prev : [...prev, data.url]);
    } catch (err: any) {
      setSessionError(err.response?.data?.error?.message || err.message || 'Failed to load page');
      setSessionStatus('ready');
    }
  };

  const handleClickNavigate = async (selector: string) => {
    if (!sessionId || navigating || sessionStatus === 'loading') return;
    setNavigating(true);
    setSessionError('');
    try {
      const resp = await api.post(`/web-tests/session/${sessionId}/click`, { selector }, { timeout: 30000 });
      const data: PageSnapshot = resp.data?.data || resp.data;
      setSnapshot(data);
      setPageUrl(data.url);

      // Merge into catalog
      setCatalog(prev => {
        const newPage = data.elements;
        if (!prev) {
          return {
            baseUrl: data.url,
            scannedAt: new Date().toISOString(),
            pages: [newPage],
            inputs: newPage.inputs,
            buttons: newPage.buttons,
            texts: newPage.texts,
            links: newPage.links,
            routes: [data.url],
          };
        }
        const existingIdx = prev.pages.findIndex(p => p.url.split('?')[0] === data.url.split('?')[0]);
        const pages = existingIdx >= 0
          ? prev.pages.map((p, i) => i === existingIdx ? newPage : p)
          : [...prev.pages, newPage];
        return {
          ...prev,
          pages,
          inputs: pages.flatMap(p => p.inputs),
          buttons: pages.flatMap(p => p.buttons),
          texts: pages.flatMap(p => p.texts),
          links: pages.flatMap(p => p.links),
          routes: pages.map(p => p.url),
        };
      });
      setLoadedPageUrls(prev => prev.includes(data.url) ? prev : [...prev, data.url]);
    } catch (err: any) {
      setSessionError(err.response?.data?.error?.message || err.message || 'Navigation failed');
    } finally {
      setNavigating(false);
    }
  };

  // ── Test builder ────────────────────────────────────────────────────────────

  const addStep = useCallback((overrides: Partial<WebTestStep> = {}) => {
    const type = overrides.type || 'tap';
    const newStep: WebTestStep = {
      id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      ...(type === 'wait' ? { value: '1000' } : {}),
      ...(type === 'navigate' && catalog?.baseUrl ? { value: catalog.baseUrl } : {}),
      ...overrides,
    };
    setSteps(prev => [...prev, newStep]);
  }, [catalog]);

  const moveStep = (index: number, dir: 'up' | 'down') => {
    setSteps(prev => {
      const updated = [...prev];
      const ni = dir === 'up' ? index - 1 : index + 1;
      if (ni < 0 || ni >= updated.length) return prev;
      [updated[index], updated[ni]] = [updated[ni], updated[index]];
      return updated;
    });
  };

  const updateStep = (id: string, updates: Partial<WebTestStep>) =>
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  const deleteStep = (id: string) => setSteps(prev => prev.filter(s => s.id !== id));

  const handleGenerate = async () => {
    if (!steps.length) { setError('Add at least one step'); return; }
    setGenerating(true); setError('');
    try {
      const resp = await api.post('/web-tests/generate', { steps, baseUrl: catalog?.baseUrl, device: selectedDevice || undefined });
      setGeneratedCode(resp.data?.data?.playwrightCode || '');
    } catch (err: any) { setError(err.response?.data?.error?.message || err.message || 'Generation failed'); }
    finally { setGenerating(false); }
  };

  const handleRun = async () => {
    if (!generatedCode) { setError('Generate code first'); return; }
    setRunning(true); setError(''); setTestResult(null); setSavedTestCase(null);
    try {
      const body: any = { steps, baseUrl: catalog?.baseUrl, device: selectedDevice || undefined };

      // Prefer reusing the active session's cookies over re-logging in
      if (sessionId) {
        body.sessionId = sessionId;
      } else if (requiresLogin && authConfig.usernameSelector && authConfig.usernameValue && authConfig.passwordSelector && authConfig.passwordValue) {
        // Session already ended — fall back to re-login (only if no double-login risk accepted by user)
        body.auth = {
          loginUrl: authConfig.loginUrl || undefined,
          usernameSelector: authConfig.usernameSelector,
          usernameValue: authConfig.usernameValue,
          passwordSelector: authConfig.passwordSelector,
          passwordValue: authConfig.passwordValue,
          submitSelector: authConfig.submitSelector || undefined,
          waitAfterLogin: authConfig.waitAfterLogin,
        };
      }
      const resp = await api.post('/web-tests/run', body, { timeout: 120000 });
      const d = resp.data?.data || resp.data;
      setTestResult({ success: d?.success ?? false, output: d?.output || '', duration: d?.duration ?? 0 });
    } catch (err: any) { setError(err.response?.data?.error?.message || err.message || 'Run failed'); }
    finally { setRunning(false); }
  };

  const handleSaveAsTestCase = async () => {
    if (!generatedCode) { setError('Generate code first'); return; }
    setSaveForm(f => ({ ...f, title: f.title || `Web Test - ${catalog?.baseUrl || 'untitled'}` }));
    try {
      const resp = await api.get('/test-suites?perPage=100');
      setSuites((resp.data?.data || []).map((s: any) => ({ id: s.id, name: s.name })));
    } catch { setSuites([]); }
    setShowSaveDialog(true);
  };

  const handleSaveDialogSubmit = async () => {
    if (!saveForm.title.trim()) return;
    setSavingTestCase(true); setError('');
    try {
      const resp = await api.post('/web-tests/save-testcase', {
        title: saveForm.title.trim(), description: saveForm.description.trim() || undefined,
        priority: saveForm.priority, suiteId: saveForm.suiteId || undefined,
        steps, generatedCode, baseUrl: catalog?.baseUrl,
        testResult: testResult ? { success: testResult.success, output: testResult.output, duration: testResult.duration } : undefined,
      });
      const saved = resp.data?.data;
      setSavedTestCase({ id: saved?.id, title: saved?.title });
      setShowSaveDialog(false);
    } catch (err: any) { setError(err.response?.data?.error?.message || err.message || 'Save failed'); }
    finally { setSavingTestCase(false); }
  };

  const formatDuration = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

  const togglePageExpanded = (i: number) => setExpandedPages(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  const isSessionActive = sessionId && sessionStatus !== 'idle';

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Web Visual Builder</h1>
          <p className="text-muted-foreground text-sm">Navigate pages, pick elements, compose Playwright tests</p>
        </div>

        {/* Device picker */}
        <div className="relative">
          <button onClick={() => setShowDevicePicker(!showDevicePicker)} className="flex items-center gap-2 px-3 py-2 rounded border bg-background hover:bg-muted text-sm">
            <span className="text-base">{selectedDevice ? (devices.mobile.find(d => d.id === selectedDevice)?.icon || '📱') : '🖥️'}</span>
            <span>{selectedDevice ? (devices.mobile.find(d => d.id === selectedDevice)?.label || devices.desktop.find(d => d.id === selectedDevice)?.label || 'Desktop') : 'Desktop'}</span>
            <span className="text-xs text-muted-foreground">▼</span>
          </button>
          {showDevicePicker && (
            <div className="absolute right-0 top-full mt-1 bg-card border rounded-lg shadow-lg w-64 z-50">
              <div className="p-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Desktop</div>
                <div className="space-y-1">{devices.desktop.map(d => (<button key={d.id || 'default'} onClick={() => { setSelectedDevice(d.id); setShowDevicePicker(false); }} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm ${selectedDevice === d.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><span>{d.icon}</span><span className="truncate">{d.label}</span></button>))}</div>
              </div>
              <div className="border-t p-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Mobile</div>
                <div className="space-y-1">{devices.mobile.map(d => (<button key={d.id} onClick={() => { setSelectedDevice(d.id); setShowDevicePicker(false); }} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm ${selectedDevice === d.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><span>{d.icon}</span><span className="truncate">{d.label}</span></button>))}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Session Panel ── */}
      <Card>
        <CardContent className="pt-4 pb-3 space-y-3">

          {/* Status bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isSessionActive ? (sessionStatus === 'loading' ? 'bg-yellow-400 animate-pulse' : 'bg-green-500') : 'bg-gray-300'}`} />
              <span className="text-sm font-medium">
                {sessionStatus === 'idle' ? 'No session' :
                 sessionStatus === 'starting' ? 'Starting session...' :
                 sessionStatus === 'loading' ? 'Loading page...' : 'Session active'}
              </span>
            </div>
            {isSessionActive && (
              <button onClick={handleEndSession} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 border border-red-200 rounded px-2 py-1 hover:bg-red-50">
                <LogOut className="w-3 h-3" /> End Session
              </button>
            )}
            {loadedPageUrls.length > 0 && (
              <span className="text-xs text-muted-foreground ml-auto">{loadedPageUrls.length} page{loadedPageUrls.length !== 1 ? 's' : ''} loaded</span>
            )}
          </div>

          {/* Start session form (when idle) */}
          {!isSessionActive && (
            <div className="space-y-3">
              <button type="button" onClick={() => setRequiresLogin(v => !v)} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground w-fit">
                <span className={`w-8 h-4 rounded-full flex items-center px-0.5 transition-colors ${requiresLogin ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                  <span className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${requiresLogin ? 'translate-x-4' : 'translate-x-0'}`} />
                </span>
                <LogIn className="w-3 h-3" /> Requires Login
              </button>

              {requiresLogin && (
                <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Login Credentials</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1"><Label className="text-xs">Login URL <span className="text-muted-foreground">(optional)</span></Label><Input type="url" placeholder="https://example.com/login" value={authConfig.loginUrl} onChange={e => setAuthConfig(p => ({ ...p, loginUrl: e.target.value }))} className="h-8 text-xs" /></div>
                    <div className="flex flex-col gap-1"><Label className="text-xs">Wait after login (ms)</Label><Input type="number" value={authConfig.waitAfterLogin} onChange={e => setAuthConfig(p => ({ ...p, waitAfterLogin: parseInt(e.target.value) || 2000 }))} className="h-8 text-xs" /></div>
                    <div className="flex flex-col gap-1"><Label className="text-xs">Username selector <span className="text-red-500">*</span></Label><Input placeholder='personalNumber' value={authConfig.usernameSelector} onChange={e => setAuthConfig(p => ({ ...p, usernameSelector: e.target.value }))} className="h-8 text-xs font-mono" /></div>
                    <div className="flex flex-col gap-1"><Label className="text-xs">Username / Email <span className="text-red-500">*</span></Label><Input placeholder="user@example.com" value={authConfig.usernameValue} onChange={e => setAuthConfig(p => ({ ...p, usernameValue: e.target.value }))} className="h-8 text-xs" /></div>
                    <div className="flex flex-col gap-1"><Label className="text-xs">Password selector <span className="text-red-500">*</span></Label><Input placeholder='input[type="password"]' value={authConfig.passwordSelector} onChange={e => setAuthConfig(p => ({ ...p, passwordSelector: e.target.value }))} className="h-8 text-xs font-mono" /></div>
                    <div className="flex flex-col gap-1"><Label className="text-xs">Password <span className="text-red-500">*</span></Label><Input type="password" placeholder="••••••••" value={authConfig.passwordValue} onChange={e => setAuthConfig(p => ({ ...p, passwordValue: e.target.value }))} className="h-8 text-xs" /></div>
                    <div className="col-span-2 flex flex-col gap-1"><Label className="text-xs">Submit selector <span className="text-muted-foreground">(optional)</span></Label><Input placeholder='button[type="submit"] or MASUK' value={authConfig.submitSelector} onChange={e => setAuthConfig(p => ({ ...p, submitSelector: e.target.value }))} className="h-8 text-xs font-mono" /></div>
                  </div>
                </div>
              )}

              <Button onClick={handleStartSession} disabled={sessionStatus === 'starting'} size="sm">
                {sessionStatus === 'starting' ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <MonitorPlay className="w-3 h-3 mr-1" />}
                {sessionStatus === 'starting' ? (requiresLogin ? 'Logging in...' : 'Starting...') : 'Start Session'}
              </Button>
            </div>
          )}

          {/* URL loader (when session active) */}
          {isSessionActive && (
            <div className="flex gap-2">
              <Input
                type="url"
                value={pageUrl}
                onChange={e => setPageUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLoadPage()}
                placeholder="https://example.com/dashboard"
                className="flex-1"
              />
              <Button onClick={handleLoadPage} disabled={sessionStatus === 'loading' || !pageUrl.trim()} size="sm">
                {sessionStatus === 'loading' ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                {sessionStatus === 'loading' ? 'Loading...' : 'Load Page'}
              </Button>
            </div>
          )}

          {sessionError && (
            <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 p-2.5 rounded">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {sessionError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Page Preview + Elements ── */}
      {snapshot && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-sm font-semibold truncate">{snapshot.title || 'Page'}</CardTitle>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">{snapshot.url}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Badge variant="outline" className="text-[10px]">{snapshot.elements.inputs.length} inputs</Badge>
                <Badge variant="outline" className="text-[10px]">{snapshot.elements.buttons.length} buttons</Badge>
                <Badge variant="outline" className="text-[10px]">{snapshot.elements.texts.length} texts</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-5 gap-3" style={{ minHeight: 280 }}>
              {/* Screenshot — scrollable so full-page screenshots aren't clipped */}
              <div className="col-span-3 rounded border bg-gray-50" style={{ maxHeight: 560, overflowY: 'auto' }}>
                <img
                  src={`data:image/png;base64,${snapshot.screenshot}`}
                  alt="Page preview"
                  className="w-full h-auto"
                />
              </div>
              {/* Element quick-add */}
              <div className="col-span-2 border rounded overflow-hidden flex flex-col" style={{ maxHeight: 560 }}>
                <div className="px-2 pt-2 pb-1 border-b bg-muted/30 shrink-0">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Elements — hover to add step or navigate
                  </p>
                </div>
                <ElementQuickAdd
                  snapshot={snapshot}
                  onAddStep={partial => addStep(partial)}
                  onNavigate={isSessionActive ? handleClickNavigate : undefined}
                  navigating={navigating}
                />
              </div>
            </div>

            {/* Navigate to this URL step button */}
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => addStep({ type: 'navigate', value: snapshot.url })}
                className="text-xs text-blue-600 hover:text-blue-700 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50"
              >
                + Navigate to this page
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Loaded Pages Catalog ── */}
      {catalog && catalog.pages.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">All Loaded Pages</CardTitle>
              <div className="flex gap-2">
                <Badge variant="outline">{catalog.pages.length} Pages</Badge>
                <Badge variant="outline">{catalog.inputs.length} Inputs</Badge>
                <Badge variant="outline">{catalog.buttons.length} Buttons</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
              {catalog.pages.map((page, idx) => {
                const isOpen = expandedPages.has(idx);
                return (
                  <div key={idx} className="rounded border bg-background">
                    <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 text-left" onClick={() => togglePageExpanded(idx)}>
                      {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                      <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium truncate flex-1">{page.name || page.url}</span>
                      <div className="flex gap-1.5 shrink-0">
                        {page.inputs.length > 0 && <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-blue-600 border-blue-200">{page.inputs.length} in</Badge>}
                        {page.buttons.length > 0 && <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-green-600 border-green-200">{page.buttons.length} btn</Badge>}
                        {page.texts.length > 0 && <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-purple-600 border-purple-200">{page.texts.length} txt</Badge>}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t px-3 pb-2">
                        <p className="text-[10px] text-muted-foreground truncate py-1">{page.url}</p>
                        <div className="max-h-[160px] overflow-y-auto space-y-1">
                          {page.inputs.map(inp => <div key={inp.id} className="flex items-center gap-1.5 bg-blue-50 rounded px-2 py-1"><Type className="w-3 h-3 text-blue-500" /><span className="text-xs truncate">{inp.label || inp.placeholder || inp.id}</span></div>)}
                          {page.buttons.map(btn => <div key={btn.id} className="flex items-center gap-1.5 bg-green-50 rounded px-2 py-1"><MousePointerClick className="w-3 h-3 text-green-500" /><span className="text-xs truncate">"{btn.text}"</span></div>)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 3-Column Builder ── */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left: Palette */}
        <div className="col-span-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Step Palette</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-4">
              {STEP_CATEGORIES.map(cat => (
                <div key={cat.name}>
                  <div className="flex items-center gap-2 mb-2"><div className={`w-3 h-3 rounded ${cat.color}`} /><span className="text-xs font-semibold text-muted-foreground uppercase">{cat.name}</span></div>
                  <div className="space-y-1">
                    {cat.steps.map(st => (
                      <button key={st.type} onClick={() => addStep({ type: st.type })} className="w-full flex items-center gap-2 p-2 rounded border hover:bg-muted text-left">
                        <div className={`w-6 h-6 rounded ${cat.color} flex items-center justify-center`}><st.icon className="w-3 h-3 text-white" /></div>
                        <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{st.label}</div><div className="text-[11px] text-muted-foreground truncate">{st.desc}</div></div>
                        <Plus className="w-3 h-3 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
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
                    <p className="text-sm">Load a page and click elements to add steps,</p>
                    <p className="text-sm">or click from the palette on the left</p>
                  </div>
                ) : steps.map((step, i) => (
                  <StepRow key={step.id} step={step} index={i} total={steps.length} catalog={catalog}
                    onUpdate={updateStep} onDelete={deleteStep} onMoveUp={i => moveStep(i, 'up')} onMoveDown={i => moveStep(i, 'down')} />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Code + Results */}
        <div className="col-span-4">
          <Card className="h-full">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Code2 className="w-4 h-4" /> Generated Code</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Button onClick={handleGenerate} disabled={generating || !steps.length} size="sm">
                  {generating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Code2 className="w-3 h-3 mr-1" />} Generate
                </Button>
                <Button onClick={handleRun} disabled={running || !generatedCode} size="sm" variant="secondary">
                  {running ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />} Run Test
                </Button>
                {testResult && (
                  <Button onClick={handleSaveAsTestCase} disabled={savingTestCase || !!savedTestCase} size="sm" variant="outline" className="border-blue-300 text-blue-600">
                    {savingTestCase ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <FileText className="w-3 h-3 mr-1" />}
                    {savedTestCase ? '✓ Saved!' : 'Save as Test Case'}
                  </Button>
                )}
              </div>
              {generatedCode && <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs font-mono max-h-[300px] overflow-y-auto whitespace-pre-wrap break-all">{generatedCode}</pre>}
              {testResult && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {testResult.success
                      ? <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3 mr-1" />PASSED</Badge>
                      : <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />FAILED</Badge>}
                    <span className="text-xs text-muted-foreground">{formatDuration(testResult.duration)}</span>
                  </div>
                  {testResult.output && <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all">{testResult.output}</pre>}
                  {savedTestCase && (
                    <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 p-2 rounded">
                      <CheckCircle2 className="w-3 h-3" /> Saved: <strong>{savedTestCase.title}</strong>
                      <a href="/test-cases" className="underline ml-1">View →</a>
                    </div>
                  )}
                </div>
              )}
              {error && <div className="flex items-center gap-2 text-sm text-red-500"><AlertTriangle className="w-3 h-3" /> {error}</div>}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Save Dialog ── */}
      {showSaveDialog && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowSaveDialog(false)} />
          <div className="rounded-lg border bg-popover shadow-2xl overflow-hidden" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 480, maxWidth: '94vw', zIndex: 9999 }}>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div><h3 className="text-sm font-semibold">Save as Test Case</h3><p className="text-xs text-muted-foreground mt-0.5">Fill in test case details</p></div>
              <button className="text-muted-foreground hover:text-foreground text-lg" onClick={() => setShowSaveDialog(false)}>✕</button>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div><label className="block text-xs font-medium mb-1">Name <span className="text-red-500">*</span></label><input className="w-full rounded border px-2 py-1.5 text-sm bg-background outline-none focus:border-primary" placeholder="e.g. Login flow test" value={saveForm.title} onChange={e => setSaveForm(f => ({ ...f, title: e.target.value }))} autoFocus /></div>
              <div><label className="block text-xs font-medium mb-1">Description</label><textarea className="w-full rounded border px-2 py-1.5 text-sm bg-background outline-none focus:border-primary resize-none" rows={2} placeholder="Optional description" value={saveForm.description} onChange={e => setSaveForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium mb-1">Priority</label><select className="w-full rounded border px-2 py-1.5 text-sm bg-background" value={saveForm.priority} onChange={e => setSaveForm(f => ({ ...f, priority: e.target.value }))}><option value="low">🟢 Low</option><option value="medium">🟡 Medium</option><option value="high">🔴 High</option></select></div>
                <div><label className="block text-xs font-medium mb-1">Test Suite</label><select className="w-full rounded border px-2 py-1.5 text-sm bg-background" value={saveForm.suiteId} onChange={e => setSaveForm(f => ({ ...f, suiteId: e.target.value }))}><option value="">— No suite —</option>{suites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t bg-muted/30">
              <button className="px-3 py-1.5 rounded text-sm text-muted-foreground hover:bg-muted" onClick={() => setShowSaveDialog(false)}>Cancel</button>
              <button className="px-4 py-1.5 rounded text-sm bg-primary text-primary-foreground hover:bg-primary/90 font-medium disabled:opacity-50" disabled={!saveForm.title.trim() || savingTestCase} onClick={handleSaveDialogSubmit}>{savingTestCase ? 'Saving...' : 'Save Test Case'}</button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

export default WebVisualBuilder;
