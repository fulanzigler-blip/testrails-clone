import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Star, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ButtonRule { widget: string; labelProp: string; triggerProp: string; }
interface InputRule  { widget: string; labelProp: string; }

interface AppProfile {
  id: string;
  name: string;
  description?: string;
  buttonRules: ButtonRule[];
  inputRules: InputRule[];
  injectorRules: Record<string, boolean>;
  pickerPatterns: any[];
  finderOverrides: any[];
  isDefault: boolean;
  createdAt: string;
}

const DEFAULT_INJECTOR_RULES: Record<string, { label: string; desc: string }> = {
  standard_textfield:   { label: 'Standard TextField/TextFormField', desc: 'hintText / labelText injection' },
  standard_buttons:     { label: 'Standard Flutter Buttons', desc: 'ElevatedButton, TextButton, OutlinedButton, FilledButton' },
  gesture_detector:     { label: 'GestureDetector / InkWell', desc: 'onTap + static Text child' },
  icon_button:          { label: 'IconButton (no tooltip)', desc: 'Adds tooltip from icon name' },
  fab:                  { label: 'FloatingActionButton (no tooltip)', desc: 'Adds tooltip from child text or icon' },
  prop_based_button:    { label: 'Prop-based Button Detection', desc: 'Any widget with (onTap/onPressed) + (text/label prop) — for custom button widgets' },
  prop_based_input:     { label: 'Prop-based Input Detection', desc: 'Any widget with hintText/labelText prop — for custom input widgets' },
  date_picker_detect:   { label: 'Date/Time Picker Detection', desc: 'showDatePicker / showTimePicker in onTap body' },
  custom_bottom_sheet:  { label: 'Custom Bottom Sheet Picker', desc: 'bottomSheetService.showCustomSheet pattern (Stacked arch)' },
};

// ─── Profile Form ─────────────────────────────────────────────────────────────

