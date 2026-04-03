import React, { useState, useEffect, useCallback } from 'react';
import { Wand2, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchProjects } from '../store/slices/projectsSlice';
import { api } from '../lib/api';

interface Step {
  order: number;
  description: string;
  expected: string;
}

interface GeneratedTestCase {
  title: string;
  description: string;
  steps: Step[];
  expectedResult: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  automationType: 'automated';
  tags: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const priorityColors: Record<GeneratedTestCase['priority'], string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-green-100 text-green-800',
};

const AIGenerateModal: React.FC<Props> = ({ open, onClose, onSaved }) => {
  const dispatch = useAppDispatch();
  const { projects } = useAppSelector((state) => state.projects);

  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [flutterCode, setFlutterCode] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedCases, setGeneratedCases] = useState<GeneratedTestCase[]>([]);
  const [selectedCases, setSelectedCases] = useState<Set<number>>(new Set());
  const [expandedCases, setExpandedCases] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState<boolean>(false);

  const hasResults = generatedCases.length > 0;

  useEffect(() => {
    if (open) {
      dispatch(fetchProjects());
    }
  }, [open, dispatch]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const resetState = useCallback(() => {
    setGeneratedCases([]);
    setSelectedCases(new Set());
    setExpandedCases(new Set());
    setFlutterCode('');
    setError(null);
    setLoading(false);
    setSaving(false);
  }, []);

  const handleClose = () => {
    resetState();
    setSelectedProjectId('');
    onClose();
  };

  const handleBack = () => {
    setGeneratedCases([]);
    setSelectedCases(new Set());
    setExpandedCases(new Set());
    setError(null);
  };

  const handleGenerate = async () => {
    if (!selectedProjectId || !flutterCode.trim()) {
      setError('Please select a project and provide Flutter/Dart code.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/test-cases/generate', {
        projectId: selectedProjectId,
        flutterCode,
        autoSave: false,
      });

      const cases: GeneratedTestCase[] = response.data.data ?? response.data;
      setGeneratedCases(cases);
      setSelectedCases(new Set(cases.map((_, i) => i)));
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || 'Failed to generate test cases.');
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleCaseSelection = (index: number) => {
    setSelectedCases((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleCaseExpansion = (index: number) => {
    setExpandedCases((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedCases.size === generatedCases.length) {
      setSelectedCases(new Set());
    } else {
      setSelectedCases(new Set(generatedCases.map((_, i) => i)));
    }
  };

  const handleSaveSelected = async () => {
    setSaving(true);
    setError(null);

    try {
      const casesToSave = Array.from(selectedCases).map((i) => generatedCases[i]);

      await Promise.all(
        casesToSave.map((c) =>
          api.post('/test-cases', {
            title: c.title,
            description: c.description,
            steps: c.steps,
            expected_result: c.expectedResult,
            priority: c.priority,
            automation_type: c.automationType,
            tags: c.tags,
            projectId: selectedProjectId,
          })
        )
      );

      onSaved();
      handleClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || 'Failed to save test cases.');
      } else {
        setError('An unexpected error occurred while saving.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {hasResults
              ? `Generated ${generatedCases.length} test case${generatedCases.length !== 1 ? 's' : ''}`
              : 'Generate Test Cases with AI'}
          </h2>
          <button
            onClick={handleClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* VIEW 1: Input */}
          {!hasResults && (
            <div className="space-y-4">
              {/* Project Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select a project...</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Code Textarea */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Flutter/Dart Code
                </label>
                <textarea
                  value={flutterCode}
                  onChange={(e) => setFlutterCode(e.target.value)}
                  rows={8}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                  placeholder={`import 'package:flutter/material.dart';\n\nclass MyWidget extends StatelessWidget {\n  @override\n  Widget build(BuildContext context) {\n    return Scaffold(\n      appBar: AppBar(title: Text('Example')),\n      body: Center(child: Text('Hello World')),\n    );\n  }\n}`}
                />
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing code...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    Generate
                  </>
                )}
              </button>
            </div>
          )}

          {/* VIEW 2: Results */}
          {hasResults && (
            <div className="space-y-3">
              {/* Back button */}
              <button
                onClick={handleBack}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                ← Back
              </button>

              {/* Select All */}
              <div className="flex items-center gap-2 pb-2 border-b">
                <input
                  type="checkbox"
                  checked={selectedCases.size === generatedCases.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">
                  Select all ({generatedCases.length})
                </span>
              </div>

              {/* Generated Cases List */}
              {generatedCases.map((tc, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-gray-200 overflow-hidden"
                >
                  {/* Case Header Row */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleCaseExpansion(index)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCases.has(index)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleCaseSelection(index);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="flex-1 font-semibold text-sm text-gray-900">
                      {tc.title}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityColors[tc.priority]}`}
                    >
                      {tc.priority}
                    </span>
                    {expandedCases.has(index) ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>

                  {/* Expanded Content */}
                  {expandedCases.has(index) && (
                    <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
                      <p className="text-sm text-gray-600">{tc.description}</p>

                      {tc.steps.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            Steps
                          </h4>
                          <ol className="space-y-2">
                            {tc.steps.map((step, si) => (
                              <li key={si} className="text-sm">
                                <span className="font-medium text-gray-700">
                                  {step.order}. {step.description}
                                </span>
                                <p className="text-gray-500 ml-4 text-xs mt-0.5">
                                  Expected: {step.expected}
                                </p>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}

                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                          Expected Result
                        </h4>
                        <p className="text-sm text-gray-600">{tc.expectedResult}</p>
                      </div>

                      {tc.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {tc.tags.map((tag, ti) => (
                            <span
                              key={ti}
                              className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer (only for results view) */}
        {hasResults && (
          <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
            <button
              onClick={handleClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveSelected}
              disabled={saving || selectedCases.size === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                `Save Selected (${selectedCases.size})`
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIGenerateModal;
