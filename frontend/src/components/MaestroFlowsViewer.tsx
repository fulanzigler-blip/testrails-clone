import React, { useState } from 'react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { updateFlowYaml } from '../store/slices/generatedFlowsSlice';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { FileCode2, Copy, Download, Check, Edit3, Save, X, ChevronDown, ChevronUp } from 'lucide-react';

const MaestroFlowsViewer: React.FC = () => {
  const dispatch = useAppDispatch();
  const { maestroFlows, lastGeneratedAt } = useAppSelector((state) => state.generatedFlows);
  const [expandedFlow, setExpandedFlow] = useState<number | null>(null);
  const [editingFlow, setEditingFlow] = useState<number | null>(null);
  const [editYaml, setEditYaml] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (maestroFlows.length === 0) {
    return (
      <Card>
        <CardContent className="pt-12 text-center">
          <FileCode2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Maestro Flows Generated</h3>
          <p className="text-muted-foreground">
            Run "Crawl &amp; Generate" to create Maestro YAML flows from your app.
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleCopy = (yaml: string, index: number) => {
    navigator.clipboard.writeText(yaml);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleDownload = (flow: { name: string; yaml: string }) => {
    const blob = new Blob([flow.yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${flow.name.replace(/[^a-zA-Z0-9_\-]/g, '_')}.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveEdit = (index: number) => {
    dispatch(updateFlowYaml({ index, yaml: editYaml }));
    setEditingFlow(null);
    setEditYaml('');
  };

  const handleStartEdit = (index: number, yaml: string) => {
    setEditingFlow(index);
    setEditYaml(yaml);
  };

  const handleCancelEdit = () => {
    setEditingFlow(null);
    setEditYaml('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">{maestroFlows.length} Maestro Flows Generated</h3>
          {lastGeneratedAt && (
            <p className="text-sm text-muted-foreground">
              Last generated: {new Date(lastGeneratedAt).toLocaleString()}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            maestroFlows.forEach((flow, i) => {
              setTimeout(() => handleDownload(flow), i * 100);
            });
          }}
        >
          <Download className="w-4 h-4 mr-2" />
          Download All
        </Button>
      </div>

      {maestroFlows.map((flow, index) => {
        const isExpanded = expandedFlow === index;
        const isEditing = editingFlow === index;

        return (
          <Card key={index} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileCode2 className="w-5 h-5 text-blue-500" />
                  <div>
                    <CardTitle className="text-base font-mono">{flow.name}</CardTitle>
                    {flow.savedPath && (
                      <p className="text-xs text-muted-foreground font-mono mt-1">
                        Saved: {flow.savedPath}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isEditing && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(flow.yaml, index)}
                      >
                        {copiedIndex === index ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(flow)}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStartEdit(index, flow.yaml)}
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedFlow(isExpanded ? null : index)}
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </CardHeader>
            {isExpanded && (
              <CardContent className="pt-0">
                {isEditing ? (
                  <div className="space-y-3">
                    <textarea
                      value={editYaml}
                      onChange={(e) => setEditYaml(e.target.value)}
                      className="w-full min-h-[200px] font-mono text-sm bg-gray-50 dark:bg-gray-900 p-3 rounded border"
                      spellCheck={false}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSaveEdit(index)}>
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <pre className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg text-sm font-mono overflow-x-auto max-h-[400px] overflow-y-auto whitespace-pre">
                    {flow.yaml}
                  </pre>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
};

export default MaestroFlowsViewer;