function ProfileForm({ initial, onSave, onCancel }: {
  initial?: Partial<AppProfile>;
  onSave: (data: Partial<AppProfile>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [buttonRules, setButtonRules] = useState<ButtonRule[]>(initial?.buttonRules || []);
  const [inputRules, setInputRules] = useState<InputRule[]>(initial?.inputRules || []);
  const [injectorRules, setInjectorRules] = useState<Record<string, boolean>>(
    initial?.injectorRules || Object.fromEntries(Object.keys(DEFAULT_INJECTOR_RULES).map(k => [k, ['standard_textfield','standard_buttons','gesture_detector','icon_button','fab','date_picker_detect'].includes(k)]))
  );
  const [expandBtn, setExpandBtn] = useState(false);
  const [expandInp, setExpandInp] = useState(false);

  const addButtonRule = () => setButtonRules(r => [...r, { widget: '', labelProp: 'text', triggerProp: 'onTap' }]);
  const addInputRule  = () => setInputRules(r => [...r, { widget: '', labelProp: 'hintText' }]);

  const updateBtn = (i: number, field: keyof ButtonRule, val: string) =>
    setButtonRules(r => r.map((b, idx) => idx === i ? { ...b, [field]: val } : b));
  const updateInp = (i: number, field: keyof InputRule, val: string) =>
    setInputRules(r => r.map((b, idx) => idx === i ? { ...b, [field]: val } : b));

  return (
    <div className="space-y-5">
      {/* Basic info */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Profile Name *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Raya, Standard Flutter" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" className="mt-1" />
        </div>
      </div>

      {/* Injector Rules */}
      <div>
        <Label className="text-xs font-semibold">Injection Rules</Label>
        <div className="mt-2 border rounded-lg divide-y">
          {Object.entries(DEFAULT_INJECTOR_RULES).map(([key, { label, desc }]) => (
            <div key={key} className="flex items-start gap-3 px-3 py-2.5">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={!!injectorRules[key]}
                onChange={e => setInjectorRules(r => ({ ...r, [key]: e.target.checked }))}
              />
              <div>
                <p className="text-xs font-medium">{label}</p>
                <p className="text-[11px] text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Button Widgets */}
      <div>
        <button className="flex items-center gap-1 text-xs font-semibold text-foreground" onClick={() => setExpandBtn(v => !v)}>
          {expandBtn ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Custom Button Widgets ({buttonRules.length})
        </button>
        {expandBtn && (
          <div className="mt-2 space-y-2">
            {buttonRules.map((r, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input value={r.widget} onChange={e => updateBtn(i, 'widget', e.target.value)} placeholder="Widget name (e.g. CustomTextButton)" className="flex-1 text-xs" />
                <Input value={r.labelProp} onChange={e => updateBtn(i, 'labelProp', e.target.value)} placeholder="label prop" className="w-24 text-xs" />
                <Input value={r.triggerProp} onChange={e => updateBtn(i, 'triggerProp', e.target.value)} placeholder="trigger prop" className="w-28 text-xs" />
                <button onClick={() => setButtonRules(br => br.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addButtonRule} className="text-xs h-7">+ Add Button Widget</Button>
          </div>
        )}
      </div>

      {/* Custom Input Widgets */}
      <div>
        <button className="flex items-center gap-1 text-xs font-semibold text-foreground" onClick={() => setExpandInp(v => !v)}>
          {expandInp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Custom Input Widgets ({inputRules.length})
        </button>
        {expandInp && (
          <div className="mt-2 space-y-2">
            {inputRules.map((r, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input value={r.widget} onChange={e => updateInp(i, 'widget', e.target.value)} placeholder="Widget name (e.g. PrimaryTextField)" className="flex-1 text-xs" />
                <Input value={r.labelProp} onChange={e => updateInp(i, 'labelProp', e.target.value)} placeholder="label prop" className="w-32 text-xs" />
                <button onClick={() => setInputRules(ir => ir.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addInputRule} className="text-xs h-7">+ Add Input Widget</Button>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={() => onSave({ name, description, buttonRules, inputRules, injectorRules })} disabled={!name.trim()}>Save Profile</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AppProfilesPage() {
  const [profiles, setProfiles] = useState<AppProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [runners, setRunners] = useState<Array<{ id: string; name: string; defaultProfileId?: string }>>([]);

  const load = async () => {
    try {
      const [pr, rr] = await Promise.all([
        api.get('/app-profiles'),
        api.get('/integration-tests/runners'),
      ]);
      setProfiles(pr.data.data || []);
      setRunners(rr.data.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (data: Partial<AppProfile>) => {
    await api.post('/app-profiles', data);
    setCreating(false);
    load();
  };

  const handleUpdate = async (id: string, data: Partial<AppProfile>) => {
    await api.put(`/app-profiles/${id}`, data);
    setEditingId(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this profile?')) return;
    await api.delete(`/app-profiles/${id}`);
    load();
  };

  const handleSetRunnerProfile = async (runnerId: string, profileId: string) => {
    await api.patch(`/app-profiles/${profileId}/set-runner-default`, { runnerId });
    load();
  };

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading profiles...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">App Profiles</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure widget rules and injector settings per Flutter app. Profiles are runner-independent — assign any profile to any runner.
          </p>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Profile
          </Button>
        )}
      </div>

      {/* Runner → Profile Assignment */}
      {runners.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Runner → Profile Assignment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {runners.map(runner => (
              <div key={runner.id} className="flex items-center gap-3">
                <span className="text-sm font-medium w-40 truncate">{runner.name}</span>
                <select
                  className="flex-1 rounded border px-2 py-1.5 text-sm bg-background"
                  value={runner.defaultProfileId || ''}
                  onChange={e => e.target.value && handleSetRunnerProfile(runner.id, e.target.value)}
                >
                  <option value="">— use system default —</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.isDefault ? ' ★' : ''}</option>
                  ))}
                </select>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Create form */}
      {creating && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">New Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileForm onSave={handleCreate} onCancel={() => setCreating(false)} />
          </CardContent>
        </Card>
      )}

      {/* Profile list */}
      <div className="space-y-3">
        {profiles.map(profile => (
          <Card key={profile.id} className={profile.isDefault ? 'border-primary/40' : ''}>
            <CardContent className="pt-4">
              {editingId === profile.id ? (
                <ProfileForm
                  initial={profile}
                  onSave={data => handleUpdate(profile.id, data)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{profile.name}</span>
                        {profile.isDefault && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium flex items-center gap-1"><Star className="w-2.5 h-2.5" />Default</span>}
                      </div>
                      {profile.description && <p className="text-xs text-muted-foreground mt-0.5">{profile.description}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(profile.id)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      {!profile.isDefault && (
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(profile.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Summary badges */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {Object.entries(profile.injectorRules as Record<string, boolean>)
                      .filter(([, v]) => v)
                      .map(([k]) => (
                        <span key={k} className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                          {DEFAULT_INJECTOR_RULES[k]?.label || k}
                        </span>
                      ))}
                    {profile.buttonRules.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        {profile.buttonRules.length} custom button{profile.buttonRules.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {profile.inputRules.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                        {profile.inputRules.length} custom input{profile.inputRules.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
