import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { 
  Loader2, 
  Scan, 
  Smartphone, 
  Code2, 
  Database, 
  Layers, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import { api } from '../lib/api';

interface ApiEndpoint {
  method: string;
  url: string;
  file: string;
  line: number;
  responseModel?: string;
  description?: string;
}

interface ApiResponseField {
  fieldName: string;
  fieldType: string;
  modelClass: string;
  sourceFile: string;
  isNullable: boolean;
}

interface DynamicContentHint {
  screenFile: string;
  screenName: string;
  apiEndpoint?: string;
  responseFields: ApiResponseField[];
  widgetPattern: string;
  description: string;
}

interface HybridScanResult {
  success: boolean;
  data: {
    packageName: string;
    screens: any[];
    inputs: any[];
    buttons: any[];
    texts: any[];
    apiEndpoints: ApiEndpoint[];
    responseModels: ApiResponseField[];
    dynamicContentHints: DynamicContentHint[];
    source: string;
    scannedAt: string;
  };
}

export default function HybridScanPage() {
  const [projectPath, setProjectPath] = useState('/Users/bankraya/Development/Raya-dev');
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<HybridScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'api' | 'dynamic' | 'static'>('overview');

  const handleScan = async () => {
    if (!projectPath.trim()) {
      setError('Project path is required');
      return;
    }

    setIsScanning(true);
    setError(null);
    setResult(null);

    try {
      const response = await api.post('/integration-tests/scan-hybrid', {
        projectPath: projectPath.trim(),
      }, {
        timeout: 900000, // 15 minutes for large projects
      });
      
      setResult(response.data);
      setActiveTab('overview');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Scan failed');
    } finally {
      setIsScanning(false);
    }
  };

  const stats = result?.data
    ? {
        screens: result.data.screens?.length || 0,
        inputs: result.data.inputs?.length || 0,
        buttons: result.data.buttons?.length || 0,
        staticTexts: (result.data.texts || []).filter((t: any) => t.isStatic).length,
        dynamicTexts: (result.data.texts || []).filter((t: any) => !t.isStatic).length,
        apiEndpoints: result.data.apiEndpoints?.length || 0,
        responseModels: result.data.responseModels?.length || 0,
        dynamicHints: result.data.dynamicContentHints?.length || 0,
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hybrid Element Scanner</h1>
          <p className="text-muted-foreground mt-1">
            Scan Flutter project with static analysis + API inference to detect both hardcoded and dynamic content
          </p>
        </div>
        <Button 
          onClick={handleScan} 
          disabled={isScanning || !projectPath.trim()}
          className="gap-2"
        >
          {isScanning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <Scan className="h-4 w-4" />
              Run Hybrid Scan
            </>
          )}
        </Button>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Project Configuration</CardTitle>
          <CardDescription>Path to Flutter project on the runner host</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="projectPath">Flutter Project Path</Label>
              <Input
                id="projectPath"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/path/to/flutter/project"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3 text-destructive">
              <AlertCircle className="h-5 w-5 mt-0.5" />
              <div>
                <p className="font-medium">Scan Failed</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {stats && (
        <>
          {/* Stats Grid */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Screens</CardTitle>
                <Smartphone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.screens}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.inputs} inputs, {stats.buttons} buttons
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Static Texts</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.staticTexts}</div>
                <p className="text-xs text-muted-foreground">Hardcoded widgets</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">API Endpoints</CardTitle>
                <Code2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.apiEndpoints}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.responseModels} response models
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Dynamic Content</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.dynamicTexts}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.dynamicHints} hints found
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Card>
            <CardHeader>
              <div className="flex gap-2">
                {(['overview', 'api', 'dynamic', 'static'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      activeTab === tab
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {tab === 'overview' && <Layers className="h-3 w-3 inline mr-1" />}
                    {tab === 'api' && <Code2 className="h-3 w-3 inline mr-1" />}
                    {tab === 'dynamic' && <Database className="h-3 w-3 inline mr-1" />}
                    {tab === 'static' && <CheckCircle2 className="h-3 w-3 inline mr-1" />}
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <div className="rounded-lg border p-4">
                    <h3 className="font-medium mb-2">Scan Summary</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Source:</span>
                        <Badge variant="secondary" className="ml-2">{result?.data.source}</Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Package:</span>
                        <span className="ml-2 font-mono">{result?.data.packageName}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Scanned At:</span>
                        <span className="ml-2">
                          {result?.data.scannedAt ? new Date(result.data.scannedAt).toLocaleString() : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Project Path:</span>
                        <span className="ml-2 font-mono text-xs">{projectPath}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <h3 className="font-medium mb-2">Detection Breakdown</h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Static widgets (hardcoded)</span>
                        <Badge>{stats.staticTexts}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>Dynamic content (API-driven)</span>
                        <Badge variant="secondary">{stats.dynamicTexts}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>API endpoints detected</span>
                        <Badge variant="outline">{stats.apiEndpoints}</Badge>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* API Endpoints Tab */}
              {activeTab === 'api' && (
                <div className="space-y-3">
                  {(result?.data.apiEndpoints?.length || 0) === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No API endpoints detected</p>
                  ) : (
                    result?.data.apiEndpoints?.map((ep, idx) => (
                      <div key={idx} className="rounded-lg border p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={ep.method === 'GET' ? 'default' : ep.method === 'POST' ? 'secondary' : 'outline'}
                            >
                              {ep.method}
                            </Badge>
                            <code className="text-sm font-mono">{ep.url}</code>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                          <div>
                            <span className="text-foreground">File:</span> {ep.file.split('/').pop()}
                          </div>
                          <div>
                            <span className="text-foreground">Line:</span> {ep.line}
                          </div>
                          {ep.responseModel && (
                            <div>
                              <span className="text-foreground">Response Model:</span> {ep.responseModel}
                            </div>
                          )}
                          {ep.description && (
                            <div>
                              <span className="text-foreground">Function:</span> {ep.description}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Dynamic Content Tab */}
              {activeTab === 'dynamic' && (
                <div className="space-y-3">
                  {(result?.data.dynamicContentHints?.length || 0) === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No dynamic content hints detected</p>
                  ) : (
                    result?.data.dynamicContentHints?.map((hint, idx) => (
                      <div key={idx} className="rounded-lg border p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-medium">{hint.screenName}</h4>
                            <p className="text-sm text-muted-foreground">{hint.description}</p>
                          </div>
                          <Badge variant="secondary">Dynamic</Badge>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Widget Pattern:</span>
                            <code className="ml-2 font-mono text-xs bg-muted px-1 py-0.5 rounded">
                              {hint.widgetPattern}
                            </code>
                          </div>
                          {hint.responseFields.length > 0 && (
                            <div>
                              <span className="text-muted-foreground">Model Field:</span>
                              <span className="ml-2 font-mono text-xs">
                                {hint.responseFields[0].modelClass}.{hint.responseFields[0].fieldName}
                              </span>
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            File: {hint.screenFile.split('/').pop()}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Static Texts Tab */}
              {activeTab === 'static' && (
                <div className="space-y-3">
                  {(result?.data.texts || []).filter((t: any) => t.isStatic).length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No static texts detected</p>
                  ) : (
                    <div className="max-h-96 overflow-auto space-y-2">
                      {(result?.data.texts || [])
                        .filter((t: any) => t.isStatic)
                        .slice(0, 50)
                        .map((text: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                            <span className="font-mono text-xs truncate flex-1 mr-4">{text.text}</span>
                            <Badge variant="outline" className="shrink-0">
                              {text.screen || 'global'}
                            </Badge>
                          </div>
                        ))}
                      {result && (result.data.texts || []).filter((t: any) => t.isStatic).length > 50 && (
                        <p className="text-center text-sm text-muted-foreground pt-2">
                          Showing 50 of {(result.data.texts || []).filter((t: any) => t.isStatic).length} static texts
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Empty State */}
      {!result && !isScanning && !error && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Scan className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">No Scan Results Yet</h3>
            <p className="text-sm">
              Click "Run Hybrid Scan" to analyze your Flutter project
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
