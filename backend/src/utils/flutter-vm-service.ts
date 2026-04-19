/**
 * Flutter VM Service client — queries the Dart Observatory WebSocket API
 * to extract the live Flutter widget tree from a running debug app.
 *
 * Protocol docs: https://github.com/dart-lang/sdk/blob/main/runtime/vm/service/service.md
 * Flutter Inspector extensions: https://github.com/flutter/flutter/blob/master/packages/flutter/lib/src/widgets/widget_inspector.dart
 */

import WebSocket from 'ws';
import logger from './logger';

export interface FlutterWidget {
  description: string;     // e.g. "Text", "ElevatedButton", "TextField"
  widgetId?: string;       // inspector object ID
  valueId?: string;
  children?: FlutterWidget[];
  // Populated after render tree merge
  text?: string;
  key?: string;            // ValueKey / Key string
  tooltip?: string;
  enabled?: boolean;
  x1?: number; y1?: number; x2?: number; y2?: number; // render bounds (device pixels)
  elementType?: 'button' | 'input' | 'text' | 'checkbox' | 'other';
  finderStrategy?: 'text' | 'key' | 'tooltip' | 'type';
  finderValue?: string;
}

// ─── VM Service RPC ───────────────────────────────────────────────────────────

export class FlutterVMService {
  private ws: WebSocket | null = null;
  private pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private msgId = 1;
  private isolateId: string | null = null;
  private groupName = 'explorer';

  async connect(vmServiceUrl: string, timeoutMs = 15000): Promise<void> {
    const wsUrl = vmServiceUrl.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws';
    logger.info(`[VMService] Connecting to ${wsUrl}`);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`VM Service connection timeout: ${wsUrl}`)), timeoutMs);
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        clearTimeout(timer);
        logger.info('[VMService] Connected');
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.id && this.pending.has(String(msg.id))) {
            const { resolve, reject } = this.pending.get(String(msg.id))!;
            this.pending.delete(String(msg.id));
            if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            else resolve(msg.result);
          }
        } catch {}
      });

      this.ws.on('error', (err) => { clearTimeout(timer); reject(err); });
      this.ws.on('close', () => logger.info('[VMService] Disconnected'));
    });
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.pending.clear();
  }

  private rpc(method: string, params: Record<string, any> = {}, timeoutMs = 10000): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('VM Service not connected'));
    }
    const id = String(this.msgId++);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`VM Service RPC timeout: ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.ws!.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  async getMainIsolateId(): Promise<string> {
    if (this.isolateId) return this.isolateId;
    const vm = await this.rpc('getVM');
    const isolateRef = vm.isolates?.find((i: any) => !i.name?.includes('kernel')) || vm.isolates?.[0];
    if (!isolateRef) throw new Error('No Flutter isolate found in VM');
    this.isolateId = isolateRef.id;
    return this.isolateId!;
  }

  async callFlutterExt(method: string, params: Record<string, any> = {}): Promise<any> {
    const isolateId = await this.getMainIsolateId();
    return this.rpc('callServiceExtension', { method, isolateId, ...params }, 20000);
  }

  /** Get the full widget summary tree (all widgets, no render bounds) */
  async getSummaryTree(): Promise<any> {
    return this.callFlutterExt('ext.flutter.inspector.getRootWidgetSummaryTreeWithPreviews', {
      groupName: this.groupName,
    });
  }

  /** Get details subtree for a specific widget (includes render bounds) */
  async getDetailsSubtree(widgetId: string, depth = 5): Promise<any> {
    return this.callFlutterExt('ext.flutter.inspector.getDetailsSubtree', {
      groupName: this.groupName,
      arg: widgetId,
      subtreeDepth: String(depth),
    });
  }

  /** Enable semantics on the running app */
  async enableSemantics(): Promise<void> {
    try {
      await this.callFlutterExt('ext.flutter.semanticsUpdate', { value: 'true' });
    } catch { /* ignore if not supported */ }
  }
}

// ─── Widget Tree Parser ───────────────────────────────────────────────────────

/**
 * Flatten the VM Service widget tree into a list of actionable elements
 * with Flutter finder strategies.
 */
export function parseWidgetTree(node: any, depth = 0, typeCount: Map<string, number> = new Map(), inheritedLabel = ''): FlutterWidget[] {
  if (!node || depth > 80) return [];
  const results: FlutterWidget[] = [];

  const desc: string = node.description || node.type || '';
  // children + properties both may hold nested widgets
  const children: any[] = [...(node.children || []), ...(node.properties || [])];

  // Semantics nodes carry a label that applies to their child — extract and propagate
  const isSemanticsNode = desc === 'Semantics' || desc === 'MergeSemantics';
  const semanticsLabel = isSemanticsNode ? extractLabelFromProps(node.properties) : '';
  const labelToPropagate = semanticsLabel || inheritedLabel;

  const isTextWidget = desc.startsWith('Text(') || desc === 'Text' || desc === 'RichText';
  const isButton = isButtonWidget(desc);
  const isInput = isInputWidget(desc);

  // textPreview is added by getRootWidgetSummaryTreeWithPreviews for text-bearing widgets
  // Fall back to inherited Semantics label so injected wrappers propagate their label
  const text = extractText(desc) || node.textPreview || extractTextFromProps(node.properties) || node.valueAsString || labelToPropagate;
  const key = extractKey(node);
  const tooltip = node.tooltip || node.tooltipMessage || extractTooltipFromProps(node.properties);

  // Skip Semantics nodes themselves — they're wrappers, not actionable elements
  const shouldCapture = !isSemanticsNode && (isButton || isInput || isTextWidget || !!key || !!tooltip);

  if (shouldCapture) {
    const elementType: FlutterWidget['elementType'] =
      isInput ? 'input' : isButton ? 'button' : isTextWidget ? 'text' : 'other';

    const widgetTypeName = desc.split('(')[0]; // e.g. "ElevatedButton", "TextField"

    // For same-type widgets without key/text, track occurrence index so they're distinguishable
    const count = (typeCount.get(widgetTypeName) ?? 0) + 1;
    typeCount.set(widgetTypeName, count);

    let finderStrategy: FlutterWidget['finderStrategy'] = 'type';
    let finderValue = widgetTypeName;

    // For buttons without text yet, scan immediate children for a Text child label
    const childText = (!text && isButton)
      ? extractChildText(node.children)
      : '';
    const resolvedText = text || childText;

    if (key) { finderStrategy = 'key'; finderValue = key; }
    else if (tooltip) { finderStrategy = 'tooltip'; finderValue = tooltip; }
    else if (resolvedText) { finderStrategy = 'text'; finderValue = resolvedText; }
    // For type-only finders on duplicates, append index so UI can show "TextField #1", "TextField #2"
    else if (count > 1) { finderStrategy = 'type'; finderValue = `${widgetTypeName} #${count}`; }

    if (elementType !== 'other' || key) {
      results.push({
        description: desc,
        widgetId: node.objectId || node.valueId,
        text: text || childText, key, tooltip,
        elementType, finderStrategy, finderValue,
      });
    }
  }

  for (const child of children) {
    results.push(...parseWidgetTree(child, depth + 1, typeCount, labelToPropagate));
  }

  return results;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Extract text from the node's properties array (Flutter summary tree stores
