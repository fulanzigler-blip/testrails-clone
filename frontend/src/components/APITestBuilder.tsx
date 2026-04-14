import React, { useState, useCallback, useEffect } from 'react';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Scan, Play, Loader2, CheckCircle2, XCircle, Database,
  Globe, Server, Plus, Trash2, ChevronDown, ChevronRight,
  FileJson, Code2, Save, RefreshCw, Eye, EyeOff,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface APIField {
  name: string;
  type: string;
  jsonKey?: string;
  nullable?: boolean;
  isList?: boolean;
  listItemType?: string;
  description?: string;
}

interface APIEndpoint {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  fullPath?: string;
  responseType?: string;
  fields?: APIField[];
  screens?: string[];
  file?: string;
  line?: number;
}

interface APIMock {
  id: string;
  endpointId: string;
  name: string;
  scenario: string;
  response: string;
  delay: number;
  isActive: boolean;
}

interface MockFieldValue {
  fieldName: string;
  fieldType: string;
  value: any;
  enabled: boolean;
}

interface MockEndpointConfig {
  endpoint: APIEndpoint;
  mockName: string;
  scenario: 'success' | 'error' | 'empty' | 'custom';
  delay: number;
  fieldValues: MockFieldValue[];
  enabled: boolean;
  expanded: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────────

export function APITestBuilder({ projectId, projectPath, onTestGenerated }: {
  projectId: string;
  projectPath?: string;
  onTestGenerated?: (test: any) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [endpoints, setEndpoints] = useState<APIEndpoint[]>([]);
  const [mocks, setMocks] = useState<APIMock[]>([]);
  const [mockConfigs, setMockConfigs] = useState<MockEndpointConfig[]>([]);
  const [testMode, setTestMode] = useState<'mock' | 'real'>('mock');

  // Fetch detected API endpoints
  const fetchEndpoints = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`/api/v1/api-detection/${projectId}`);
      if (response.data?.endpoints) {
        setEndpoints(response.data.endpoints);
        // Initialize mock configs for all endpoints
        const initialConfigs = response.data.endpoints.map((ep: APIEndpoint) => ({
          endpoint: ep,
          mockName: `${ep.method} ${ep.url} - Mock`,
          scenario: 'success' as const,
          delay: 0,
          fieldValues: (ep.fields || []).map(field => ({
            fieldName: field.name,
            fieldType: field.type,
            value: getDefaultValue(field.type),
            enabled: true,
          })),
          enabled: false,
          expanded: false,
        }));
        setMockConfigs(initialConfigs);
      }
    } catch (error: any) {
      console.error('Failed to fetch endpoints:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Scan project for API endpoints
  const scanProject = async () => {
    setScanning(true);
    try {
      await api.post('/api/v1/api-detection/scan', {
        projectId,
        projectPath,
        viaSSH: true,
      });
      await fetchEndpoints();
    } catch (error: any) {
      console.error('Scan failed:', error);
    } finally {
      setScanning(false);
    }
  };

  // Fetch existing mocks
  const fetchMocks = useCallback(async () => {
    try {
      const response = await api.get(`/api/v1/api-detection/${projectId}/mocks`);
      if (response.data?.mocks) {
        setMocks(response.data.mocks);
      }
    } catch (error: any) {
      console.error('Failed to fetch mocks:', error);
    }
  }, [projectId]);

  // Update mock configuration
  const updateMockConfig = (index: number, updates: Partial<MockEndpointConfig>) => {
    setMockConfigs(prev => prev.map((config, i) =>
      i === index ? { ...config, ...updates } : config
    ));
  };

  // Update field value
  const updateFieldValue = (configIndex: number, fieldIndex: number, value: any) => {
    setMockConfigs(prev => {
      const newConfigs = [...prev];
      newConfigs[configIndex].fieldValues[fieldIndex].value = value;
      return newConfigs;
    });
  };

  // Save mock to server
  const saveMock = async (config: MockEndpointConfig) => {
    try {
      const response = await api.post(`/api/v1/api-detection/${projectId}/mock`, {
        endpoint: `${config.endpoint.method}:${config.endpoint.url}`,
        method: config.endpoint.method,
        url: config.endpoint.url,
        scenario: config.scenario,
        label: config.mockName,
        delay: config.delay,
        response: buildMockResponse(config),
      });
      await fetchMocks();
      return true;
    } catch (error: any) {
      console.error('Failed to save mock:', error);
      return false;
    }
  };

  // Build mock response object
  const buildMockResponse = (config: MockEndpointConfig): Record<string, any> => {
    const response: Record<string, any> = { success: config.scenario === 'success' };
    const data: Record<string, any> = {};

    for (const field of config.fieldValues) {
      if (field.enabled) {
        data[field.fieldName] = field.value;
      }
    }

    response.data = data;
    return response;
  };

  // Generate test code
  const generateTest = async () => {
    const enabledMocks = mockConfigs.filter(c => c.enabled);
    if (enabledMocks.length === 0) return;

    const test = {
      name: `API Test - ${new Date().toLocaleString()}`,
      mode: testMode,
      mocks: enabledMocks.map(c => ({
        endpoint: `${c.endpoint.method}:${c.endpoint.url}`,
        scenario: c.scenario,
        delay: c.delay,
        response: buildMockResponse(c),
      })),
      endpoints: enabledMocks.map(c => ({
        method: c.endpoint.method,
        url: c.endpoint.url,
        fields: c.fieldValues.filter(f => f.enabled),
      })),
    };

    if (onTestGenerated) {
      onTestGenerated(test);
    }
  };

  useEffect(() => {
    fetchEndpoints();
    fetchMocks();
  }, [fetchEndpoints, fetchMocks]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">API Test Builder</h2>
          <p className="text-muted-foreground">
            Configure mock data for API endpoints and generate test cases
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={scanProject}
            disabled={scanning}
          >
            {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Scan className="mr-2 h-4 w-4" />}
            Scan APIs
          </Button>
          <Button
            onClick={generateTest}
            disabled={mockConfigs.filter(c => c.enabled).length === 0}
          >
            <Play className="mr-2 h-4 w-4" />
            Generate Test
          </Button>
        </div>
      </div>

      {/* Test Mode Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Test Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <Label>Mode:</Label>
              <div className="flex gap-2">
                <Button
                  variant={testMode === 'mock' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTestMode('mock')}
                >
                  <Database className="mr-2 h-4 w-4" />
                  Mock Mode
                </Button>
                <Button
                  variant={testMode === 'real' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTestMode('real')}
                >
                  <Globe className="mr-2 h-4 w-4" />
                  Real API
                </Button>
              </div>
            </div>
            <div className="ml-auto text-sm text-muted-foreground">
              {mockConfigs.filter(c => c.enabled).length} endpoints selected
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}

      {/* API Endpoints List */}
      <div className="space-y-4">
        {mockConfigs.map((config, index) => (
          <MockEndpointCard
            key={config.endpoint.id || index}
            config={config}
            index={index}
            onUpdate={(updates) => updateMockConfig(index, updates)}
            onUpdateField={(fieldIndex, value) => updateFieldValue(index, fieldIndex, value)}
            onSave={() => saveMock(config)}
          />
        ))}
      </div>

      {/* No Endpoints Message */}
      {endpoints.length === 0 && !loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <Server className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No API Endpoints Found</h3>
            <p className="text-muted-foreground mb-4">
              Scan your Flutter project to detect API endpoints
            </p>
            <Button onClick={scanProject} disabled={scanning}>
              <Scan className="mr-2 h-4 w-4" />
              Start Scan
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Mock Endpoint Card Component ───────────────────────────────────────────────

function MockEndpointCard({
  config,
  index,
  onUpdate,
  onUpdateField,
  onSave,
}: {
  config: MockEndpointConfig;
  index: number;
  onUpdate: (updates: Partial<MockEndpointConfig>) => void;
  onUpdateField: (fieldIndex: number, value: any) => void;
  onSave: () => Promise<boolean>;
}) {
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave();
    setSaving(false);
  };

  return (
    <Card className={config.enabled ? 'border-primary' : ''}>
      <CardHeader
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => onUpdate({ expanded: !config.expanded })}
      >
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onUpdate({ expanded: !config.expanded });
            }}
          >
            {config.expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>

          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => onUpdate({ enabled: e.target.checked })}
            className="h-4 w-4"
            onClick={(e) => e.stopPropagation()}
          />

          <Badge variant={getMethodColor(config.endpoint.method)}>
            {config.endpoint.method}
          </Badge>

          <code className="text-sm font-mono flex-1">{config.endpoint.url}</code>

          {config.endpoint.responseType && (
            <Badge variant="outline" className="text-xs">
              {config.endpoint.responseType}
            </Badge>
          )}

          {config.endpoint.screens && config.endpoint.screens.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {config.endpoint.screens.length} screens
            </Badge>
          )}
        </div>
      </CardHeader>

      {config.expanded && (
        <CardContent className="space-y-4 pt-0">
          {/* Mock Configuration */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Mock Name</Label>
              <Input
                value={config.mockName}
                onChange={(e) => onUpdate({ mockName: e.target.value })}
                placeholder="Mock name"
              />
            </div>
            <div>
              <Label>Scenario</Label>
              <select
                value={config.scenario}
                onChange={(e) => onUpdate({ scenario: e.target.value as any })}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="success">Success</option>
                <option value="error">Error</option>
                <option value="empty">Empty Response</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <Label>Delay (ms)</Label>
              <Input
                type="number"
                value={config.delay}
                onChange={(e) => onUpdate({ delay: parseInt(e.target.value) || 0 })}
                min="0"
                step="100"
              />
            </div>
          </div>

          {/* Response Fields */}
          {config.fieldValues.length > 0 && (
            <div className="space-y-2">
              <Label>Response Fields</Label>
              <div className="border rounded-md divide-y">
                {config.fieldValues.map((field, fieldIndex) => (
                  <div key={field.fieldName} className="flex items-center gap-2 p-2">
                    <input
                      type="checkbox"
                      checked={field.enabled}
                      onChange={(e) => {
                        const newValues = [...config.fieldValues];
                        newValues[fieldIndex].enabled = e.target.checked;
                        onUpdate({ fieldValues: newValues });
                      }}
                      className="h-4 w-4"
                    />
                    <code className="text-sm w-1/4">{field.fieldName}</code>
                    <Badge variant="outline" className="text-xs">{field.fieldType}</Badge>
                    <Input
                      value={String(field.value)}
                      onChange={(e) => onUpdateField(fieldIndex, parseValue(e.target.value, field.fieldType))}
                      className="flex-1"
                      placeholder="Mock value"
                      disabled={!field.enabled}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Mock
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Helper Functions ─────────────────────────────────────────────────────────────

function getMethodColor(method: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (method) {
    case 'GET': return 'default';
    case 'POST': return 'secondary';
    case 'PUT': return 'outline';
    case 'DELETE': return 'destructive';
    case 'PATCH': return 'outline';
    default: return 'outline';
  }
}

function getDefaultValue(type: string): any {
  switch (type.toLowerCase()) {
    case 'string': return '';
    case 'int':
    case 'double':
    case 'num': return 0;
    case 'bool': return true;
    case 'datetime': return new Date().toISOString();
    default: return null;
  }
}

function parseValue(value: string, type: string): any {
  switch (type.toLowerCase()) {
    case 'int':
    case 'double':
    case 'num': return parseFloat(value) || 0;
    case 'bool': return value === 'true';
    default: return value;
  }
}

export default APITestBuilder;
