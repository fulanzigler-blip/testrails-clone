/**
 * Semantic Identifier Injection Engine
 *
 * Scans a Flutter project via SSH and injects Semantics() wrappers
 * to widgets that lack semantic identifiers. This makes all elements
 * detectable by UIAutomator via the `content-desc` attribute.
 *
 * Injection Rules:
 * 1. TextFormField / TextField with hintText/labelText
 *    → wraps with Semantics(label: 'X', textField: true, child: ...)
 * 2. InkWell / GestureDetector with onTap + Text child
 *    → wraps with Semantics(label: 'X', button: true, child: ...)
 * 3. IconButton without tooltip
 *    → injects tooltip: 'X' as first property (Flutter sets Semantics internally)
 * 4. FloatingActionButton without tooltip
 *    → injects tooltip: 'X' as first property
 */

import logger from './logger';
import { execSSHWithConfig } from './ssh-client';
import { writeFileSSHWithRunner } from './ssh-client';
import type { SSHRunnerConfig } from './ssh-client';

export interface InjectionChange {
  line: number;
  widgetType: string;
  label: string;
  injectionType: 'semantics_wrapper' | 'tooltip_add';
}

export interface FileInjectionResult {
  file: string;
  changed: boolean;
  injections: InjectionChange[];
  error?: string;
}

export interface InjectionReport {
  filesScanned: number;
  filesModified: number;
  totalInjected: number;
  results: FileInjectionResult[];
  dryRun: boolean;
}

// ─── Paren Matching ──────────────────────────────────────────────────────────

/**
 * Find the index of the closing ')' that matches the opening '(' at openParenIdx.
 * Correctly skips string literals, comments, and nested parens.
 */