// text content in properties, not in description when it's just the widget type name)
function extractTextFromProps(properties: any[] | undefined): string {
  if (!properties?.length) return '';
  for (const p of properties) {
    const name: string = p.name || '';
    const d: string = p.description || p.valueAsString || '';
    // Text widget: name="data", description='"Masuk"' or 'Masuk'
    if (name === 'data' || name === 'text') {
      const v = d.replace(/^"|"$/g, '').replace(/^'|'$/g, '').trim();
      if (v && v.length > 0 && v !== 'null') return v;
    }
    // Input decorations
    if (name === 'hintText' || name === 'labelText' || name === 'label' || name === 'placeholder') {
      const v = d.replace(/^"|"$/g, '').replace(/^'|'$/g, '').trim();
      if (v && v !== 'null') return v;
    }
    // RichText TextSpan children
    if (name === 'textSpan' || name === 'text') {
      const m = d.match(/"([^"]{1,80})"/);
      if (m) return m[1];
    }
  }
  // Also check children for immediate Text node (e.g. ElevatedButton > Text("Masuk"))
  return '';
}

// Find text label from direct children (e.g. ElevatedButton > Text("Masuk"))
function extractChildText(children: any[] | undefined): string {
  if (!children?.length) return '';
  for (const c of children) {
    const d: string = c.description || '';
    if (d === 'Text' || d.startsWith('Text(') || d === 'RichText') {
      const t = extractText(d) || c.textPreview || extractTextFromProps(c.properties) || c.valueAsString || '';
      if (t) return t;
    }
  }
  return '';
}

function extractLabelFromProps(properties: any[] | undefined): string {
  if (!properties?.length) return '';
  for (const p of properties) {
    if (p.name === 'label' || p.name === 'semanticsLabel') {
      return (p.description || p.valueAsString || '').replace(/^"|"$/g, '').replace(/^'|'$/g, '').trim();
    }
  }
  return '';
}

function extractLabelFromProps(properties: any[] | undefined): string {
  if (!properties?.length) return '';
  for (const p of properties) {
    if (p.name === 'label' || p.name === 'semanticsLabel') {
      return (p.description || p.valueAsString || '').replace(/^"|"$/g, '').replace(/^'|'$/g, '').trim();
    }
  }
  return '';
}

function extractTooltipFromProps(properties: any[] | undefined): string {
  if (!properties?.length) return '';
  for (const p of properties) {
    if ((p.name === 'tooltip' || p.name === 'message') && p.description) {
      return p.description.replace(/^"|"$/g, '').trim();
    }
  }
  return '';
}

function extractText(desc: string): string {
  return (
    desc.match(/^(?:Text|RichText)\("([^"]+)"\)/)?.[1] ||
    desc.match(/\bdata:\s*"([^"]+)"/)?.[1] ||
    desc.match(/\blabel:\s*"([^"]+)"/)?.[1] ||
    desc.match(/\btitle:\s*"([^"]+)"/)?.[1] ||
    // Any quoted string inside Text/RichText(...)
    (desc.startsWith('Text(') || desc.startsWith('RichText(') ? desc.match(/"([^"]{1,80})"/)?.[1] : undefined) ||
    ''
  );
}

function extractKey(node: any): string {
  const keyStr: string = node.key || node.keyDescription || '';
  if (!keyStr) return '';
  // [<'submit_btn'>] or ValueKey('submit_btn')
  const m = keyStr.match(/['"<]([^'"<>]+)['"<>]/);
  return m ? m[1] : keyStr;
}

function isButtonWidget(desc: string): boolean {
  return /ElevatedButton|TextButton|OutlinedButton|IconButton|FloatingActionButton|GestureDetector|InkWell|CupertinoButton|FilledButton|DropdownButton|PopupMenuButton|SegmentedButton|Chip|ActionChip|FilterChip|ChoiceChip|CheckboxListTile|RadioListTile|SwitchListTile|ListTile|Tab\b|BottomNavigationBarItem/i.test(desc);
}

function isInputWidget(desc: string): boolean {
  return /TextField|TextFormField|CupertinoTextField|EditableText|Checkbox|Switch|Slider|Radio\b|DropdownButtonFormField|DatePicker|TimePicker/i.test(desc);
}