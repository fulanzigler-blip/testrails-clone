import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import {
  Globe, Smartphone, ClipboardList,
  ChevronRight, ChevronLeft, Check,
  Plus, Trash2, Key, Lock, User,
  Monitor, Layers, Zap, Settings2,
  ToggleLeft, ToggleRight, Rocket,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface TestConfig {
  type: 'web' | 'mobile' | 'manual';
  url?: string;
  device?: 'desktop' | 'mobile';
  maxPages?: number;
  appId?: string;
  scenario?: string;
  deviceId?: string;
  suiteId?: string;
  runName?: string;
  environment?: 'dev' | 'staging' | 'production';
  credentials?: { key: string; value: string }[];
  requiresLogin?: boolean;
}

interface TestingConfigWizardProps {
  open: boolean;
  onClose: () => void;
  suites?: { id: string; name: string }[];
  onLaunch: (config: TestConfig) => void;
}

// ─── Step Definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Type',        short: '01' },
  { id: 2, label: 'Target',      short: '02' },
  { id: 3, label: 'Credentials', short: '03' },
  { id: 4, label: 'Launch',      short: '04' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

const SegmentedControl: React.FC<{
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}> = ({ options, value, onChange }) => (
  <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5">
    {options.map(opt => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onChange(opt.value)}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
          value === opt.value
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

const SummaryRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between py-2.5 border-b border-border/50 last:border-0">
    <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{label}</span>
    <span className="text-sm font-medium text-right ml-4 max-w-[60%] truncate">{value}</span>
  </div>
);

// ─── Main Component ─────────────────────────────────────────────────────────────

export const TestingConfigWizard: React.FC<TestingConfigWizardProps> = ({
  open, onClose, suites = [], onLaunch,
}) => {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState<TestConfig>({
    type: 'web',
    device: 'desktop',
    maxPages: 5,
    environment: 'staging',
    requiresLogin: false,
    credentials: [],
  });
  const [animDir, setAnimDir] = useState<'forward' | 'back'>('forward');

  const update = (patch: Partial<TestConfig>) => setConfig(c => ({ ...c, ...patch }));

  const goNext = () => {
    setAnimDir('forward');
    setStep(s => Math.min(s + 1, 4));
  };
  const goBack = () => {
    setAnimDir('back');
    setStep(s => Math.max(s - 1, 1));
  };

  const addCredential = () =>
    update({ credentials: [...(config.credentials || []), { key: '', value: '' }] });

  const updateCredential = (i: number, field: 'key' | 'value', val: string) => {
    const creds = [...(config.credentials || [])];
    creds[i] = { ...creds[i], [field]: val };
    update({ credentials: creds });
  };

  const removeCredential = (i: number) => {
    const creds = [...(config.credentials || [])];
    creds.splice(i, 1);
    update({ credentials: creds });
  };

  const applyPreset = (preset: 'userpass' | 'token' | 'apikey') => {
    const presets: Record<string, { key: string; value: string }[]> = {
      userpass: [{ key: 'username', value: '' }, { key: 'password', value: '' }],
      token:    [{ key: 'token', value: '' }],
      apikey:   [{ key: 'api_key', value: '' }],
    };
    update({ credentials: presets[preset] });
  };

  const canProceed = () => {
    if (step === 1) return !!config.type;
    if (step === 2) {
      if (config.type === 'web') return !!config.url;
      if (config.type === 'mobile') return !!config.appId && !!config.scenario;
      if (config.type === 'manual') return !!config.suiteId;
    }
    return true;
  };

  const selectedSuite = suites.find(s => s.id === config.suiteId);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-xl mx-4 rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">

        {/* Header stripe */}
        <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500" />

        {/* Title bar */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">New Test Run</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Configure and launch your test</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pb-4">
          <div className="flex items-center gap-0">
            {STEPS.map((s, idx) => (
              <React.Fragment key={s.id}>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all duration-200 ${
                      step > s.id
                        ? 'bg-emerald-500 text-white'
                        : step === s.id
                        ? 'bg-foreground text-background'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {step > s.id ? <Check className="h-3.5 w-3.5" /> : s.short}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block transition-colors ${
                    step === s.id ? 'text-foreground' : 'text-muted-foreground'
                  }`}>
                    {s.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-2 transition-colors duration-300 ${
                    step > s.id ? 'bg-emerald-500' : 'bg-border'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 min-h-[320px]">

          {/* ── Step 1: Choose type ─────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground mb-4">What kind of test do you want to run?</p>

              {[
                {
                  type: 'web' as const,
                  icon: Globe,
                  title: 'Web Testing',
                  desc: 'Test websites & web apps with automated browser',
                  badge: 'Playwright',
                  color: 'text-blue-500',
                  bg: 'bg-blue-500/8 border-blue-500/20 hover:border-blue-500/50',
                  activeBg: 'bg-blue-500/12 border-blue-500',
                },
                {
                  type: 'mobile' as const,
                  icon: Smartphone,
                  title: 'Mobile Testing',
                  desc: 'Run integration tests on real Android devices',
                  badge: 'Flutter',
                  color: 'text-violet-500',
                  bg: 'bg-violet-500/8 border-violet-500/20 hover:border-violet-500/50',
                  activeBg: 'bg-violet-500/12 border-violet-500',
                },
                {
                  type: 'manual' as const,
                  icon: ClipboardList,
                  title: 'Manual Testing',
                  desc: 'Execute test cases from your test suites',
                  badge: 'Guided',
                  color: 'text-amber-500',
                  bg: 'bg-amber-500/8 border-amber-500/20 hover:border-amber-500/50',
                  activeBg: 'bg-amber-500/12 border-amber-500',
                },
              ].map(opt => {
                const Icon = opt.icon;
                const active = config.type === opt.type;
                return (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => update({ type: opt.type })}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all duration-150 ${
                      active ? opt.activeBg : opt.bg
                    }`}
                  >
                    <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                      active ? 'bg-background shadow-sm' : 'bg-background/60'
                    }`}>
                      <Icon className={`h-5 w-5 ${opt.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{opt.title}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{opt.badge}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </div>
                    <div className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      active ? 'border-foreground bg-foreground' : 'border-border'
                    }`}>
                      {active && <div className="w-2 h-2 rounded-full bg-background" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Step 2: Target config ───────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              {config.type === 'web' && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Target URL <span className="text-red-500">*</span></Label>
                    <Input
                      placeholder="https://example.com"
                      value={config.url || ''}
                      onChange={e => update({ url: e.target.value })}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Device Viewport</Label>
                    <div className="flex gap-3">
                      {[
                        { value: 'desktop', label: 'Desktop', sublabel: '1280px', icon: Monitor },
                        { value: 'mobile', label: 'Mobile', sublabel: '390px', icon: Smartphone },
                      ].map(opt => {
                        const Icon = opt.icon;
                        const active = config.device === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => update({ device: opt.value as 'desktop' | 'mobile' })}
                            className={`flex-1 flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                              active ? 'border-foreground bg-muted/50' : 'border-border hover:border-muted-foreground/50'
                            }`}
                          >
                            <Icon className={`h-4 w-4 ${active ? 'text-foreground' : 'text-muted-foreground'}`} />
                            <div>
                              <div className="text-xs font-semibold">{opt.label}</div>
                              <div className="text-[10px] text-muted-foreground">{opt.sublabel}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Max Pages to Scan</Label>
                    <SegmentedControl
                      options={[
                        { label: '1', value: '1' },
                        { label: '5', value: '5' },
                        { label: '10', value: '10' },
                        { label: '20', value: '20' },
                      ]}
                      value={String(config.maxPages || 5)}
                      onChange={v => update({ maxPages: Number(v) })}
                    />
                  </div>
                </>
              )}

              {config.type === 'mobile' && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">App Package ID <span className="text-red-500">*</span></Label>
                    <Input
                      placeholder="com.example.app"
                      value={config.appId || ''}
                      onChange={e => update({ appId: e.target.value })}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Test Scenario <span className="text-red-500">*</span></Label>
                    <textarea
                      placeholder="Describe what to test — e.g. Login with valid credentials, then verify dashboard loads"
                      value={config.scenario || ''}
                      onChange={e => update({ scenario: e.target.value })}
                      rows={3}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                      Device ID <span className="text-muted-foreground font-normal normal-case">(optional)</span>
                    </Label>
                    <Input
                      placeholder="emulator-5554  ·  leave blank for auto-detect"
                      value={config.deviceId || ''}
                      onChange={e => update({ deviceId: e.target.value })}
                      className="font-mono text-sm"
                    />
                  </div>
                </>
              )}

              {config.type === 'manual' && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Test Suite <span className="text-red-500">*</span></Label>
                    <select
                      value={config.suiteId || ''}
                      onChange={e => {
                        const suite = suites.find(s => s.id === e.target.value);
                        update({
                          suiteId: e.target.value,
                          runName: suite ? `${suite.name} — ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : config.runName,
                        });
                      }}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Select a test suite...</option>
                      {suites.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Run Name</Label>
                    <Input
                      value={config.runName || ''}
                      onChange={e => update({ runName: e.target.value })}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Environment</Label>
                    <SegmentedControl
                      options={[
                        { label: 'Dev', value: 'dev' },
                        { label: 'Staging', value: 'staging' },
                        { label: 'Production', value: 'production' },
                      ]}
                      value={config.environment || 'staging'}
                      onChange={v => update({ environment: v as TestConfig['environment'] })}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Step 3: Credentials ─────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Login toggle */}
              <button
                type="button"
                onClick={() => update({ requiresLogin: !config.requiresLogin })}
                className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-border hover:border-muted-foreground/40 transition-all"
              >
                <div className="flex items-center gap-3">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  <div className="text-left">
                    <div className="text-sm font-medium">This test requires login</div>
                    <div className="text-xs text-muted-foreground">Provide credentials for authenticated flows</div>
                  </div>
                </div>
                {config.requiresLogin
                  ? <ToggleRight className="h-6 w-6 text-emerald-500" />
                  : <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                }
              </button>

              {config.requiresLogin && (
                <div className="space-y-3">
                  {/* Presets */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Quick presets:</span>
                    {[
                      { id: 'userpass', icon: User,  label: 'User / Password' },
                      { id: 'token',   icon: Key,   label: 'Token' },
                      { id: 'apikey',  icon: Key,   label: 'API Key' },
                    ].map(p => {
                      const Icon = p.icon;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => applyPreset(p.id as 'userpass' | 'token' | 'apikey')}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-xs hover:bg-muted transition-colors"
                        >
                          <Icon className="h-3 w-3" />
                          {p.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Credential rows */}
                  <div className="space-y-2">
                    {(config.credentials || []).map((cred, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <Input
                          placeholder="key"
                          value={cred.key}
                          onChange={e => updateCredential(i, 'key', e.target.value)}
                          className="font-mono text-xs flex-1"
                        />
                        <Input
                          placeholder="value"
                          type={cred.key.toLowerCase().includes('pass') || cred.key.toLowerCase().includes('token') ? 'password' : 'text'}
                          value={cred.value}
                          onChange={e => updateCredential(i, 'value', e.target.value)}
                          className="font-mono text-xs flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => removeCredential(i)}
                          className="text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={addCredential}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add field
                  </button>
                </div>
              )}

              {!config.requiresLogin && (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <Settings2 className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">No credentials needed</p>
                  <p className="text-xs mt-1 opacity-60">Toggle above if your test flow requires authentication</p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Review & Launch ─────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Review your configuration before launching.</p>

              <div className="rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-3 bg-muted/40 border-b border-border flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Configuration Summary</span>
                </div>
                <div className="px-4 py-1">
                  <SummaryRow label="Test Type" value={
                    <span className="flex items-center gap-1.5">
                      {config.type === 'web' && <><Globe className="h-3.5 w-3.5 text-blue-500" /> Web Testing</>}
                      {config.type === 'mobile' && <><Smartphone className="h-3.5 w-3.5 text-violet-500" /> Mobile Testing</>}
                      {config.type === 'manual' && <><ClipboardList className="h-3.5 w-3.5 text-amber-500" /> Manual Testing</>}
                    </span>
                  } />
                  {config.type === 'web' && <>
                    <SummaryRow label="URL" value={<span className="font-mono text-xs">{config.url}</span>} />
                    <SummaryRow label="Device" value={config.device === 'desktop' ? 'Desktop (1280px)' : 'Mobile (390px)'} />
                    <SummaryRow label="Max Pages" value={`${config.maxPages} page${config.maxPages !== 1 ? 's' : ''}`} />
                  </>}
                  {config.type === 'mobile' && <>
                    <SummaryRow label="App ID" value={<span className="font-mono text-xs">{config.appId}</span>} />
                    <SummaryRow label="Scenario" value={<span className="text-xs line-clamp-2">{config.scenario}</span>} />
                    {config.deviceId && <SummaryRow label="Device" value={<span className="font-mono text-xs">{config.deviceId}</span>} />}
                  </>}
                  {config.type === 'manual' && <>
                    <SummaryRow label="Suite" value={selectedSuite?.name || '—'} />
                    <SummaryRow label="Run Name" value={config.runName || '—'} />
                    <SummaryRow label="Environment" value={
                      <Badge variant="outline" className="text-xs">{config.environment}</Badge>
                    } />
                  </>}
                  <SummaryRow label="Auth" value={
                    config.requiresLogin
                      ? <span className="flex items-center gap-1 text-emerald-500"><Lock className="h-3 w-3" /> {config.credentials?.length} credential{config.credentials?.length !== 1 ? 's' : ''}</span>
                      : <span className="text-muted-foreground">Not required</span>
                  } />
                </div>
              </div>

              {/* Launch CTA */}
              <button
                type="button"
                onClick={() => onLaunch(config)}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-sm transition-all duration-150 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:scale-[1.01] active:scale-[0.99]"
              >
                <Rocket className="h-4 w-4" />
                Launch Test
                <Zap className="h-3.5 w-3.5 opacity-70" />
              </button>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20">
          <button
            type="button"
            onClick={step === 1 ? onClose : goBack}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          <div className="flex items-center gap-1.5">
            {STEPS.map(s => (
              <div
                key={s.id}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  s.id === step ? 'w-5 bg-foreground' : s.id < step ? 'w-1.5 bg-emerald-500' : 'w-1.5 bg-border'
                }`}
              />
            ))}
          </div>

          {step < 4 && (
            <button
              type="button"
              onClick={goNext}
              disabled={!canProceed()}
              className="flex items-center gap-1.5 text-sm font-medium text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-80 transition-opacity"
            >
              {step === 3 ? 'Review' : 'Continue'}
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
          {step === 4 && <div className="w-16" />}
        </div>
      </div>
    </div>
  );
};

export default TestingConfigWizard;