function findMatchingParen(content: string, openParenIdx: number): number {
  let i = openParenIdx;
  let depth = 0;

  while (i < content.length) {
    const ch = content[i];

    // String literals (single or double quote, triple or single)
    if (ch === '"' || ch === "'") {
      const q = ch;
      if (content[i + 1] === q && content[i + 2] === q) {
        // Triple-quoted string
        i += 3;
        while (i + 2 < content.length) {
          if (content[i] === q && content[i + 1] === q && content[i + 2] === q) { i += 3; break; }
          if (content[i] === '\\') i += 2; else i++;
        }
      } else {
        // Single-quoted string
        i++;
        while (i < content.length) {
          if (content[i] === q) { i++; break; }
          if (content[i] === '\\') i += 2; else i++;
        }
      }
      continue;
    }

    // Line comment
    if (ch === '/' && i + 1 < content.length && content[i + 1] === '/') {
      while (i < content.length && content[i] !== '\n') i++;
      continue;
    }

    // Block comment
    if (ch === '/' && i + 1 < content.length && content[i + 1] === '*') {
      i += 2;
      while (i + 1 < content.length && !(content[i] === '*' && content[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }

    i++;
  }

  return -1;
}

function getLineNumber(content: string, pos: number): number {
  return content.slice(0, pos).split('\n').length;
}

function escapeLabel(label: string): string {
  return label.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// ─── Core Injection Logic ─────────────────────────────────────────────────────

interface PendingInjection {
  startPos: number;   // position of widget name (e.g. 'T' in 'TextFormField')
  endPos: number;     // position of matching ')'
  insertBefore: string;
  insertAfter: string;
  widgetType: string;
  label: string;
  injectionType: 'semantics_wrapper' | 'tooltip_add';
}

/**
 * Scan content of a single dart file and compute all injections needed.
 * Returns the modified content and a list of changes.
 */
export function scanAndInjectContent(content: string, _fileName: string): {
  modified: string;
  injections: InjectionChange[];
} {
  const injections: InjectionChange[] = [];
  const pending: PendingInjection[] = [];

  // Track regions already covered by a pending injection to avoid overlaps
  function isAlreadyWrapped(startPos: number, endPos: number): boolean {
    return pending.some(p => p.startPos <= startPos && p.endPos >= endPos);
  }

  function alreadyHasSemantics(content: string, widgetStart: number): boolean {
    // Look at the 120 chars before the widget for `Semantics(` with `child:`
    const before = content.slice(Math.max(0, widgetStart - 120), widgetStart);
    // Match patterns like: Semantics(label: '...', child:  OR  Semantics(\n  child:
    return /Semantics\s*\([^)]*$/.test(before);
  }

  // ── Rule 1: TextFormField / TextField with hintText or labelText ──────────
  const inputRe = /\b(TextFormField|TextField)\s*\(/g;
  let m: RegExpExecArray | null;

  while ((m = inputRe.exec(content)) !== null) {
    const widgetStart = m.index;
    const openParen = m.index + m[0].lastIndexOf('(');
    const closeParen = findMatchingParen(content, openParen);
    if (closeParen < 0) continue;

    const inner = content.slice(openParen, closeParen + 1);

    // Need a hintText or labelText to use as the semantic label
    const hintMatch =
      inner.match(/hintText\s*:\s*['"]([^'"]+)['"]/) ||
      inner.match(/labelText\s*:\s*['"]([^'"]+)['"]/);
    if (!hintMatch) continue;
    const label = hintMatch[1];

    // Skip if already has semanticLabel inside decoration
    if (/semanticLabel\s*:/.test(inner)) continue;

    // Skip if the widget is already inside a Semantics() wrapper
    if (alreadyHasSemantics(content, widgetStart)) continue;

    pending.push({
      startPos: widgetStart,
      endPos: closeParen,
      insertBefore: `Semantics(label: '${escapeLabel(label)}', textField: true, child: `,
      insertAfter: ')',
      widgetType: m[1],
      label,
      injectionType: 'semantics_wrapper',
    });
    injections.push({
      line: getLineNumber(content, widgetStart),
      widgetType: m[1],
      label,
      injectionType: 'semantics_wrapper',
    });
  }

  // ── Rule 2: InkWell / GestureDetector with onTap + extractable Text label ──
  const tapRe = /\b(InkWell|GestureDetector)\s*\(/g;
  while ((m = tapRe.exec(content)) !== null) {
    const widgetStart = m.index;
    const openParen = m.index + m[0].lastIndexOf('(');
    const closeParen = findMatchingParen(content, openParen);
    if (closeParen < 0) continue;

    const inner = content.slice(openParen, closeParen + 1);

    if (!inner.includes('onTap') && !inner.includes('onPressed')) continue;

    // Extract a static Text label from the widget body (up to 50 chars)
    const textMatch = inner.match(/Text\(\s*(?:const\s+)?['"]([^'"]{2,50})['"]/);
    if (!textMatch) continue;
    const label = textMatch[1];

    if (alreadyHasSemantics(content, widgetStart)) continue;
    if (isAlreadyWrapped(widgetStart, closeParen)) continue;

    pending.push({
      startPos: widgetStart,
      endPos: closeParen,
      insertBefore: `Semantics(label: '${escapeLabel(label)}', button: true, child: `,
      insertAfter: ')',
      widgetType: m[1],
      label,
      injectionType: 'semantics_wrapper',
    });
    injections.push({
      line: getLineNumber(content, widgetStart),
      widgetType: m[1],
      label,
      injectionType: 'semantics_wrapper',
    });
  }

  // ── Rule 3: IconButton without tooltip ────────────────────────────────────
  const iconBtnRe = /\bIconButton\s*\(/g;
  while ((m = iconBtnRe.exec(content)) !== null) {
    const openParen = m.index + m[0].lastIndexOf('(');
    const closeParen = findMatchingParen(content, openParen);
    if (closeParen < 0) continue;

    const inner = content.slice(openParen, closeParen + 1);
    if (inner.includes('tooltip')) continue; // already has tooltip

    const iconMatch = inner.match(/Icons\.(\w+)/);
    if (!iconMatch) continue;
    const label = iconMatch[1]
      .replace(/_rounded$|_outlined$|_sharp$|_two_tone$/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    // Insert tooltip as the first property (right after the opening paren)
    const insertPos = openParen + 1;
    pending.push({
      startPos: insertPos,
      endPos: insertPos,
      insertBefore: `\n    tooltip: '${escapeLabel(label)}',`,
      insertAfter: '',
      widgetType: 'IconButton',
      label,
      injectionType: 'tooltip_add',
    });
    injections.push({
      line: getLineNumber(content, m.index),
      widgetType: 'IconButton',
      label,
      injectionType: 'tooltip_add',
    });
  }

  // ── Rule 4: FloatingActionButton without tooltip ──────────────────────────
  const fabRe = /\bFloatingActionButton(?:\.extended)?\s*\(/g;
  while ((m = fabRe.exec(content)) !== null) {
    const openParen = m.index + m[0].lastIndexOf('(');
    const closeParen = findMatchingParen(content, openParen);
    if (closeParen < 0) continue;

    const inner = content.slice(openParen, closeParen + 1);
    if (inner.includes('tooltip')) continue;

    // Derive label from child Text or icon
    const textMatch = inner.match(/(?:label|child)\s*:\s*(?:const\s+)?Text\(\s*['"]([^'"]{2,40})['"]/);
    const iconMatch = inner.match(/Icons\.(\w+)/);
    if (!textMatch && !iconMatch) continue;
    const label = textMatch ? textMatch[1] : iconMatch![1]
      .replace(/_rounded$|_outlined$/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    const insertPos = openParen + 1;
    pending.push({
      startPos: insertPos,
      endPos: insertPos,
      insertBefore: `\n    tooltip: '${escapeLabel(label)}',`,
      insertAfter: '',
      widgetType: 'FloatingActionButton',
      label,
      injectionType: 'tooltip_add',
    });
    injections.push({
      line: getLineNumber(content, m.index),
      widgetType: 'FloatingActionButton',
      label,
      injectionType: 'tooltip_add',
    });
  }

  if (injections.length === 0) return { modified: content, injections };

  // ── Apply injections in REVERSE order (to avoid character-position drift) ─
  type Insertion = { pos: number; text: string };
  const insertions: Insertion[] = [];

  for (const p of pending) {
    if (p.injectionType === 'semantics_wrapper') {
      if (p.insertAfter) insertions.push({ pos: p.endPos + 1, text: p.insertAfter });
      insertions.push({ pos: p.startPos, text: p.insertBefore });
    } else {
      // tooltip_add: single insertion after '('
      insertions.push({ pos: p.startPos, text: p.insertBefore });
    }
  }

  insertions.sort((a, b) => b.pos - a.pos);

  let modified = content;
  for (const ins of insertions) {
    if (!ins.text) continue;
    modified = modified.slice(0, ins.pos) + ins.text + modified.slice(ins.pos);
  }

  return { modified, injections };
}

// ─── SSH Orchestration ────────────────────────────────────────────────────────

export async function injectSemanticIdentifiers(
  runner: SSHRunnerConfig,
  projectPath: string,
  options: { dryRun?: boolean } = {},
): Promise<InjectionReport> {
  const { dryRun = false } = options;
  logger.info(`[SemanticInjector] Starting — project: ${projectPath}, dryRun: ${dryRun}`);

  // Find all dart files that contain target widgets (excludes generated files)
  const findResult = await execSSHWithConfig(
    `grep -rl 'TextFormField\\|TextField(\\|InkWell\\|GestureDetector\\|IconButton\\|FloatingActionButton' '${projectPath}/lib' 2>/dev/null` +
    ` | grep '\\.dart$' | grep -v '\\.g\\.dart' | grep -v '\\.freezed\\.dart' | grep -v '\\.gr\\.dart'` +
    ` | head -300`,
    runner,
    30000,
  );

  const files = findResult.output.split('\n').map(f => f.trim()).filter(f => f.endsWith('.dart'));
  logger.info(`[SemanticInjector] ${files.length} candidate files found`);

  const report: InjectionReport = {
    filesScanned: files.length,
    filesModified: 0,
    totalInjected: 0,
    results: [],
    dryRun,
  };

  // Process in parallel batches
  const BATCH = 8;
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(async (file): Promise<FileInjectionResult> => {
      const result: FileInjectionResult = { file, changed: false, injections: [] };
      try {
        const readResult = await execSSHWithConfig(`cat '${file}' 2>/dev/null`, runner, 15000);
        const originalContent = readResult.output;
        if (!originalContent.trim()) return result;

        const { modified, injections } = scanAndInjectContent(originalContent, file);
        if (injections.length === 0) return result;

        result.injections = injections;

        if (!dryRun && modified !== originalContent) {
          await writeFileSSHWithRunner(file, modified, runner);
          result.changed = true;
          logger.info(`[SemanticInjector] ${file.split('/').pop()}: ${injections.length} injection(s)`);
        } else if (dryRun && injections.length > 0) {
          result.changed = true;
        }
      } catch (err: any) {
        result.error = err.message;
        logger.warn(`[SemanticInjector] Error processing ${file}: ${err.message}`);
      }
      return result;
    }));

    for (const r of batchResults) {
      report.results.push(r);
      if (r.changed) report.filesModified++;
      report.totalInjected += r.injections.length;
    }
  }

  logger.info(
    `[SemanticInjector] Done — ${report.filesModified} files ${dryRun ? 'would be ' : ''}modified, ` +
    `${report.totalInjected} identifiers ${dryRun ? 'would be ' : ''}injected`,
  );
  return report;
}
