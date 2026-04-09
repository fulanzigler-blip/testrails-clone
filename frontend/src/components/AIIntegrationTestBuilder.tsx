import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Sparkles,
  Play,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Code2,
  FileText,
  Trash2,
  Plus,
  AlertTriangle,
  Terminal,
} from 'lucide-react';

interface CredentialPair {
  id: string;
  key: string;
  value: string;
}

interface SavedTest {
  id: string;
  appId: string;
  scenario: string;
  dartCode: string;
  fileName: string;
  createdAt: string;
}

interface TestResult {
  success: boolean;
  output: string;
  duration: number;
}

const AIIntegrationTestBuilder: React.FC = () => {
  // App & scenario
  const [appId, setAppId] = useState('');
  const [scenario, setScenario] = useState('');

  // Credentials
  const [credentials, setCredentials] = useState<CredentialPair[]>([]);

  // Generation
  const [dartCode, setDartCode] = useState('');
  const [generatedFileName, setGeneratedFileName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  // Execution
  const [running, setRunning] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [runError, setRunError] = useState('');

  // Saving
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  // Saved tests list
  const [savedTests, setSavedTests] = useState<SavedTest[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [runningSavedId, setRunningSavedId] = useState<string | null>(null);

  // Fetch saved tests on mount
  useEffect(() => {
    fetchSavedTests();
  }, []);

  const fetchSavedTests = async () => {
    try {
      setLoadingSaved(true);
      const resp = await api.get('/integration-tests');
      setSavedTests(resp.data?.data || resp.data || []);
    } catch {
      setSavedTests([]);
    } finally {
      setLoadingSaved(false);
    }
  };

  // Add credential row
  const addCredential = () => {
    setCredentials((prev) => [
      ...prev,
      { id: Date.now().toString(), key: '', value: '' },
    ]);
  };

  // Update credential
  const updateCredential = (id: string, field: 'key' | 'value', val: string) => {
    setCredentials((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: val } : c))
    );
  };

  // Remove credential
  const removeCredential = (id: string) => {
    setCredentials((prev) => prev.filter((c) => c.id !== id));
  };

  // Build credentials JSON for API
  const buildCredentials = (): Record<string, string> => {
    const obj: Record<string, string> = {};
    credentials.forEach((c) => {
      if (c.key.trim()) {
        obj[c.key.trim()] = c.value;
      }
    });
    return obj;
  };

  // Generate test code
  const handleGenerate = async () => {
    if (!appId.trim()) {
      setGenerateError('Please enter an App ID');
      return;
    }
    if (!scenario.trim()) {
      setGenerateError('Please describe the test scenario');
      return;
    }

    setGenerating(true);
    setGenerateError('');
    setDartCode('');
    setGeneratedFileName('');
    setTestResult(null);
    setRunError('');

    try {
      const resp = await api.post('/integration-tests/generate', {
        appId: appId.trim(),
        scenario: scenario.trim(),
        credentials: buildCredentials(),
      });
      const dartCode = resp.data?.data?.dartCode || resp.data?.dartCode || resp.data?.code || '';
      const fileName = resp.data?.data?.fileName || resp.data?.fileName || resp.data?.filename || 'generated_test.dart';
      setDartCode(dartCode);
      setGeneratedFileName(fileName);
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message ||
        'Failed to generate test code';
      setGenerateError(msg);
    } finally {
      setGenerating(false);
    }
  };

  // Run generated test
  const handleRun = async () => {
    if (!dartCode) {
      setRunError('No test code to run. Generate a test first.');
      return;
    }

    setRunning(true);
    setRunError('');
    setTestResult(null);

    try {
      const resp = await api.post('/integration-tests/run', {
        appId: appId.trim(),
        scenario: scenario.trim(),
        credentials: buildCredentials(),
      });
      setTestResult({
        success: resp.data?.data?.success ?? resp.data?.success ?? false,
        output: resp.data?.data?.output || resp.data?.output || resp.data?.logs || '',
        duration: resp.data?.data?.duration ?? resp.data?.duration ?? 0,
      });
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message ||
        'Failed to run test';
      setRunError(msg);
    } finally {
      setRunning(false);
    }
  };

  // Save test
  const handleSave = async () => {
    if (!dartCode) {
      setSaveError('No test code to save');
      return;
    }

    setSaving(true);
    setSaveError('');
    setSavedMessage('');

    try {
      await api.post('/integration-tests/save', {
        appId: appId.trim(),
        scenario: scenario.trim(),
        dartCode,
        fileName: generatedFileName || 'test.dart',
      });
      setSavedMessage('Test saved successfully!');
      fetchSavedTests();
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message ||
        'Failed to save test';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  // Run a saved test
  const handleRunSaved = async (test: SavedTest) => {
    setRunningSavedId(test.id);
    setTestResult(null);
    setRunError('');

    try {
      const resp = await api.post(`/integration-tests/${test.id}/run`);
      setTestResult({
        success: resp.data?.data?.success ?? resp.data?.success ?? false,
        output: resp.data?.data?.output || resp.data?.output || resp.data?.logs || '',
        duration: resp.data?.data?.duration ?? resp.data?.duration ?? 0,
      });
      // Also load the code for preview
      setDartCode(test.dartCode);
      setGeneratedFileName(test.fileName);
      setAppId(test.appId);
      setScenario(test.scenario);
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message ||
        'Failed to run saved test';
      setRunError(msg);
    } finally {
      setRunningSavedId(null);
    }
  };

  // Load a saved test into the editor
  const loadSavedTest = (test: SavedTest) => {
    setAppId(test.appId);
    setScenario(test.scenario);
    setDartCode(test.dartCode);
    setGeneratedFileName(test.fileName);
    setTestResult(null);
    setRunError('');
    setGenerateError('');
  };

  // Delete a saved test
  const deleteSavedTest = async (id: string) => {
    if (!confirm('Delete this saved test?')) return;
    try {
      await api.delete(`/integration-tests/${id}`);
      setSavedTests((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // silently fail
    }
  };

  // Format duration
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    const sec = ms / 1000;
    if (sec < 60) return `${sec.toFixed(1)}s`;
    const min = Math.floor(sec / 60);
    const remain = (sec - min * 60).toFixed(1);
    return `${min}m ${remain}s`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Integration Test Builder</h1>
          <p className="text-muted-foreground">
            Describe a scenario, let AI generate Dart test code, then run it
          </p>
        </div>
      </div>

      {/* Saved tests summary */}
      {savedTests.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Saved Tests ({savedTests.length})</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingSaved ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading saved tests...
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {savedTests.map((t) => (
                  <Badge
                    key={t.id}
                    variant="outline"
                    className="px-3 py-1 cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => loadSavedTest(t)}
                  >
                    <FileText className="w-3 h-3 mr-1" />
                    {t.scenario.length > 40
                      ? t.scenario.slice(0, 40) + '...'
                      : t.scenario}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Input section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Test Configuration</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {/* App ID */}
          <div>
            <Label htmlFor="appId">App ID</Label>
            <Input
              id="appId"
              placeholder="com.example.myapp"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
            />
          </div>

          {/* Scenario */}
          <div>
            <Label htmlFor="scenario">Test Scenario</Label>
            <textarea
              id="scenario"
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="e.g. Login with valid credentials and verify the home screen loads"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
            />
          </div>

          {/* Credentials */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Credentials (optional)</Label>
              <Button variant="outline" size="sm" onClick={addCredential}>
                <Plus className="w-3 h-3 mr-1" />
                Add
              </Button>
            </div>
            {credentials.length > 0 && (
              <div className="space-y-2">
                {credentials.map((cred) => (
                  <div key={cred.id} className="flex gap-2 items-center">
                    <Input
                      placeholder="Key (e.g. username)"
                      value={cred.key}
                      onChange={(e) =>
                        updateCredential(cred.id, 'key', e.target.value)
                      }
                      className="flex-1"
                    />
                    <Input
                      placeholder="Value"
                      value={cred.value}
                      onChange={(e) =>
                        updateCredential(cred.id, 'value', e.target.value)
                      }
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCredential(cred.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Generate button */}
          <div className="flex items-center gap-3">
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {generating ? 'Generating...' : 'Generate Test'}
            </Button>
            {generateError && (
              <span className="text-sm text-red-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {generateError}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Two-column: Code preview + Results */}
      {(dartCode || testResult || runError) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Code preview */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Code2 className="w-4 h-4" />
                  Generated Dart Code
                </CardTitle>
                {generatedFileName && (
                  <Badge variant="outline" className="text-xs">
                    {generatedFileName}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <pre className="bg-gray-900 text-green-400 p-4 rounded text-xs font-mono max-h-[500px] overflow-y-auto whitespace-pre-wrap break-all">
                {dartCode || '// No code generated yet'}
              </pre>
              <div className="flex gap-2 mt-3">
                <Button onClick={handleRun} disabled={running || !dartCode}>
                  {running ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  {running ? 'Running...' : 'Run Test'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSave}
                  disabled={saving || !dartCode}
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save Test
                </Button>
                {saveError && (
                  <span className="text-sm text-red-500 self-center">
                    {saveError}
                  </span>
                )}
                {savedMessage && (
                  <span className="text-sm text-green-500 self-center flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {savedMessage}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Right: Results */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                Test Results
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {running && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin mb-3" />
                  <p className="text-sm">Running test on device...</p>
                </div>
              )}

              {!running && testResult && (
                <div className="space-y-3">
                  {/* Status badge */}
                  <div className="flex items-center gap-3">
                    {testResult.success ? (
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100 px-3 py-1">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        PASSED
                      </Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-800 hover:bg-red-100 px-3 py-1">
                        <XCircle className="w-3 h-3 mr-1" />
                        FAILED
                      </Badge>
                    )}
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDuration(testResult.duration)}
                    </span>
                  </div>

                  {/* Output */}
                  {testResult.output && (
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Output
                      </Label>
                      <pre className="bg-gray-900 text-gray-100 p-4 rounded text-xs font-mono max-h-[400px] overflow-y-auto whitespace-pre-wrap break-all mt-1">
                        {testResult.output}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {!running && !testResult && runError && (
                <div className="flex flex-col items-center justify-center py-8 text-red-500">
                  <XCircle className="w-8 h-8 mb-3" />
                  <p className="text-sm text-center">{runError}</p>
                </div>
              )}

              {!running && !testResult && !runError && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Terminal className="w-8 h-8 mb-3" />
                  <p className="text-sm">Run a test to see results here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Saved tests full list with run buttons */}
      {savedTests.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">All Saved Tests</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {savedTests.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-3 rounded border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.scenario}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.appId} &middot; {t.fileName} &middot;{' '}
                      {new Date(t.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadSavedTest(t)}
                    >
                      <FileText className="w-3 h-3 mr-1" />
                      Load
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleRunSaved(t)}
                      disabled={runningSavedId === t.id}
                    >
                      {runningSavedId === t.id ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3 mr-1" />
                      )}
                      {runningSavedId === t.id ? 'Running' : 'Run'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteSavedTest(t.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!dartCode && savedTests.length === 0 && (
        <Card>
          <CardContent className="pt-12 text-center">
            <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Get Started</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Enter an App ID and describe a test scenario, then click
              &quot;Generate Test&quot; to let AI create the Dart integration
              test code for you.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AIIntegrationTestBuilder;
