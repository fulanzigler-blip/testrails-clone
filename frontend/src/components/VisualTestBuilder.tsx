import React, { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { MOBILE_DEVICES, type MobileDevice, DEVICE_CATEGORIES } from '../config/devices';
import {
  Scan, Play, Loader2, CheckCircle2, XCircle, GripVertical,
  FileText,
  Type, MousePointerClick, Clock, Terminal, Code2, AlertTriangle,
  Eye, EyeOff, ArrowUp, ArrowDown, Plus, Trash2, Layers, Smartphone,
  ChevronDown, ChevronRight, Video, VideoOff, RefreshCw, Hand,
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
  texts: { id: string; text: string; screen?: string; isStatic: boolean; source?: string; modelClass?: string; fieldName?: string }[];
  auth?: { flow: 'tap' | 'onFieldSubmitted'; loginButton?: string; credentials: { email: string; password: string; role: string }[] };
  routes: string[];
  // Hybrid scan extra fields
  apiEndpoints?: Array<{ method: string; url: string; file: string; line: number; responseModel?: string }>;
  responseModels?: Array<{ fieldName: string; fieldType: string; modelClass: string; sourceFile: string }>;
  dynamicContentHints?: Array<{ screenFile: string; screenName: string; widgetPattern: string; description: string; responseFields: any[] }>;
  source?: 'ssh' | 'hybrid';
}

interface TestStep {
  id: string;
  type: 'enter_text' | 'tap' | 'double_tap' | 'long_press' | 'scroll' | 'scroll_until_visible' | 'send_key' | 'hide_keyboard' | 'assert_visible' | 'assert_not_visible' | 'assert_text' | 'wait' | 'screenshot' | 'set_surface_size';
  elementId?: string;
  value?: string;
  text?: string;
  value2?: string; // For surface size width or scroll dy
  finderStrategy?: 'text' | 'semantics' | 'key' | 'type'; // Flutter finder from live view
  finderValue?: string;
}

// ─── Live View Types ────────────────────────────────────────────────────────────

const DEVICE_NATIVE_W = 1080;
const DEVICE_NATIVE_H = 1920;

interface LiveElement {
  text: string; contentDesc: string; resourceId: string; idShort: string; className: string;
  clickable: boolean; isInput: boolean; isCheckable: boolean;
  bounds: string; x1: number; y1: number; x2: number; y2: number;
  selector: string;
  elementType: 'button' | 'input' | 'checkbox' | 'text';
  finderStrategy: 'text' | 'semantics' | 'key' | 'type';
  finderValue: string;
}

interface FlutterWidget {
  description: string; widgetId?: string;
  text?: string; key?: string; tooltip?: string;
  elementType?: 'button' | 'input' | 'text' | 'checkbox' | 'other';
  finderStrategy?: 'text' | 'key' | 'tooltip' | 'type';
  finderValue?: string;
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
  const [tapSearch, setTapSearch] = React.useState('');
  const [tapOpen, setTapOpen] = React.useState(false);
  const [tapLabel, setTapLabel] = React.useState('');
  const tapRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!tapOpen) return;
    const handler = (e: MouseEvent) => {
      if (tapRef.current && !tapRef.current.contains(e.target as Node)) setTapOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tapOpen]);

  const renderControls = () => {
    switch (step.type) {
      case 'enter_text': {
        const hasLiveEl = !!(step.finderValue && step.elementId && !catalog?.screens.some(s => s.inputs?.some(i => i.id === step.elementId)));
        return (
          <div className="flex gap-2 mt-2">
            <select
              className="flex-1 rounded border px-3 py-2 text-sm bg-background min-w-0"
              value={step.elementId || ''}
              onChange={(e) => onUpdate(step.id, { elementId: e.target.value })}
            >
              <option value="">Select input field...</option>
              {hasLiveEl && <option value={step.elementId}>📍 {step.text || step.finderValue} (live)</option>}
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
      }
      case 'tap': {
        // Build flat list with UNIQUE select values = `${idx}:${id}` to prevent any value collision
        type TapOption = { idx: number; id: string; label: string; screen: string };
        const allTapOptions: TapOption[] = [];
        let tapIdx = 0;
        (catalog?.buttons || []).forEach(btn => {
          allTapOptions.push({ idx: tapIdx++, id: btn.id, label: `🔘 ${btn.text} (${btn.type})`, screen: (btn as any).screen || '' });
        });
        (catalog?.texts || []).forEach(txt => {
          const prefix = (txt as any).source === 'api-inference' ? '⚡' : '📝';
          allTapOptions.push({ idx: tapIdx++, id: txt.id, label: `${prefix} ${txt.text}`, screen: (txt as any).screen || '' });
        });

        const searchLower = tapSearch.toLowerCase();
        const filtered = tapSearch
          ? allTapOptions.filter(o => o.label.toLowerCase().includes(searchLower) || o.screen.toLowerCase().includes(searchLower))
          : allTapOptions;

        // Current select value — find first option whose id matches step.elementId
        const currentOpt = step.elementId ? allTapOptions.find(o => o.id === step.elementId) : undefined;
        const isLiveTap = !currentOpt && !!(step.finderValue || step.finderStrategy);
        const LIVE_SENTINEL = '__live__';
        const selectVal = currentOpt ? `${currentOpt.idx}:${currentOpt.id}` : isLiveTap ? LIVE_SENTINEL : '';

        return (
          <div className="mt-2 space-y-1.5">
            <Input
              placeholder="Search element... (e.g. Simpanan)"
              value={tapSearch}
              onChange={e => setTapSearch(e.target.value)}
              className="h-8 text-sm"
            />
            <select
              className="w-full rounded border px-3 py-2 text-sm bg-background"
              value={selectVal}
              onChange={e => {
                if (e.target.value === LIVE_SENTINEL || e.target.value === '') { onUpdate(step.id, { elementId: '' }); return; }
                const [, ...rest] = e.target.value.split(':');
                const realId = rest.join(':');
                onUpdate(step.id, { elementId: realId });
              }}
              size={tapSearch && filtered.length > 0 ? Math.min(filtered.length + 1, 10) : 1}
            >
              <option value="">Select element...</option>
              {isLiveTap && <option value={LIVE_SENTINEL}>📍 {step.text || step.finderValue} (live)</option>}
              {filtered.map(o => (
                <option key={o.idx} value={`${o.idx}:${o.id}`}>
                  {o.label}{o.screen ? ` — ${o.screen}` : ''}
                </option>
              ))}
            </select>
          </div>
        );
      }
      case 'hide_keyboard':
        return (
          <div className="mt-1 text-xs text-muted-foreground">
            Submits form via keyboard "Done" using <code className="bg-muted px-1 rounded">receiveAction(TextInputAction.done)</code>
          </div>
        );
      case 'double_tap':
      case 'long_press': {
        const hasLiveDbl = !!(step.finderValue && step.elementId && !catalog?.screens.some(s => [...(s.buttons || []), ...(s.texts || [])].some(e => e.id === step.elementId)));
        return (
          <div className="mt-2">
            <select
              className="w-full rounded border px-3 py-2 text-sm bg-background"
              value={step.elementId || ''}
              onChange={(e) => onUpdate(step.id, { elementId: e.target.value })}
            >
              <option value="">Select element...</option>
              {hasLiveDbl && <option value={step.elementId}>📍 {step.text || step.finderValue} (live)</option>}
              {catalog?.screens.filter(s => (s.buttons?.length || 0) > 0 || (s.texts?.length || 0) > 0).map(screen => (
                <optgroup key={screen.name} label={`📱 ${screen.name}`}>
                  {(screen.buttons || []).map(btn => (
                    <option key={btn.id} value={btn.id}>"{btn.text}"</option>
                  ))}
                  {(screen.texts || []).slice(0, 30).map(txt => (
                    <option key={txt.id} value={txt.id}>
                      {(txt as any).source === 'api-inference' ? '⚡ ' : ''}"{txt.text}"
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        );
      }
      case 'scroll':
        return (
          <div className="flex gap-2 mt-2 items-center">
            <span className="text-sm text-muted-foreground">dy:</span>
            <Input type="number" value={step.value || '-300'} onChange={(e) => onUpdate(step.id, { value: e.target.value })} className="w-20 text-sm" />
            <span className="text-sm text-muted-foreground">dx:</span>
            <Input type="number" value={step.value2 || '0'} onChange={(e) => onUpdate(step.id, { value2: e.target.value })} className="w-20 text-sm" />
          </div>
        );
      case 'scroll_until_visible': {
        const hasLiveSuv = !!(step.finderValue && step.elementId && !catalog?.screens.some(s => [...(s.buttons || []), ...(s.texts || [])].some(e => e.id === step.elementId)));
        return (
          <div className="mt-2">
            <select
              className="w-full rounded border px-3 py-2 text-sm bg-background"
              value={step.elementId || ''}
              onChange={(e) => onUpdate(step.id, { elementId: e.target.value })}
            >
              <option value="">Select target element...</option>
              {hasLiveSuv && <option value={step.elementId}>📍 {step.text || step.finderValue} (live)</option>}
              {catalog?.screens.filter(s => (s.texts?.length || 0) > 0 || (s.buttons?.length || 0) > 0).map(screen => (
                <optgroup key={screen.name} label={`📱 ${screen.name}`}>
                  {(screen.buttons || []).map(btn => (
                    <option key={btn.id} value={btn.id}>"{btn.text}"</option>
                  ))}
                  {(screen.texts || []).slice(0, 40).map(txt => (
                    <option key={txt.id} value={txt.id}>
                      {(txt as any).source === 'api-inference' ? '⚡ ' : ''}"{txt.text}"
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        );
      }
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
      case 'assert_not_visible': {
        const hasLiveAssert = !!(step.finderValue && step.elementId && !catalog?.screens.some(s => [...(s.buttons || []), ...(s.texts || [])].some(e => e.id === step.elementId)));
        return (
          <div className="mt-2">
            <select
              className="w-full rounded border px-3 py-2 text-sm bg-background"
              value={step.elementId || ''}
              onChange={(e) => onUpdate(step.id, { elementId: e.target.value })}
            >
              <option value="">Select text/button...</option>
              {hasLiveAssert && <option value={step.elementId}>📍 {step.text || step.finderValue} (live)</option>}
              {catalog?.screens.filter(s => ((s.buttons?.length || 0) > 0 || (s.texts?.length || 0) > 0)).map(screen => (
                <optgroup key={screen.name} label={`📱 ${screen.name}`}>
                  {(screen.buttons || []).map(btn => (
                    <option key={btn.id} value={btn.id}>"{btn.text}"</option>
                  ))}
                  {(screen.texts || []).slice(0, 30).map(txt => (
                    <option key={txt.id} value={txt.id}>
                      {(txt as any).source === 'api-inference' ? '⚡ ' : ''}"{txt.text}"
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        );
      }
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

// ─── Element List ─────────────────────────────────────────────────────────────

const ElementList: React.FC<{
  elements: LiveElement[];
  isFlutterSession: boolean;
  onClear: () => void;
  onAddStep: (type: 'tap' | 'enter_text' | 'assert_visible' | 'assert_text', el: LiveElement, value?: string) => void;
}> = ({ elements, isFlutterSession, onClear, onAddStep }) => {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [enterValues, setEnterValues] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState('');

  const filtered = filter
    ? elements.filter(el => (el.text || el.finderValue || el.elementType).toLowerCase().includes(filter.toLowerCase()))
    : elements;

  const typeColor = (t: string) =>
    t === 'input' ? 'bg-blue-100 text-blue-700' : t === 'button' ? 'bg-green-100 text-green-700' : t === 'checkbox' ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700';
  const typeDot = (t: string) =>
    t === 'input' ? 'bg-blue-400' : t === 'button' ? 'bg-green-400' : t === 'checkbox' ? 'bg-orange-400' : 'bg-purple-400';

  return (
    <div className="border rounded-lg overflow-hidden flex flex-col bg-background" style={{ maxHeight: 480 }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 shrink-0">
        <span className="text-xs font-semibold flex-1">
          {elements.length} elements {isFlutterSession && <span className="text-violet-600 font-normal">(Flutter semantics)</span>}
        </span>
        <div className="flex gap-2 text-[10px] text-muted-foreground">
          <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-0.5" />{elements.filter(e => e.elementType === 'button').length}</span>
          <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mr-0.5" />{elements.filter(e => e.elementType === 'input').length}</span>
          <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400 mr-0.5" />{elements.filter(e => e.elementType === 'text').length}</span>
        </div>
        <button onClick={onClear} className="text-[10px] text-muted-foreground hover:text-foreground underline shrink-0">Clear</button>
      </div>
      {/* Search */}
      <div className="px-2 py-1.5 border-b shrink-0">
        <input
          className="w-full rounded border px-2 py-1 text-xs bg-background"
          placeholder="Filter elements..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>
      {/* List */}
      <div className="overflow-y-auto flex-1">
        {filtered.length === 0 && (
          <p className="text-[11px] text-muted-foreground p-3">No elements match filter</p>
        )}
        {filtered.map((el, i) => {
          const label = el.text || el.contentDesc || el.finderValue || el.elementType;
          const isExpanded = expandedIdx === i;
          return (
            <div key={i} className={`border-b last:border-b-0 ${isExpanded ? 'bg-muted/40' : 'hover:bg-muted/20'}`}>
              {/* Row */}
              <div className="flex items-center gap-2 px-2 py-2">
                <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${typeDot(el.elementType)}`} />
                <span className="flex-1 text-xs truncate min-w-0" title={label}>{label}</span>
                <span className={`shrink-0 text-[10px] font-medium px-1 py-0.5 rounded ${typeColor(el.elementType)}`}>{el.elementType}</span>
                {/* Quick action buttons */}
                <button
                  onClick={() => onAddStep('tap', el)}
                  className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-green-500 text-white hover:bg-green-600"
                  title="Add Tap step"
                >Tap</button>
                {el.isInput && (
                  <button
                    onClick={() => setExpandedIdx(isExpanded ? null : i)}
                    className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${isExpanded ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                    title="Enter text"
                  >Text</button>
                )}
                <button
                  onClick={() => onAddStep('assert_visible', el)}
                  className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 hover:bg-purple-200"
                  title="Assert visible"
                >Assert</button>
              </div>
              {/* Expanded enter-text panel */}
              {isExpanded && el.isInput && (
                <div className="px-2 pb-2 flex gap-1.5">
                  <input
                    autoFocus
                    className="flex-1 rounded border px-2 py-1 text-xs bg-background"
                    placeholder="Text to enter..."
                    value={enterValues[i] || ''}
                    onChange={e => setEnterValues(v => ({ ...v, [i]: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && enterValues[i]) {
                        onAddStep('enter_text', el, enterValues[i]);
                        setExpandedIdx(null);
                        setEnterValues(v => ({ ...v, [i]: '' }));
                      }
                    }}
                  />
                  <button
                    disabled={!enterValues[i]}
                    onClick={() => { onAddStep('enter_text', el, enterValues[i]); setExpandedIdx(null); setEnterValues(v => ({ ...v, [i]: '' })); }}
                    className="shrink-0 text-[10px] px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40"
                  >+ Enter</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Live View Panel ──────────────────────────────────────────────────────────

const LiveViewPanel: React.FC<{
  runnerId?: string;
  testRunning?: boolean;
  testResult?: { success: boolean } | null;
  onStepAdded: (step: Partial<TestStep>) => void;
}> = ({ runnerId, testRunning = false, testResult, onStepAdded }) => {
  const [active, setActive] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [fetching, setFetching] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(0);
  const [pickedEl, setPickedEl] = useState<LiveElement | null>(null);
  const [pickPos, setPickPos] = useState<{ px: number; py: number } | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [enterTextValue, setEnterTextValue] = useState('');
  const [manualFinderValue, setManualFinderValue] = useState('');
  const [stepCount, setStepCount] = useState(0);
  // UIAutomator scan mode
  const [scanning, setScanning] = useState(false);
  const [scannedElements, setScannedElements] = useState<LiveElement[]>([]);
  const [hoveredEl, setHoveredEl] = useState<LiveElement | null>(null);
  const [screenW, setScreenW] = useState(1);
  const [screenH, setScreenH] = useState(1);
  // Flutter VM Service session mode
  const [flutterSessionId, setFlutterSessionId] = useState<string | null>(null);
  const [sessionStarting, setSessionStarting] = useState(false);
  const [flutterWidgets, setFlutterWidgets] = useState<FlutterWidget[]>([]);
  const [scanningWidgets, setScanningWidgets] = useState(false);
  const [pickedWidget, setPickedWidget] = useState<any | null>(null);
  const [pickedWidgetBounds, setPickedWidgetBounds] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const [autoScan, setAutoScan] = useState(true);
  const [injecting, setInjecting] = useState(false);
  const [injectResult, setInjectResult] = useState<{ filesModified: number; totalInjected: number } | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchingRef = useRef(false);
  const prevTestRunning = useRef(false);
  const prevScreenshotRef = useRef<string | null>(null);
  const changeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanningRef = useRef(false);
  const flutterSessionIdRef = useRef<string | null>(null);

  // Compare two screenshots via offscreen canvas (returns 0..1 ratio of changed pixels)
  const pixelDiff = useCallback((b64a: string, b64b: string): Promise<number> => {
    return new Promise(resolve => {
      const W = 54, H = 96;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      // Add willReadFrequently for better performance with repeated getImageData calls
      (canvas as any).willReadFrequently = true;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(1); return; }
      const img1 = new Image();
      img1.onload = () => {
        ctx.drawImage(img1, 0, 0, W, H);
        const d1 = ctx.getImageData(0, 0, W, H).data;
        const img2 = new Image();
        img2.onload = () => {
          ctx.drawImage(img2, 0, 0, W, H);
          const d2 = ctx.getImageData(0, 0, W, H).data;
          let diff = 0;
          for (let i = 0; i < d1.length; i += 4) {
            if (Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]) > 40) diff++;
          }
          resolve(diff / (W * H));
        };
        img2.src = `data:image/png;base64,${b64b}`;
      };
      img1.src = `data:image/png;base64,${b64a}`;
    });
  }, []);

  const fetchScreenshot = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setFetching(true);
    try {
      const params = runnerId ? `?runnerId=${runnerId}` : '';
      const resp = await api.get(`/integration-tests/screenshot${params}`, { timeout: 30000 });
      const s = resp.data?.data?.screenshot || resp.data?.screenshot;
      if (s) {
        setScreenshot(s); setLastUpdated(Date.now()); setError('');
        if (testRunning) setStepCount(c => c + 1);

        // Auto-scan on page change detection
        if (autoScan && !testRunning && prevScreenshotRef.current && s !== prevScreenshotRef.current) {
          const diff = await pixelDiff(prevScreenshotRef.current, s);
          if (diff > 0.12) {
            // Screen changed significantly — debounce then scan
            if (changeTimerRef.current) clearTimeout(changeTimerRef.current);
            setScannedElements([]); setFlutterWidgets([]); setPickedEl(null); setPickedWidget(null);
            changeTimerRef.current = setTimeout(() => {
              if (!scanningRef.current) {
                if (flutterSessionIdRef.current) scanFlutterScreenAuto();
                else scanScreenAuto();
              }
            }, 1000);
          }
        }
        prevScreenshotRef.current = s;
      }
    } catch (err: any) {
      if (!testRunning) setError(err.response?.data?.error?.message || err.message || 'Screenshot failed');
    } finally { setFetching(false); fetchingRef.current = false; }
  }, [runnerId, testRunning, autoScan, pixelDiff]);

  // Adaptive polling
  useEffect(() => {
    if (!active) { if (intervalRef.current) clearInterval(intervalRef.current); intervalRef.current = null; return; }
    const interval = testRunning ? 600 : 1500;
    fetchScreenshot();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchScreenshot, interval);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [active, testRunning, fetchScreenshot]);

  // Resume polling after element identification
  useEffect(() => {
    if (!identifying && active && !intervalRef.current) {
      const interval = testRunning ? 600 : 1500;
      intervalRef.current = setInterval(fetchScreenshot, interval);
    }
  }, [identifying, active, testRunning, fetchScreenshot]);

  // Auto-activate on test start
  useEffect(() => {
    if (testRunning && !prevTestRunning.current) { setActive(true); setStepCount(0); setPickedEl(null); setPickPos(null); }
    else if (!testRunning && prevTestRunning.current) { setTimeout(fetchScreenshot, 800); }
    prevTestRunning.current = testRunning;
  }, [testRunning, fetchScreenshot]);

  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (testRunning || identifying) return;
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const x = Math.round((px / rect.width) * DEVICE_NATIVE_W);
    const y = Math.round((py / rect.height) * DEVICE_NATIVE_H);
    setPickPos({ px, py });
    setPickedEl(null);
    setPickedWidget(null);
    setPickedWidgetBounds(null);
    setEnterTextValue('');
    setManualFinderValue('');
    setIdentifying(true);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    try {
      let el: LiveElement | null = null;
      let freshShot: string | undefined = undefined;

      // If Flutter Session is active, use VM Service hitTest
      if (flutterSessionId) {
        const resp = await api.post(`/integration-tests/flutter-session/${flutterSessionId}/hit-test`, { x, y }, { timeout: 35000 });
        el = resp.data?.data?.element || null;
        freshShot = resp.data?.data?.screenshot;
        // Also store widget info and bounds
        if (resp.data?.data?.widget) {
          setPickedWidget(resp.data.data.widget);
          // Extract bounds from widget if available
          const widget = resp.data.data.widget;
          if (widget.renderBounds || widget.bounds) {
            const bounds = widget.renderBounds || widget.bounds;
            if (bounds.rect) {
              setPickedWidgetBounds({
                x1: bounds.rect.left || 0,
                y1: bounds.rect.top || 0,
                x2: bounds.rect.right || 0,
                y2: bounds.rect.bottom || 0,
              });
            }
          }
        }
      } else {
        // Fallback to UIAutomator element-at
        const resp = await api.post('/integration-tests/element-at', { x, y, runnerId }, { timeout: 35000 });
        el = resp.data?.data?.element || null;
        freshShot = resp.data?.data?.screenshot;
      }

      if (freshShot) { setScreenshot(freshShot); setLastUpdated(Date.now()); }
      setPickedEl(el);
      if (!el) setError('No element found at that position');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Could not identify element');
    } finally { setIdentifying(false); }
  };

  const buildStep = (type: TestStep['type'], extra: Partial<TestStep> = {}): Partial<TestStep> => {
    if (!pickedEl) return { type };
    const resolvedFinderValue = manualFinderValue.trim() || pickedEl.finderValue;
    const resolvedFinderStrategy: TestStep['finderStrategy'] = manualFinderValue.trim() ? 'text' : pickedEl.finderStrategy;
    return { type, selector: pickedEl.selector, text: pickedEl.text || manualFinderValue.trim() || undefined, elementId: pickedEl.resourceId || `live:${pickedEl.selector}`, finderStrategy: resolvedFinderStrategy, finderValue: resolvedFinderValue, ...extra };
  };

  const addStep = (type: TestStep['type'], extra: Partial<TestStep> = {}) => {
    onStepAdded(buildStep(type, extra));
    setPickedEl(null); setPickPos(null); setEnterTextValue(''); setManualFinderValue('');
  };

  // UIAutomator scan — all elements at once
  const doScanScreen = async (auto = false) => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setScanning(true); setError(''); setPickedEl(null); setPickPos(null); setScannedElements([]);
    if (!auto && intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    try {
      const resp = await api.post('/integration-tests/screen-elements', { runnerId }, { timeout: 40000 });
      const els: LiveElement[] = resp.data?.data?.elements || [];
      const freshShot: string | undefined = resp.data?.data?.screenshot;
      if (freshShot) { setScreenshot(freshShot); setLastUpdated(Date.now()); prevScreenshotRef.current = freshShot; }
      setScannedElements(els);
      if (els.length === 0 && !auto) setError('No interactive elements found on this screen');
    } catch (err: any) { if (!auto) setError(err.response?.data?.error?.message || 'Screen scan failed'); }
    finally { setScanning(false); scanningRef.current = false; }
  };
  const scanScreen = () => doScanScreen(false);
  const scanScreenAuto = () => doScanScreen(true);

  const pickOverlayElement = (el: LiveElement) => {
    setPickedEl(el); setPickPos(null); setEnterTextValue(''); setManualFinderValue(''); setError('');
  };

  const toScreen = (x: number, y: number) => ({ px: (x / DEVICE_NATIVE_W) * screenW, py: (y / DEVICE_NATIVE_H) * screenH });

  // Flutter VM Service session
  const startFlutterSession = async () => {
    setSessionStarting(true); setError('');
    try {
      const resp = await api.post('/integration-tests/flutter-session/start', { runnerId }, { timeout: 90000 });
      const sid = resp.data?.data?.sessionId;
      setFlutterSessionId(sid); flutterSessionIdRef.current = sid;
      setActive(true);
    } catch (err: any) { setError(err.response?.data?.error?.message || 'Failed to start Flutter session'); }
    finally { setSessionStarting(false); }
  };

  const stopFlutterSession = async () => {
    if (!flutterSessionId) return;
    try { await api.delete(`/integration-tests/flutter-session/${flutterSessionId}`, { timeout: 15000 }); } catch {}
    setFlutterSessionId(null); flutterSessionIdRef.current = null; setFlutterWidgets([]); setPickedWidget(null);
  };

  const injectSemantics = async (dryRun = false) => {
    setInjecting(true); setInjectResult(null); setError('');
    try {
      const resp = await api.post('/integration-tests/semantic-inject', { runnerId, dryRun }, { timeout: 120000 });
      const report = resp.data?.data?.report;
      setInjectResult({ filesModified: report?.filesModified ?? 0, totalInjected: report?.totalInjected ?? 0 });
      if (!dryRun && (report?.filesModified ?? 0) > 0) {
        // Re-scan after injection so new semantics are visible immediately
        setTimeout(() => { if (flutterSessionIdRef.current) doScanFlutter(false); else doScanScreen(false); }, 1000);
      }
    } catch (err: any) { setError(err.response?.data?.error?.message || 'Inject failed'); }
    finally { setInjecting(false); }
  };

  const doScanFlutter = async (auto = false) => {
    const sid = auto ? flutterSessionIdRef.current : flutterSessionId;
    if (!sid || scanningRef.current) return;
    scanningRef.current = true;
    setScanningWidgets(true); setError(''); setPickedWidget(null); setFlutterWidgets([]); setScannedElements([]); setPickedEl(null);
    if (!auto && intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    try {
      const resp = await api.get(`/integration-tests/flutter-session/${sid}/widget-tree`, { timeout: 50000 });
      const data = resp.data?.data || {};
      const freshShot: string | undefined = data.screenshot;
      if (freshShot) { setScreenshot(freshShot); setLastUpdated(Date.now()); prevScreenshotRef.current = freshShot; }
      // Backend now returns UIAutomator elements (semantics-enabled) as `elements`
      const els: LiveElement[] = data.elements || [];
      setScannedElements(els);
      if (els.length === 0 && !auto) setError('No elements found — try navigating to a screen with Flutter widgets');
    } catch (err: any) { if (!auto) setError(err.response?.data?.error?.message || 'Widget tree scan failed'); }
    finally { setScanningWidgets(false); scanningRef.current = false; }
  };
  const scanFlutterScreen = () => doScanFlutter(false);
  const scanFlutterScreenAuto = () => doScanFlutter(true);

  const addFlutterStep = (type: TestStep['type'], extra: Partial<TestStep> = {}) => {
    if (!pickedWidget) return;
    onStepAdded({ type, text: pickedWidget.text || pickedWidget.finderValue || undefined, finderStrategy: pickedWidget.finderStrategy as any, finderValue: pickedWidget.finderValue, elementId: pickedWidget.key ? `key:${pickedWidget.key}` : `flutter:${pickedWidget.finderValue}`, ...extra });
    setPickedWidget(null);
  };

  const secondsAgo = lastUpdated ? Math.round((Date.now() - lastUpdated) / 1000) : 0;
  const activePickedEl = pickedEl || (pickedWidget ? { text: pickedWidget.text || pickedWidget.finderValue || '', elementType: pickedWidget.elementType || 'button', isInput: pickedWidget.elementType === 'input', isCheckable: false, clickable: true, finderStrategy: pickedWidget.finderStrategy, finderValue: pickedWidget.finderValue } as any : null);

  return (
    <Card className={testRunning ? 'ring-2 ring-blue-500 ring-offset-1' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="w-4 h-4" /> Live Device View
            {active && !testRunning && <span className={`w-2 h-2 rounded-full ml-1 ${fetching ? 'bg-yellow-400 animate-pulse' : 'bg-green-500 animate-pulse'}`} />}
            {flutterSessionId && <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">VM Service</span>}
            {testRunning && <span className="flex items-center gap-1.5 text-xs font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />Test running... ({stepCount} frames)</span>}
            {!testRunning && testResult && <span className={`text-xs font-normal px-2 py-0.5 rounded-full border ${testResult.success ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200'}`}>{testResult.success ? '✓ Passed' : '✗ Failed'}</span>}
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {active && lastUpdated > 0 && !testRunning && <span className="text-[10px] text-muted-foreground">{secondsAgo}s ago</span>}
            {active && !testRunning && <button onClick={fetchScreenshot} disabled={fetching} className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-40" title="Refresh"><RefreshCw className={`w-3.5 h-3.5 ${fetching ? 'animate-spin' : ''}`} /></button>}
            {active && !testRunning && !flutterSessionId && (
              <>
                <button
                  onClick={() => setAutoScan(v => !v)}
                  title={autoScan ? 'Auto-scan on page change: ON (click to disable)' : 'Auto-scan on page change: OFF (click to enable)'}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium border transition-colors ${autoScan ? 'bg-violet-100 border-violet-400 text-violet-700 hover:bg-violet-200' : 'bg-muted border-muted-foreground/30 text-muted-foreground hover:bg-muted/80'}`}>
                  <RefreshCw className="w-3 h-3" /> Auto
                </button>
                <button onClick={scanScreen} disabled={scanning} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50" title="Scan all elements now (UIAutomator)">
                  {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Scan className="w-3 h-3" />}
                  {scanning ? 'Scanning...' : scannedElements.length > 0 ? `Re-scan (${scannedElements.length})` : 'Scan Screen'}
                </button>
              </>
            )}
            {active && !testRunning && flutterSessionId && (
              <button onClick={scanFlutterScreen} disabled={scanningWidgets} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
                {scanningWidgets ? <Loader2 className="w-3 h-3 animate-spin" /> : <Scan className="w-3 h-3" />}
                {scanningWidgets ? 'Scanning...' : flutterWidgets.length > 0 ? `Re-scan (${flutterWidgets.length})` : 'Scan Screen'}
              </button>
            )}
            {active && !flutterSessionId && !testRunning && (
              <button onClick={startFlutterSession} disabled={sessionStarting} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50" title="Start flutter run --debug for accurate Flutter widget scanning">
                {sessionStarting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Hand className="w-3 h-3" />}
                {sessionStarting ? 'Starting...' : 'Flutter Session'}
              </button>
            )}
            {active && flutterSessionId && !testRunning && (
              <button onClick={stopFlutterSession} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-orange-500 text-white hover:bg-orange-600">
                Stop Session
              </button>
            )}
            {active && !testRunning && (
              <button
                onClick={() => injectSemantics(false)}
                disabled={injecting}
                title="Auto-inject Semantics() wrappers into Flutter source so all widgets are detectable by UIAutomator"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50">
                {injecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Layers className="w-3 h-3" />}
                {injecting ? 'Injecting...' : 'Inject Semantics'}
              </button>
            )}
            <button onClick={() => { setActive(v => !v); setPickedEl(null); setPickPos(null); setScannedElements([]); setFlutterWidgets([]); setError(''); }} disabled={testRunning}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50 ${active ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
              {active ? <><VideoOff className="w-3 h-3" /> Stop</> : <><Video className="w-3 h-3" /> Start Live View</>}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {!active && (
          <p className="text-xs text-muted-foreground">
            Click <strong>Start Live View</strong> to mirror your device screen. With <strong>Auto</strong> enabled, elements are scanned automatically when you navigate to a new page. Or click <strong>Scan Screen</strong> manually.
          </p>
        )}
        {error && !testRunning && <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 p-2 rounded mb-3"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}</div>}
        {injectResult && (
          <div className="flex items-center gap-2 text-xs text-teal-700 bg-teal-50 border border-teal-200 p-2 rounded mb-3">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            Semantics injected: <strong>{injectResult.filesModified} files</strong> modified, <strong>{injectResult.totalInjected} widgets</strong> wrapped. Re-scan to see new elements.
            <button onClick={() => setInjectResult(null)} className="ml-auto text-teal-500 hover:text-teal-700">✕</button>
          </div>
        )}
        {active && (
          <div className="flex gap-4 items-start">
            {/* Phone frame */}
            <div className="flex-shrink-0" style={{ width: 260 }}>
              <div className={`relative rounded-[28px] border-[6px] shadow-xl overflow-hidden transition-colors ${testRunning ? 'border-blue-500' : flutterSessionId ? 'border-violet-600' : 'border-gray-800'} bg-black`} style={{ aspectRatio: `${DEVICE_NATIVE_W}/${DEVICE_NATIVE_H}` }}>
                <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-16 h-3 rounded-b-xl z-10 ${testRunning ? 'bg-blue-500' : flutterSessionId ? 'bg-violet-600' : 'bg-gray-800'}`} />
                {screenshot ? (
                  <div className="relative w-full h-full">
                    <img ref={imgRef} src={`data:image/png;base64,${screenshot}`} alt="Device screen"
                      className={`w-full h-full object-fill select-none ${testRunning ? 'cursor-not-allowed' : (scannedElements.length > 0 || flutterWidgets.length > 0) ? 'cursor-default' : 'cursor-crosshair'}`}
                      onClick={(scannedElements.length === 0 && flutterWidgets.length === 0) ? handleImageClick : undefined}
                      onLoad={e => { const img = e.currentTarget; setScreenW(img.clientWidth); setScreenH(img.clientHeight); }}
                      draggable={false} />
                    {testRunning && <div className="absolute inset-0 bg-blue-900/20 pointer-events-none flex items-end justify-center pb-3"><div className="flex items-center gap-1.5 bg-blue-600/80 text-white text-[10px] px-2 py-1 rounded-full"><Loader2 className="w-2.5 h-2.5 animate-spin" />Running</div></div>}
                    {/* UIAutomator overlays */}
                    {scannedElements.length > 0 && !testRunning && scannedElements.map((el, i) => {
                      const tl = toScreen(el.x1, el.y1); const br = toScreen(el.x2, el.y2);
                      const isActive = pickedEl === el; const isHovered = hoveredEl === el;
                      const color = el.elementType === 'input' ? 'border-blue-400 bg-blue-400' : el.elementType === 'button' ? 'border-green-400 bg-green-400' : el.elementType === 'checkbox' ? 'border-orange-400 bg-orange-400' : 'border-purple-400 bg-purple-400';
                      return <div key={i} className={`absolute border rounded cursor-pointer transition-all ${color} ${isActive ? 'opacity-50 border-2' : isHovered ? 'opacity-30 border-2' : 'opacity-0 hover:opacity-25 border'}`} style={{ left: tl.px, top: tl.py, width: br.px - tl.px, height: br.py - tl.py }} onClick={() => pickOverlayElement(el)} onMouseEnter={() => setHoveredEl(el)} onMouseLeave={() => setHoveredEl(null)} title={el.text || el.finderValue || el.elementType} />;
                    })}
                    {/* Flutter widget highlight — show bounds if available from hitTest */}
                    {!testRunning && pickedWidget && (
                      pickedWidgetBounds ? (
                        // Show specific widget bounds
                        (() => {
                          const tl = toScreen(pickedWidgetBounds.x1, pickedWidgetBounds.y1);
                          const br = toScreen(pickedWidgetBounds.x2, pickedWidgetBounds.y2);
                          return (
                            <div
                              className="absolute border-4 border-violet-500 rounded pointer-events-none bg-violet-500/10"
                              style={{
                                left: tl.px,
                                top: tl.py,
                                width: br.px - tl.px,
                                height: br.py - tl.py,
                              }}
                            />
                          );
                        })()
                      ) : (
                        // Fallback to full-screen highlight (when no bounds available)
                        <div className="absolute inset-0 border-4 border-violet-500 rounded pointer-events-none" />
                      )
                    )}
                    {/* Click marker (single-click mode or Flutter Session click) */}
                    {pickPos && !testRunning && scannedElements.length === 0 && flutterWidgets.length === 0 && (
                      <div className="absolute pointer-events-none" style={{ left: pickPos.px, top: pickPos.py, transform: 'translate(-50%, -50%)' }}>
                        {identifying ? <div className="w-7 h-7 rounded-full border-2 border-blue-400 bg-blue-400/20 flex items-center justify-center"><Loader2 className="w-3 h-3 text-blue-500 animate-spin" /></div>
                          : pickedEl || pickedWidget ? <div className="w-7 h-7 rounded-full border-2 border-green-400 bg-green-400/30" />
                          : <div className="w-7 h-7 rounded-full border-2 border-red-400 bg-red-400/20" />}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full bg-gray-900"><Loader2 className="w-6 h-6 text-gray-500 animate-spin" /></div>
                )}
              </div>
              <p className="text-center text-[10px] text-muted-foreground mt-1.5">
                {testRunning ? 'Test in progress...' : scannedElements.length > 0 ? `${scannedElements.length} elements` : flutterWidgets.length > 0 ? `${flutterWidgets.length} widgets (VM)` : 'Click or Scan Screen'}
              </p>
            </div>

            {/* Element list panel */}
            <div className="flex flex-col gap-2 flex-1 min-w-0 pt-1 overflow-hidden">
              {testRunning ? (
                <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/50 space-y-1.5">
                  <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Test running</p>
                  <p className="text-xs text-muted-foreground">{stepCount} frames captured</p>
                </div>
              ) : scannedElements.length > 0 ? (
                <ElementList
                  elements={scannedElements}
                  isFlutterSession={!!flutterSessionId}
                  onClear={() => { setScannedElements([]); setFlutterWidgets([]); }}
                  onAddStep={(type, el, value) => {
                    onStepAdded({
                      type,
                      text: el.text || undefined,
                      value: value,
                      finderStrategy: el.finderStrategy as any,
                      finderValue: el.finderValue,
                      elementId: el.resourceId || `live:${el.finderValue}`,
                    });
                  }}
                />
              ) : (scanning || scanningWidgets) ? (
                <div className="border rounded-lg p-3 bg-muted/20 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> Scanning elements...
                </div>
              ) : (
                <div className="text-xs text-muted-foreground space-y-1.5 border rounded-lg p-3 bg-muted/20">
                  <p className="font-medium text-foreground">No elements scanned yet</p>
                  {flutterSessionId
                    ? <p>Click <span className="text-violet-600 font-medium">Scan Screen</span> — Flutter semantics enabled, all widgets will appear</p>
                    : <><p>• <span className="text-violet-600 font-medium">Flutter Session</span> → enable semantics + scan all Flutter widgets</p>
                       <p>• <span className="text-violet-600 font-medium">Scan Screen</span> → UIAutomator scan</p></>
                  }
                </div>
              )}
              <div className="text-[10px] text-muted-foreground">~{DEVICE_NATIVE_W}×{DEVICE_NATIVE_H}px native</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────

const VisualTestBuilder: React.FC = () => {
  const [catalog, setCatalog] = useState<ElementCatalog | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanMode, setScanMode] = useState<'regular' | 'hybrid'>('regular');
  const [codebasePath, setCodebasePath] = useState<string>('');
  const [runners, setRunners] = useState<Array<{id: string; name: string; host: string; deviceId?: string; isDefault: boolean; projectPath?: string}>>([]);
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

  const [elementFilter, setElementFilter] = useState<'all' | 'inputs' | 'buttons' | 'texts'>('all');
  const [elementSearch, setElementSearch] = useState('');
  const [expandedScreens, setExpandedScreens] = useState<Set<string>>(new Set());

  const toggleScreenExpanded = (screenName: string) => {
    setExpandedScreens(prev => {
      const next = new Set(prev);
      if (next.has(screenName)) {
        next.delete(screenName);
      } else {
        next.add(screenName);
      }
      return next;
    });
  };

  const filteredCatalog = catalog ? {
    ...catalog,
    screens: (catalog.screens || []).filter(screen => {
      // Text search filter
      if (elementSearch) {
        const searchLower = elementSearch.toLowerCase();
        const matchesSearch =
          screen.name.toLowerCase().includes(searchLower) ||
          (screen.inputs || []).some(i => i.label?.toLowerCase().includes(searchLower) || i.id?.toLowerCase().includes(searchLower)) ||
          (screen.buttons || []).some(b => b.text?.toLowerCase().includes(searchLower) || b.id?.toLowerCase().includes(searchLower)) ||
          (screen.texts || []).some(t => t.text?.toLowerCase().includes(searchLower) || t.id?.toLowerCase().includes(searchLower));
        if (!matchesSearch) return false;
      }

      // Element type filter
      if (elementFilter === 'all') return true;
      if (elementFilter === 'inputs') return (screen.inputs?.length || 0) > 0;
      if (elementFilter === 'buttons') return (screen.buttons?.length || 0) > 0;
      if (elementFilter === 'texts') return (screen.texts?.length || 0) > 0;
      return true;
    })
  } : null;

  // ─── Device Selection ─────────────────────────────────────────────────────
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [showDevicePicker, setShowDevicePicker] = useState(false);

  const currentDevice = MOBILE_DEVICES.find(d => d.id === selectedDevice) || MOBILE_DEVICES[0];

  // Auto-generate set_surface_size step when device changes
  const applyDevice = (deviceId: string) => {
    setSelectedDevice(deviceId);
    const dev = MOBILE_DEVICES.find(d => d.id === deviceId);
    if (!dev) return;

    // Remove existing set_surface_size step
    setSteps(prev => prev.filter(s => s.type !== 'set_surface_size'));

    // Add new one at the beginning
    if (dev.id) {
      const sizeStep: TestStep = {
        id: `device_size_${Date.now()}`,
        type: 'set_surface_size',
        value: String(dev.w),
        value2: String(dev.h),
      };
      setSteps(prev => [sizeStep, ...prev]);
    }
  };

  // Load runners on mount (no auto-scan)
  useEffect(() => {
    const load = async () => {
      try {
        const resp = await api.get('/integration-tests/runners');
        const list = resp.data?.data || resp.data || [];
        setRunners(list);
        const def = list.find((r: any) => r.isDefault) || list[0];
        if (def) {
          setSelectedRunner(def.id);
          setCodebasePath(def.projectPath || '');
        }
      } catch {}
    };
    load();
  }, []);

  // Close device picker on outside click
  useEffect(() => {
    if (!showDevicePicker) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-device-picker]')) {
        setShowDevicePicker(false);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDevicePicker]);

  const handleScan = async () => {
    if (!codebasePath.trim()) {
      setScanError('Please select or enter a codebase path');
      return;
    }
    setScanning(true);
    setScanError('');
    try {
      const payload: any = {};
      if (selectedRunner) payload.runnerId = selectedRunner;
      if (codebasePath.trim()) payload.projectPath = codebasePath.trim();
      const endpoint = scanMode === 'hybrid'
        ? '/integration-tests/scan-hybrid'
        : '/integration-tests/scan';
      const resp = await api.post(endpoint, payload, {
        timeout: scanMode === 'hybrid' ? 900000 : 120000,
      });
      setCatalog(resp.data?.data || resp.data);
    } catch (err: any) {
      setScanError(err.response?.data?.error?.message || err.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const addStep = useCallback((type: string, overrides: Partial<TestStep> = {}) => {
    const newStep: TestStep = { id: `step_${Date.now()}`, type: type as TestStep['type'], ...overrides };
    if (type === 'wait' && !newStep.value) newStep.value = '2';
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
    if (!codebasePath.trim()) { setError('Select or enter a codebase path first'); return; }
    setGenerating(true);
    setError('');
    try {
      const resp = await api.post('/integration-tests/generate-deterministic', {
        steps,
        credentials: credentials.email ? { email: credentials.email, password: credentials.password } : undefined,
        projectPath: codebasePath.trim(),
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
        projectPath: codebasePath.trim() || undefined,
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
      <div>
        <h1 className="text-2xl font-bold">Visual Test Builder</h1>
        <p className="text-muted-foreground">Scan your Flutter app, pick elements, compose test scenarios</p>
      </div>

      {/* Scan Config Bar */}
      <div className="flex flex-wrap items-end gap-3 p-3 bg-muted/30 rounded-lg border">
        {/* Codebase Selector */}
        <div className="flex flex-col gap-1 flex-1 min-w-[280px]">
          <Label className="text-xs text-muted-foreground">Codebase</Label>
          <div className="flex gap-1">
            <select
              value={codebasePath || '__custom__'}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setCodebasePath('');
                } else {
                  setCodebasePath(e.target.value);
                }
              }}
              className="rounded border px-2 py-1.5 text-xs bg-background min-w-[130px]"
            >
              <option value="/Users/bankraya/Development/discipline-tracker">Discipline Tracker</option>
              <option value="/Users/bankraya/Development/Raya-dev">Raya Dev (Bank Raya)</option>
              <option value="__custom__">Custom Path...</option>
            </select>
            <input
              type="text"
              value={codebasePath}
              onChange={(e) => setCodebasePath(e.target.value)}
              placeholder="/path/to/flutter/project"
              className="rounded border px-2 py-1.5 text-xs bg-background flex-1 min-w-[160px]"
            />
          </div>
        </div>

        {/* Runner (only if multiple) */}
        {runners.length > 1 && (
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Runner</Label>
            <select
              value={selectedRunner}
              onChange={(e) => {
                setSelectedRunner(e.target.value);
                const runner = runners.find(r => r.id === e.target.value);
                if (runner?.projectPath) setCodebasePath(runner.projectPath);
              }}
              className="rounded border px-2 py-1.5 text-xs bg-background min-w-[130px]"
            >
              {runners.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.deviceId ? `(${r.deviceId})` : ''} {r.isDefault ? '★' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Scan Mode Toggle */}
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Scan Mode</Label>
          <div className="flex items-center border rounded-md overflow-hidden h-[30px]">
            <button
              onClick={() => setScanMode('regular')}
              className={`px-3 h-full text-xs font-medium flex items-center gap-1.5 ${
                scanMode === 'regular' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <Scan className="w-3 h-3" />
              Static
            </button>
            <button
              onClick={() => setScanMode('hybrid')}
              className={`px-3 h-full text-xs font-medium flex items-center gap-1.5 border-l ${
                scanMode === 'hybrid' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <Layers className="w-3 h-3" />
              Hybrid
            </button>
          </div>
        </div>

        {/* Device Picker */}
        <div className="flex flex-col gap-1 relative" data-device-picker>
          <Label className="text-xs text-muted-foreground">Device</Label>
          <div className="relative">
            <button
              onClick={() => setShowDevicePicker(!showDevicePicker)}
              className="flex items-center gap-2 px-3 py-1.5 rounded border bg-background hover:bg-muted transition-colors text-xs min-w-[150px] h-[30px]"
            >
              <span className="text-sm leading-none">{currentDevice.icon}</span>
              <span className="truncate text-left flex-1">{selectedDevice ? currentDevice.label : 'Default (375×812)'}</span>
              <span className="text-[10px] text-muted-foreground">▼</span>
            </button>
            {showDevicePicker && (
              <div className="absolute left-0 top-full mt-1 bg-card border rounded-lg shadow-lg w-72 z-50">
                {['Default', 'iOS', 'Android', 'Tablet'].map(category => {
                  const devices = MOBILE_DEVICES.filter(d => d.category === category);
                  if (devices.length === 0) return null;
                  return (
                    <div key={category} className="p-2">
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase px-2 mb-1">{category}</div>
                      {devices.map(d => (
                        <button
                          key={d.id || 'default'}
                          onClick={() => { applyDevice(d.id); setShowDevicePicker(false); }}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                            selectedDevice === d.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                          }`}
                        >
                          <span>{d.icon}</span>
                          <span className="truncate flex-1 text-left">{d.label}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Scan Button */}
        <Button onClick={handleScan} disabled={scanning} size="sm" className="h-[30px]">
          {scanning ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Scan className="w-3 h-3 mr-1.5" />}
          {scanning ? 'Scanning...' : scanMode === 'hybrid' ? 'Hybrid Scan' : 'Scan'}
        </Button>
      </div>

      {scanError && <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 p-3 rounded"><AlertTriangle className="w-4 h-4" /> {scanError}</div>}

      {/* Catalog Summary */}
      {catalog && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Element Catalog: {catalog.packageName}
                {catalog.source === 'hybrid' && (
                  <Badge className="ml-2" variant="secondary">Hybrid</Badge>
                )}
              </CardTitle>
              <div className="flex gap-3">
                <Badge variant="outline">{(catalog.screens || []).length} Screens</Badge>
                <Badge variant="outline">{(catalog.inputs || []).length} Inputs</Badge>
                <Badge variant="outline">{(catalog.buttons || []).length} Buttons</Badge>
                <Badge variant="outline">{(catalog.texts || []).filter((t: any) => t.isStatic).length} Static Texts</Badge>
                {(catalog.texts || []).some((t: any) => !t.isStatic) && (
                  <Badge variant="secondary">{(catalog.texts || []).filter((t: any) => !t.isStatic).length} Dynamic</Badge>
                )}
                {catalog.apiEndpoints && (
                  <Badge variant="outline">{catalog.apiEndpoints.length} API Endpoints</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4 p-3 bg-muted/30 rounded-lg">
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
              {filteredCatalog && filteredCatalog.screens.length !== (catalog.screens || []).length && (
                <Badge variant="secondary" className="text-xs">
                  Showing {filteredCatalog.screens.length} of {(catalog.screens || []).length} screens
                </Badge>
              )}
            </div>

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
              {(filteredCatalog?.screens || []).map(screen => (
                <div key={screen.name} className="rounded border bg-muted/20 p-3">
                  <div
                    className="flex items-center gap-2 mb-2 cursor-pointer hover:bg-muted/30 -mx-3 px-3 py-2 -mt-3"
                    onClick={() => toggleScreenExpanded(screen.name)}
                  >
                    <span className="text-sm font-semibold flex-1">📱 {screen.name}</span>
                    {screen.route && <Badge variant="outline" className="text-xs">{screen.route}</Badge>}
                    {expandedScreens.has(screen.name) ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  {expandedScreens.has(screen.name) && (
                    <>
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
                        <div className="text-muted-foreground font-medium mb-1">
                          Texts ({screen.texts.filter((t: any) => t.isStatic).length} static
                          {screen.texts.some((t: any) => !t.isStatic) && `, ${screen.texts.filter((t: any) => !t.isStatic).length} dynamic`})
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {screen.texts.slice(0, 12).map(txt => (
                            <span key={txt.id} className={`rounded px-1.5 py-0.5 truncate max-w-full text-xs ${
                              (txt as any).source === 'api-inference'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-background border'
                            }`}>
                              "{txt.text}"
                              {(txt as any).source === 'api-inference' && (
                                <span className="ml-1 text-[10px] opacity-70">⚡</span>
                              )}
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
                    </>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Builder */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left: Palette + Templates */}
        <div className="col-span-2">
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
        <div className="col-span-3">
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
        <div className="col-span-3">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><Code2 className="w-4 h-4" /> Generated Code</CardTitle>
                {selectedDevice && (
                  <Badge variant="outline" className="text-xs">
                    {currentDevice.icon} {currentDevice.label.split('(')[0].trim()} ({currentDevice.w}x{currentDevice.h})
                  </Badge>
                )}
              </div>
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

        {/* Far Right: Live Device View */}
        <div className="col-span-4">
          <LiveViewPanel
            runnerId={selectedRunner || undefined}
            testRunning={running}
            testResult={testResult}
            onStepAdded={step => addStep(step.type || 'tap', step)}
          />
        </div>
      </div>
    </div>
  );
};

export default VisualTestBuilder;
