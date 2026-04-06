import { Client } from 'ssh2';
import * as fs from 'fs';

const SSH_HOST: string = process.env.MAESTRO_RUNNER_HOST || '100.76.181.104';
const SSH_USER: string = process.env.MAESTRO_RUNNER_USER || 'clawbot';
const SSH_KEY_PATH: string = process.env.MAESTRO_RUNNER_KEY_PATH || '/home/clawdbot/.ssh/id_ed25519';
const MAESTRO_BIN: string = '/Users/clawbot/.maestro/bin/maestro';
const FLOWS_DIR: string = '/Users/clawbot/maestro-flows';
const SHELL_PREFIX: string =
  'export JAVA_HOME="/Users/clawbot/jdk17/Contents/Home" && ' +
  'export ANDROID_HOME="/Users/clawbot/Library/Android/sdk" && ' +
  'export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:/usr/local/bin:/opt/homebrew/bin:$PATH" && ' +
  '(source ~/.zshrc 2>/dev/null || source ~/.bash_profile 2>/dev/null || true) &&';

// ─── SSH helper ───────────────────────────────────────────────────────────────

async function sshExec(command: string, timeoutMs = 60000): Promise<string> {
  const privateKey = fs.readFileSync(SSH_KEY_PATH);

  // Retry with exponential backoff (3 attempts for unreliable connections)
  const maxRetries = 3;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      console.log(`[SSH] Retry attempt ${attempt}/${maxRetries - 1} for: ${command.slice(0, 50)}...`);
      await new Promise(r => setTimeout(r, attempt * 2000));
    }

    try {
      const result = await sshExecOnce(command, timeoutMs, privateKey);
      if (attempt > 0) console.log(`[SSH] Succeeded on attempt ${attempt + 1}`);
      return result;
    } catch (err: any) {
      lastError = err;
      // Don't retry if it's an auth error (won't help)
      if (err.message?.includes('Authentication') || err.message?.includes('No key')) {
        throw err;
      }
    }
  }

  throw lastError || new Error('SSH failed after retries');
}

async function sshExecOnce(command: string, timeoutMs: number, privateKey: Buffer): Promise<string> {
  const execPromise = new Promise<string>((resolve, reject) => {
    const client = new Client();
    let output = '';
    let errOutput = '';

    client.on('ready', () => {
      client.exec(command, (err, stream) => {
        if (err) { client.end(); reject(err); return; }
        stream.on('data', (d: Buffer) => { output += d.toString(); });
        stream.stderr.on('data', (d: Buffer) => { errOutput += d.toString(); });
        stream.on('close', (code: number | null) => {
          client.end();
          if (code !== 0 && !output) {
            reject(new Error(`SSH command failed (exit ${code}): ${errOutput.slice(0, 300)}`));
          } else {
            resolve(output);
          }
        });
      });
    });

    client.on('error', (e) => reject(e));
    client.connect({ host: SSH_HOST, username: SSH_USER, privateKey, readyTimeout: 60000 });
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`SSH exec timed out after ${timeoutMs}ms`)), timeoutMs)
  );

  return Promise.race([execPromise, timeoutPromise]);
}

async function runTempFlow(yaml: string, timeoutMs = 45000): Promise<void> {
  const tmpPath = `/tmp/crawl_flow_${Date.now()}.yaml`;
  const escaped = yaml.replace(/'/g, "'\\''");
  await sshExec(`printf '%s' '${escaped}' > ${tmpPath}`, 30000);
  // Wake device screen before running flow
  const wakeCmd = `${SHELL_PREFIX} adb shell input keyevent KEYCODE_WAKEUP && sleep 1 && adb shell input keyevent KEYCODE_MENU && sleep 1`;
  await sshExec(wakeCmd, 30000).catch(() => {});
  const maestroOutput = await sshExec(`${SHELL_PREFIX} ${MAESTRO_BIN} test ${tmpPath} 2>&1 || true`, timeoutMs);
  console.log(`[Maestro] Flow output: ${maestroOutput}`);
  if (maestroOutput.toLowerCase().includes('error') || maestroOutput.toLowerCase().includes('failed')) {
    console.error(`[Maestro] Flow execution had issues: ${maestroOutput}`);
  }
  sshExec(`rm -f ${tmpPath}`).catch(() => {});
}

async function captureHierarchy(): Promise<string> {
  // Wake device screen first, then capture hierarchy
  const wakeCmd = `${SHELL_PREFIX} adb shell input keyevent KEYCODE_WAKEUP && sleep 1 && adb shell input keyevent KEYCODE_MENU && sleep 1`;
  await sshExec(wakeCmd, 15000).catch(() => {});
  return sshExec(`${SHELL_PREFIX} ${MAESTRO_BIN} hierarchy 2>&1`, 60000);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Hierarchy parser ─────────────────────────────────────────────────────────

export function parseHierarchy(raw: string): string {
  const lines = raw.split('\n');
  const elements: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '{' || trimmed === '}' || trimmed === '[' || trimmed === ']') continue;

    const textMatch = trimmed.match(/"(?:text|label|contentDescription|accessibilityText)"\s*:\s*"([^"]{1,100})"/i);
    const hintMatch = trimmed.match(/"(?:hintText|hint)"\s*:\s*"([^"]{1,100})"/i);
    const idMatch = trimmed.match(/"(?:id|resourceId|resource-id|testId|semanticsId)"\s*:\s*"([^"]{1,80})"/i);
    const typeMatch = trimmed.match(/"(?:type|class|widgetType)"\s*:\s*"([^"]{1,60})"/i);
    const enabledMatch = trimmed.match(/"enabled"\s*:\s*(true|false)/i);
    const clickableMatch = trimmed.match(/"clickable"\s*:\s*(true|false)/i);

    if (textMatch || hintMatch || idMatch || typeMatch) {
      const parts: string[] = [];
      if (typeMatch) parts.push(`type=${typeMatch[1].replace(/.*\./, '')}`);
      if (textMatch) parts.push(`text="${textMatch[1]}"`);
      if (hintMatch) parts.push(`hint="${hintMatch[1]}"`);
      if (idMatch) parts.push(`id="${idMatch[1]}"`);
      if (enabledMatch) parts.push(`enabled=${enabledMatch[1]}`);
      if (clickableMatch && clickableMatch[1] === 'true') parts.push('clickable=true');
      elements.push(parts.join(', '));
    }
  }

  const unique = [...new Set(elements)];
  const joined = unique.join('\n');
  // Increase limit to capture more UI elements
  if (joined.length > 10000) return joined.slice(0, 10000) + '\n... (truncated)';
  return joined || raw.slice(0, 10000);
}

function extractTappableItems(raw: string): string[] {
  const items: string[] = [];
  const lines = raw.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    const textMatch = trimmed.match(/"(?:text|label|contentDescription)"\s*:\s*"([^"]{2,50})"/i);
    const clickable = trimmed.includes('"clickable": true') || trimmed.includes('"clickable":true');

    if (textMatch && clickable) {
      const text = textMatch[1];
      if (/^(ok|cancel|close|back|×|✕|\d+)$/i.test(text)) continue;
      items.push(text);
    }
  }

  return [...new Set(items)].slice(0, 8);
}

// ─── Phase 1: AI-powered login screen detection ───────────────────────────────

export async function detectLoginScreen(appId: string): Promise<{
  fields: { name: string; placeholder: string; type: 'text' | 'password' | 'email' | 'tel'; tapTarget?: string }[];
  loginSummary: string;
  rawHierarchy: string;
  submitText: string;
}> {
  if (!process.env.ZAI_API_KEY) throw new Error('ZAI_API_KEY not set');

  console.log('[detectLoginScreen] Launching app to capture login screen');
  const launchFlow = `appId: ${appId}\n---\n- launchApp\n- waitForAnimationToEnd\n`;
  await runTempFlow(launchFlow, 60000);

  // Retry hierarchy capture until app content appears (up to 3 attempts)
  let loginRaw = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(3000);
    loginRaw = await captureHierarchy();
    console.log(`[detectLoginScreen] Hierarchy capture attempt ${attempt + 1}, length: ${loginRaw.length}`);

    // DEBUG: First 2000 chars of raw hierarchy
    console.log('[detectLoginScreen] First 2000 chars of raw hierarchy:');
    console.log(loginRaw.slice(0, 2000));

    // Check if hierarchy contains app-specific content (not just system UI)
    if (loginRaw.includes(appId) || loginRaw.includes('hintText') && !loginRaw.match(/"hintText" : ""/g)?.length) {
      // Check for non-empty hintText
      const hasContent = (loginRaw.match(/"hintText"\s*:\s*"[^"]{2,}"/g) || []).length > 0
        || (loginRaw.match(/"accessibilityText"\s*:\s*"[^"]{2,}"/g) || []).length > 5;
      if (hasContent) {
        console.log(`[detectLoginScreen] Hierarchy captured on attempt ${attempt + 1}`);
        break;
      }
    }
    console.log(`[detectLoginScreen] Attempt ${attempt + 1}: app not ready, retrying...`);
  }
  const loginSummary = parseHierarchy(loginRaw);

  // Use MORE raw hierarchy for AI — increase from 5000 to 15000 chars for better field detection
  const rawForAi = loginRaw.slice(0, 15000);
  console.log(`[detectLoginScreen] Full loginRaw length: ${loginRaw.length}, rawForAi length: ${rawForAi.length}`);
  console.log(`[detectLoginScreen] First 3000 chars of rawForAi:`, rawForAi.slice(0, 3000));

  const prompt = `You are analyzing an Android app login screen hierarchy.
Identify ALL input fields the user must fill to authenticate (e.g. email, username, phone, password, PIN, OTP).
Return ONLY valid JSON with no explanation: {"fields":[{"name":"<visible label or hint>","placeholder":"<placeholder text>","type":"email|password|tel|text"}]}
Examples:
- Email+password app: {"fields":[{"name":"Email","placeholder":"Enter your email","type":"email"},{"name":"Password","placeholder":"Enter password","type":"password"}]}
- Phone+OTP app: {"fields":[{"name":"Phone Number","placeholder":"+62...","type":"tel"},{"name":"OTP","placeholder":"6-digit code","type":"text"}]}
If you cannot identify specific fields, return the most likely login fields based on the app type.`;

  const response = await fetch('https://api.z.ai/api/coding/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ZAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'glm-4.5-air', // Fast, accurate model for structured output
      temperature: 0.1,
      max_tokens: 800,
      enable_thinking: false,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: `App: ${appId}\n\nLogin screen hierarchy (raw):\n${rawForAi}\n\nParsed summary:\n${loginSummary}` },
      ],
    }),
    signal: AbortSignal.timeout(90000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Z.ai API Error] Status:', response.status, 'Response:', errorText);
    throw new Error(`Z.ai error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  let content = data.choices?.[0]?.message?.content ?? '';

  // Strip markdown fences if present
  content = content.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();

  const objStart = content.indexOf('{');
  const objEnd = content.lastIndexOf('}');
  if (objStart !== -1 && objEnd > objStart) content = content.slice(objStart, objEnd + 1);

  const validTypes = ['text', 'password', 'email', 'tel'] as const;
  let fields: { name: string; placeholder: string; type: 'text' | 'password' | 'email' | 'tel' }[] = [];

  try {
    const parsed = JSON.parse(content) as { fields?: { name: string; placeholder: string; type: string }[] };
    fields = (parsed.fields ?? []).map(f => ({
      name: f.name ?? '',
      placeholder: f.placeholder ?? '',
      type: (validTypes.includes(f.type as any) ? f.type : 'text') as 'text' | 'password' | 'email' | 'tel',
    })).filter(f => f.name.length > 0);
  } catch {
    fields = [];
  }

  // Pattern-based fallback: scan parsed summary for hint/label text that look like input fields
  if (fields.length === 0) {
    const hintMatches = loginSummary.matchAll(/(?:hint|placeholder|label|text)="([^"]{2,50})"/gi);
    const hints: string[] = [...hintMatches].map(m => m[1]).filter(h =>
      /email|username|user|phone|password|pass|pin|otp|login|nomor|kata sandi/i.test(h)
    );
    for (const hint of [...new Set(hints)]) {
      const isPassword = /password|pass|pin|otp|kata sandi/i.test(hint);
      const isPhone = /phone|nomor|tel/i.test(hint);
      fields.push({
        name: hint,
        placeholder: hint,
        type: isPassword ? 'password' : isPhone ? 'tel' : 'email',
      });
    }
  }

  // Last resort default: email + password
  if (fields.length === 0) {
    fields = [
      { name: 'Email', placeholder: 'Enter your email', type: 'email' },
      { name: 'Password', placeholder: 'Enter your password', type: 'password' },
    ];
    console.warn('[detectLoginScreen] Could not detect fields from hierarchy, using default email+password');
  }

  // Enrich fields with ACTUAL hintText + accessibilityText from hierarchy
  // Try multiple patterns to extract hintText
  const allHints = [
    ...loginRaw.matchAll(/"hintText"\s*:\s*"([^"]{2,80})"/g),
    ...loginRaw.matchAll(/"hint"\s*:\s*"([^"]{2,80})"/g),
    ...loginRaw.matchAll(/"text"\s*:\s*"([^"]{2,80})"/g),
  ].map(m => m[1]);

  const allLabels = [
    ...loginRaw.matchAll(/"accessibilityText"\s*:\s*"([^"]{2,80})"/g),
    ...loginRaw.matchAll(/"contentDescription"\s*:\s*"([^"]{2,80})"/g),
    ...loginRaw.matchAll(/"label"\s*:\s*"([^"]{2,80})"/g),
  ].map(m => m[1]).filter(l => {
    const t = l.trim().toLowerCase();
    // Exclude navigation buttons
    if (/^(back|close|cancel|×|✕|exit|navigate up|up|more options|open drawer|overflow|recent apps|overview|home|recents|switch apps)$/i.test(t)) return false;
    // Exclude system UI text
    if (/wi-?fi|battery|signal|status bar|navigation|notification|ringer|recent|apps|android|system|sim|carrier|operator|usb|charging|power|volume|media|alarm|clock|calendar|weather|location|gps|bluetooth|airplane|do not disturb|focus|quiet|silent|vibrate/i.test(t)) return false;
    return true;
  });

  // Filter to readable hints only - EXCLUDE system UI text
  const readableHints = allHints.filter(h => {
    const ht = h.toLowerCase().trim();
    // Exclude system UI patterns
    if (/^(back|close|cancel|×|✕|exit|navigate up|up|more options|open drawer|overflow|recent apps|overview|home|recents|switch apps)$/i.test(ht)) return false;
    if (/wi-?fi|battery|signal|status bar|navigation|notification|ringer|recent|apps|android|system|sim|carrier|operator|usb|charging|power|volume|media|alarm|clock|calendar|weather|location|gps|bluetooth|airplane|do not disturb|focus|quiet|silent|vibrate/i.test(ht)) return false;
    // Must contain printable ASCII characters
    if (!/[\x20-\x7E]/.test(h) || /^\?+$/.test(h)) return false;
    return true;
  });

  // Detect submit button: accessibilityText matching login/submit patterns
  const submitText = allLabels.find(t =>
    /^(masuk|login|sign.?in|submit|lanjut|continue|daftar|enter)$/i.test(t.trim())
  ) || 'Masuk';

  // SMART matching: match labels to fields by TYPE, not by index
  // Email field: look for labels containing "email", "user", "login"
  // Password field: look for labels containing "password", "pin", "kata sandi"
  fields = fields.map(f => {
    const fType = (f.type || '').toLowerCase();
    const fName = (f.name || '').toLowerCase();

    // Find matching label by content relevance
    const matchLabel = allLabels.find(l => {
      const lt = l.toLowerCase().trim();
      if (fType === 'email' || fName.includes('email') || fName.includes('user')) {
        return /email|user|login|username|name/i.test(lt);
      }
      if (fType === 'password' || fName.includes('password') || fName.includes('pass')) {
        return /password|pass|pin|kata|sandi|otp/i.test(lt);
      }
      if (fType === 'tel' || fName.includes('phone') || fName.includes('nomor') || fName.includes('tel')) {
        return /phone|nomor|tel|hp|telepon/i.test(lt);
      }
      return false;
    });

    // Find matching hint
    const matchHint = readableHints.find(h => {
      const ht = h.toLowerCase();
      if (fType === 'email') return /email|user|login/i.test(ht);
      if (fType === 'password') return /password|pass|pin|kata/i.test(ht);
      if (fType === 'tel') return /phone|nomor|tel/i.test(ht);
      return false;
    });

    // Use the best available: hint > matched label > fallback to name
    if (matchHint) {
      return { ...f, placeholder: matchHint, tapTarget: matchHint };
    } else if (matchLabel) {
      return { ...f, tapTarget: matchLabel };
    } else {
      // Last resort: use original name
      return { ...f, tapTarget: f.name };
    }
  });

  console.log(`[detectLoginScreen] allHints=${JSON.stringify(allHints.slice(0, 10))}, allLabels=${JSON.stringify(allLabels.slice(0, 10))}`);
  console.log(`[detectLoginScreen] enriched fields: ${JSON.stringify(fields)}`);

  return { fields, loginSummary, rawHierarchy: loginRaw, submitText };
}

// ─── Phase 2: AI-powered login flow generation ────────────────────────────────

function buildLoginFlow(
  appId: string,
  fields: { name: string; placeholder: string; type: string; tapTarget?: string }[] | undefined | null,
  credentials: Record<string, string>,
  submitText?: string,
): string {
  try {
    // Ensure fields is always a valid array
    const safeFields: { name: string; placeholder: string; type: string; tapTarget?: string }[] = Array.isArray(fields) && fields.length > 0 ? fields : [];
    const credEntries = Object.entries(credentials);

    console.log(`[buildLoginFlow] Input: appId=${appId}, fields=${JSON.stringify(fields)}, credentials count=${credEntries.length}, submitText=${submitText}`);
    console.log(`[buildLoginFlow] safeFields with tapTargets: ${JSON.stringify(safeFields.map(f => ({ name: f.name, tapTarget: f.tapTarget })))}`);

    const steps: string[] = [
      `appId: ${appId}`,
      '---',
      '- launchApp',
      '- waitForAnimationToEnd',
    ];

    const isReadable = (s: string | undefined): s is string =>
      !!s && s.length > 1 && !/^\?+$/.test(s) && !/^[^\x20-\x7E]+$/.test(s);

    credEntries.forEach(([fieldName, val], i) => {
      console.log(`[buildLoginFlow] === Processing credential ${i} ===`);
      console.log(`[buildLoginFlow] fieldName: ${fieldName}, val: ${val}`);

      // Smart field matching: find field by name/type, then use element text (tapTarget)
      const field = safeFields.find(f =>
        f.name.toLowerCase().includes(fieldName.toLowerCase()) ||
        (fieldName.toLowerCase().includes('email') && f.type === 'email') ||
        (fieldName.toLowerCase().includes('password') && f.type === 'password')
      );

      if (field && isReadable(field.tapTarget)) {
        // Use element text (hintText/accessibilityText) as tapOn target — much more reliable than coordinates
        const safeText = field.tapTarget.replace(/"/g, '\\"');
        console.log(`[buildLoginFlow] Matched field: ${field.name} (type: ${field.type}), using tapTarget text: "${field.tapTarget}"`);
        steps.push(`- tapOn: "${safeText}"`);
        steps.push(`- inputText: "${val}"`);
      } else if (field) {
        // Field detected but no readable text, fallback to placeholder as hint
        if (isReadable(field.placeholder)) {
          const safeText = field.placeholder.replace(/"/g, '\\"');
          console.log(`[buildLoginFlow] Matched field: ${field.name} (type: ${field.type}), no tapTarget, using placeholder: "${field.placeholder}"`);
          steps.push(`- tapOn: "${safeText}"`);
          steps.push(`- inputText: "${val}"`);
        } else {
          // Last resort: coordinates
          const isPasswordField = field.type === 'password' || field.name.toLowerCase().includes('password') || fieldName.toLowerCase().includes('password');
          const coord = isPasswordField ? '50%,55%' : '50%,40%';
          console.log(`[buildLoginFlow] Matched field: ${field.name} (type: ${field.type}), no tapTarget/placeholder, using coordinate: ${coord}`);
          steps.push(`- tapOn:\n    point: "${coord}"`);
          steps.push(`- inputText: "${val}"`);
        }
      } else {
        // No field detected, use default position based on credential order
        const coord = i === 0 ? '50%,40%' : '50%,55%';
        console.log(`[buildLoginFlow] No field match for ${fieldName}, using default coordinate: ${coord}`);
        steps.push(`- tapOn:\n    point: "${coord}"`);
        steps.push(`- inputText: "${val}"`);
      }
    });

    steps.push('- hideKeyboard');

    // Submit button: use text if provided, else coordinate
    if (submitText && isReadable(submitText)) {
      const safeSubmit = submitText.replace(/"/g, '\\"');
      console.log(`[buildLoginFlow] Submit button: text "${submitText}"`);
      steps.push(`- tapOn: "${safeSubmit}"`);
    } else {
      console.log(`[buildLoginFlow] Submit button: coordinate 50%,70%`);
      steps.push(`- tapOn:\n    point: "50%,70%"`);
    }
    steps.push('- waitForAnimationToEnd');

    const yaml = steps.join('\n');
    console.log(`[buildLoginFlow] Generated YAML:\n${yaml}`);
    return yaml;
  } catch (error) {
    console.error('[buildLoginFlow] Error building login flow:', error);
    throw new Error(`Failed to build login flow: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ─── Simple one-screen crawl ──────────────────────────────────────────────────

export async function crawlAppHierarchy(appId: string): Promise<string> {
  const launchFlow = `appId: ${appId}\n---\n- launchApp\n- waitForAnimationToEnd\n`;
  await runTempFlow(launchFlow, 60000);
  await sleep(3000);
  return captureHierarchy();
}

// ─── Two-phase state-based crawl (deep BFS exploration) ─────────────────────

export interface DiscoveredScreen {
  name: string;
  tapTarget: string;
  elements: FlowElement[];
  hierarchy: string;
  depth: number;
  // Verified interactions: what we actually tapped + what appeared after
  verifiedInteractions?: {
    tappedOn: string;
    verifiedVisible: string[];
    tapSucceeded: boolean;
  }[];
}

export interface CrawlResult {
  hierarchySummary: string;
  loginFlowYaml: string;
  screens: DiscoveredScreen[];
}

export async function statefulCrawl(
  appId: string,
  loginSummary: string,
  credentials: Record<string, string>,
  maxScreens = 8,
  loginFields?: { name: string; placeholder: string; type: string }[] | null,
  submitText?: string,
  framework: 'native' | 'flutter' | 'auto' = 'auto',
): Promise<CrawlResult> {

  // ── Phase 1: Build login flow deterministically from detected fields ──
  console.log('[CrawlGenerate] Phase 1: Building login flow from detected elements');
  const safeLoginFields = Array.isArray(loginFields) && loginFields.length > 0 ? loginFields : undefined;
  console.log(`[CrawlGenerate] loginFields provided: ${Array.isArray(loginFields)}, count: ${loginFields?.length ?? 0}, safe count: ${safeLoginFields?.length ?? 0}`);
  let loginFlowYaml: string;
  try {
    loginFlowYaml = buildLoginFlow(appId, safeLoginFields, credentials, submitText);
  } catch (error) {
    console.error('[CrawlGenerate] Failed to build login flow:', error);
    throw new Error(`Failed to build login flow: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ── Phase 2: Deep BFS exploration — map all screens ──
  console.log('[CrawlGenerate] Phase 2: Deep BFS crawl — mapping all app screens');

  // Wake device
  await sshExec(`${SHELL_PREFIX} adb shell input keyevent KEYCODE_WAKEUP && sleep 1 && adb shell input keyevent KEYCODE_MENU && sleep 2`, 30000).catch(() => {});

  // Launch app and login if credentials are available
  if (credentials && Object.keys(credentials).length > 0 && loginFlowYaml) {
    console.log('[CrawlBFS] Executing login flow to reach post-login state...');
    await runTempFlow(loginFlowYaml, 120000);
    await sleep(3000);
    console.log('[CrawlBFS] Login completed, capturing post-login home...');
  } else {
    // If no credentials, just launch the app
    console.log('[CrawlBFS] No credentials provided, launching app...');
    const launchFlow = `appId: ${appId}\n---\n- launchApp\n- waitForAnimationToEnd\n`;
    await runTempFlow(launchFlow, 60000);
    await sleep(3000);
  }

  const screenSummaries: string[] = [
    `=== Login Screen ===\n${loginSummary}`,
  ];

  const discoveredScreens: DiscoveredScreen[] = [];
  const visited = new Set<string>();

  // Step 1: Capture home screen (initial state after app launch)
  const homeRaw = await captureHierarchy();
  const homeElements = extractElementsFromHierarchy(parseHierarchy(homeRaw), framework);
  discoveredScreens.push({
    name: 'Home',
    tapTarget: 'launchApp',
    elements: homeElements,
    hierarchy: parseHierarchy(homeRaw),
    depth: 0,
  });
  screenSummaries.push(`=== Home Screen ===\n${parseHierarchy(homeRaw)}`);
  console.log(`[CrawlBFS] Home: ${homeElements.length} elements`);

  // Helper: Ensure we're still logged in. If session expired, re-login.
  const ensureLoggedIn = async () => {
    if (!credentials || Object.keys(credentials).length === 0) return;

    const currentRaw = await captureHierarchy();
    const currentHierarchy = parseHierarchy(currentRaw);

    // Check if login screen indicators are present
    const hasLoginElements = currentHierarchy.includes('Email') && currentHierarchy.includes('Password');
    const hasLoggedInIndicator = currentHierarchy.includes('Masuk untuk') || currentHierarchy.includes('login');

    if (hasLoginElements && hasLoggedInIndicator) {
      console.log('[CrawlBFS] Session expired or returned to login screen, re-logging in...');
      await runTempFlow(loginFlowYaml, 120000);
      await sleep(3000);
      console.log('[CrawlBFS] Re-login completed');
    }
  };

  // Step 2: BFS exploration from home screen
  const navElements = homeElements.filter(e => e.type === 'button' || e.type === 'nav');
  const skipPatterns = ['back', 'cancel', 'close', '×', 'exit', 'logout', 'sign out', 'hapus', 'delete'];

  for (const navEl of navElements) {
    if (discoveredScreens.length >= maxScreens) break;
    if (visited.has(navEl.text)) continue;
    if (skipPatterns.some(p => navEl.text.toLowerCase().includes(p))) continue;

    visited.add(navEl.text);
    const safeTarget = navEl.text.replace(/"/g, '\\"');

    // Tap navigation
    console.log(`[CrawlBFS] Tapping "${navEl.text}" to explore...`);
    const tapFlow = `appId: ${appId}\n---\n- tapOn: "${safeTarget}"\n- waitForAnimationToEnd\n`;
    try {
      await runTempFlow(tapFlow, 20000);
    } catch { continue; }
    
    // Wait longer for screen transition (especially for Flutter apps)
    await sleep(5000);

    // Ensure we're still logged in (session might have expired during navigation)
    await ensureLoggedIn();

    // Capture new screen
    const newRaw = await captureHierarchy();
    const newHierarchy = parseHierarchy(newRaw);

    // Check if screen actually changed (be more lenient: > 30 chars is enough)
    if (newHierarchy.length < 30 || newHierarchy === parseHierarchy(homeRaw)) {
      console.log(`[CrawlBFS] Screen didn't change after tapping "${navEl.text}", going back`);
      const backFlow = `appId: ${appId}\n---\n- pressKey: Back\n- waitForAnimationToEnd\n`;
      await runTempFlow(backFlow, 10000).catch(() => {});
      await sleep(1000);
      continue;
    }

    const newElements = extractElementsFromHierarchy(newHierarchy, framework);
    const screenName = navEl.text;

    console.log(`[CrawlBFS] Discovered "${screenName}": ${newElements.length} elements`);
    discoveredScreens.push({
      name: screenName,
      tapTarget: navEl.text,
      elements: newElements,
      hierarchy: newHierarchy,
      depth: 1,
    });
    screenSummaries.push(`=== Screen: "${screenName}" (from Home via "${navEl.text}") ===\n${newHierarchy}`);

    // Step 3: Explore sub-screens from this screen (depth 2)
    const subNavElements = newElements.filter(e => e.type === 'button' || e.type === 'nav');
    for (const subEl of subNavElements.slice(0, 3)) {
      if (discoveredScreens.length >= maxScreens) break;
      if (visited.has(subEl.text)) continue;
      if (skipPatterns.some(p => subEl.text.toLowerCase().includes(p))) continue;

      visited.add(subEl.text);
      const safeSub = subEl.text.replace(/"/g, '\\"');

      const subTapFlow = `appId: ${appId}\n---\n- tapOn: "${safeSub}"\n- waitForAnimationToEnd\n`;
      try {
        await runTempFlow(subTapFlow, 20000);
      } catch { continue; }
      await sleep(4000);

      // Ensure session still valid before capturing sub-screen
      await ensureLoggedIn();

      const subRaw = await captureHierarchy();
      const subHierarchy = parseHierarchy(subRaw);

      if (subHierarchy.length < 30) {
        const backFlow = `appId: ${appId}\n---\n- pressKey: Back\n- waitForAnimationToEnd\n`;
        await runTempFlow(backFlow, 10000).catch(() => {});
        await sleep(1000);
        continue;
      }

      const subElements = extractElementsFromHierarchy(subHierarchy, framework);
      const subName = `${screenName} → ${subEl.text}`;

      console.log(`[CrawlBFS] Discovered "${subName}": ${subElements.length} elements`);
      discoveredScreens.push({
        name: subName,
        tapTarget: subEl.text,
        elements: subElements,
        hierarchy: subHierarchy,
        depth: 2,
      });
      screenSummaries.push(`=== Screen: "${subName}" ===\n${subHierarchy}`);

      // Go back to parent screen
      const backFlow2 = `appId: ${appId}\n---\n- pressKey: Back\n- waitForAnimationToEnd\n`;
      await runTempFlow(backFlow2, 10000).catch(() => {});
      await sleep(1000);
    }

    // Go back to home screen
    const backFlow = `appId: ${appId}\n---\n- pressKey: Back\n- waitForAnimationToEnd\n`;
    await runTempFlow(backFlow, 10000).catch(() => {});
    await sleep(1500);
  }

  console.log(`[CrawlBFS] Total screens discovered: ${discoveredScreens.length}`);

  const combined = screenSummaries.join('\n\n');
  return {
    hierarchySummary: combined.length > 12000 ? combined.slice(0, 12000) + '\n... (truncated)' : combined,
    loginFlowYaml,
    screens: discoveredScreens,
  };
}

type DetectedPlatform = 'flutter' | 'native-android' | 'native-ios';

// ─── Deterministic Maestro flow generation from hierarchy ────────────────────

interface FlowElement {
  text: string;
  hint: string;
  type: 'button' | 'text' | 'input' | 'image' | 'nav';
}

function extractElementsFromHierarchy(hierarchySummary: string, framework: 'native' | 'flutter' | 'auto' = 'auto'): FlowElement[] {
  const elements: FlowElement[] = [];
  const seen = new Set<string>();

  // Detect framework/platform if auto
  let detectedPlatform: DetectedPlatform = framework === 'auto'
    ? detectFramework(hierarchySummary)
    : (framework === 'flutter' ? 'flutter' : 'native-android');

  const lines = hierarchySummary.split('\n');

  for (const line of lines) {
    const textMatch = line.match(/text="([^"]{1,60})"/);
    const hintMatch = line.match(/hint="([^"]{1,60})"/);
    const typeMatch = line.match(/type=([^,]+)/);
    const idMatch = line.match(/id="([^"]+)"/);

    const text = textMatch ? textMatch[1] : '';
    const hint = hintMatch ? hintMatch[1] : '';
    const id = idMatch ? idMatch[1] : '';

    // Skip system UI elements (status bar, nav bar, notifications, system overlays)
    const resourceId = id.toLowerCase();
    if (resourceId.includes('com.android.systemui') ||
        resourceId.includes('com.android.launcher') ||
        resourceId.includes('com.google.android.googlequicksearchbox') ||
        resourceId.includes('navigation_bar') ||
        resourceId.includes('status_bar') ||
        resourceId.includes('com.android.systemui:id/nav') ||
        resourceId.includes('com.android.systemui:id/horizontal')) {
      continue;
    }

    // Skip known system text patterns (NOT "Home"/"Back" — those can be app elements)
    const label = text || hint;
    const systemPatterns = [
      // Status bar indicators
      /^no\s*sim/i, /^wi-?fi\s*signal/i, /^battery\s*(charging|level)?$/i, /^\d{1,2}:\d{2}$/,
      // Notification content
      /\bnotification:\s/i,
      // System overlays
      /^ringer\s*vibrate/i, /^optimizer\s*notification/i, /^recent\s*apps$/i,
    ];

    if (systemPatterns.some(re => re.test(label))) continue;

    // Skip empty or placeholder text
    if (!text && !hint) continue;
    if (label.trim().length < 2 || /^\?+$/.test(label)) continue;
    if (seen.has(label)) continue;
    seen.add(label);

    const widgetType = (typeMatch ? typeMatch[1] : '').toLowerCase();
    const type = classifyElement(widgetType, line, detectedPlatform);

    elements.push({ text: label, hint, type });
  }

  console.log(`[extractElements] Platform: ${detectedPlatform}, Extracted ${elements.length} elements: ${JSON.stringify(elements.map(e => `${e.text}(${e.type})`).slice(0, 25))}`);
  return elements;
}

// Detect framework and platform from hierarchy patterns
function detectFramework(raw: string): DetectedPlatform {
  const flutterMarkers = ['Semantics', 'RenderSemanticsGestureHandler', '_InkResponse',
    'RepaintBoundary', 'IgnorePointer', 'SingleChildScrollView', 'CustomScrollView',
    'Scaffold', 'Material', 'SafeArea'];

  const androidMarkers = ['android.widget.', 'androidx.', 'com.google.android.material',
    'FrameLayout', 'LinearLayout', 'CoordinatorLayout', 'android.view.ViewGroup',
    'android.support', 'com.android.systemui'];

  const iosMarkers = ['XCUIElementType', 'UIA', 'AppKit', 'UIKit', 'NSLayoutConstraint',
    '_UITemporaryLayoutWidth', '_UITemporaryLayoutHeight'];

  let flutterScore = 0;
  let androidScore = 0;
  let iosScore = 0;

  for (const m of flutterMarkers) {
    if (raw.includes(m)) flutterScore++;
  }
  for (const m of androidMarkers) {
    if (raw.includes(m)) androidScore++;
  }
  for (const m of iosMarkers) {
    if (raw.includes(m)) iosScore++;
  }

  // Flutter wins if it has strong markers (overrides native)
  if (flutterScore >= 3) return 'flutter';
  // Otherwise, check native platform
  if (iosScore > androidScore) return 'native-ios';
  if (androidScore > 0) return 'native-android';
  // Default: assume Android (most common for Maestro users)
  return 'native-android';
}

// Classify element based on widget type and platform
function classifyElement(widgetType: string, line: string, platform: DetectedPlatform): FlowElement['type'] {
  if (platform === 'flutter') {
    // Flutter-specific classification
    if (/button|toggle|checkbox|switch|inkwell|gesture|semantics.*clickable|semanticsbutton/.test(widgetType)) return 'button';
    if (/edittext|textinput|textfield|textformfield|cupertinotextfield|semantics.*input|semantics.*text\s*field/i.test(widgetType)) return 'input';
    if (/tab|navigation|viewpager|bottomnav|toolbar|appbar|tabbar|bottomnavigationbar/.test(widgetType)) return 'nav';
    // Flutter fallback: Semantics with clickable=true but NOT a container
    if (widgetType.includes('semantics') || widgetType.includes('inkwell')) {
      if (line.includes('clickable=true') && !/semanticscontainer|viewport|sliver/.test(widgetType)) return 'button';
    }
    return 'text';
  }

  if (platform === 'native-ios') {
    // iOS native classification
    if (/xcuielementtypebutton|xcuielementtypesegmentedcontrol|xcuielementtypepickerwheel|xcuielementtypeswitch|xcuielementtypeslider/.test(widgetType)) return 'button';
    if (/xcuielementtypetextfield|xcuielementtypetextview|xcuielementtypesecuretextfield/.test(widgetType)) return 'input';
    if (/xcuielementtypetabbar|xcuielementtypenavigationbar|xcuielementtypetoolbar|xcuielementtypepageindicator/.test(widgetType)) return 'nav';
    // iOS fallback: clickable with text
    if (line.includes('clickable=true') || line.includes('enabled=true')) {
      if (!/xcuielementtypeother|xcuielementtypecell|xcuielementtypecollectionview/.test(widgetType)) return 'button';
    }
    return 'text';
  }

  // Native Android classification — STRICT: only explicit button widgets
  if (/button|imagebutton|toggle|checkbox|switch|floatingactionbutton|radiobutton/.test(widgetType)) return 'button';
  if (/edittext|textinput|textfield|spinner|autocomplete/.test(widgetType)) return 'input';
  if (/tab|navigation|viewpager|bottomnav|toolbar|appbar|tabhost|tabwidget/.test(widgetType)) return 'nav';

  // DO NOT use clickable=true fallback — Android marks many text elements as clickable
  // Only classify as button if the text is a VERY specific, short action word (1-2 words)
  const exactBtnWords = new Set([
    'masuk','login','signin','submit','save','simpan','kirim','send','lanjut','continue',
    'next','ok','batal','cancel','hapus','delete','edit','ubah','tambah','add',
    'cari','search','filter','export','download','upload','setting','settings',
    'beranda','home','dashboard','riwayat','history','profil','profile','akun','account',
    'detail','info','about','help','bantuan','konfirmasi','confirm','setuju','approve',
    'tolak','reject','reset','clear','bersihkan','ya','tidak','yes','no',
  ]);

  const lowerText = line.toLowerCase();
  const textMatch = line.match(/text="([^"]{1,40})"/);
  if (textMatch) {
    const text = textMatch[1].toLowerCase().trim();
    // Must be exactly 1-2 words AND match a known button label
    const words = text.split(/\s+/);
    if (words.length <= 2 && exactBtnWords.has(text)) return 'button';
    // Also check if text contains a short nav target (single word)
    if (words.length === 1 && exactBtnWords.has(words[0])) return 'button';
  }

  return 'text';
}

function generateDeterministicFlows(
  appId: string,
  hierarchySummary: string,
  credentials?: Record<string, string>,
  framework: 'native' | 'flutter' | 'auto' = 'auto',
): { name: string; yaml: string }[] {
  const elements = extractElementsFromHierarchy(hierarchySummary, framework);
  const flows: { name: string; yaml: string }[] = [];

  // Group elements by type
  const buttons = elements.filter(e => e.type === 'button');
  const navItems = elements.filter(e => e.type === 'nav');
  const texts = elements.filter(e => e.type === 'text');
  const inputElements = elements.filter(e => e.type === 'input');

  // Flow 1: Navigate through screens (tap nav items and buttons, assert text)
  // Note: login_verified flow is prepended separately by the route, so this assumes post-login state
  const navSteps: string[] = [`appId: ${appId}`, '---', '- launchApp', '- waitForAnimationToEnd'];

  // Tap through navigation elements (limit to 8 to keep flows fast)
  const tapElements = [...navItems, ...buttons].slice(0, 8);
  for (const el of tapElements) {
    const safeText = el.text.replace(/"/g, '\\"');
    navSteps.push(`- tapOn: "${safeText}"`);
    navSteps.push('- waitForAnimationToEnd');
    navSteps.push(`- assertVisible: "${safeText}"`);
  }

  if (tapElements.length > 0) {
    flows.push({ name: 'navigate_all_screens', yaml: navSteps.join('\n') });
  }

  // Flow 2: UI Smoke test (assert all visible elements exist)
  const smokeSteps: string[] = [`appId: ${appId}`, '---', '- launchApp', '- waitForAnimationToEnd'];
  const assertElements = [...texts, ...buttons, ...navItems].slice(0, 10);
  for (const el of assertElements) {
    const safeText = el.text.replace(/"/g, '\\"');
    smokeSteps.push(`- assertVisible: "${safeText}"`);
  }

  if (assertElements.length > 0) {
    flows.push({ name: 'ui_smoke_test', yaml: smokeSteps.join('\n') });
  }

  // Flow 3: Deep navigation (tap deeper elements, scroll, explore)
  const deepElements = [...texts.slice(4, 10), ...buttons.slice(2, 6)];
  if (deepElements.length > 0) {
    const deepSteps: string[] = [`appId: ${appId}`, '---', '- launchApp', '- waitForAnimationToEnd'];
    for (const el of deepElements.slice(0, 6)) {
      const safeText = el.text.replace(/"/g, '\\"');
      deepSteps.push(`- tapOn: "${safeText}"`);
      deepSteps.push('- waitForAnimationToEnd');
      deepSteps.push(`- assertVisible: "${safeText}"`);
    }
    flows.push({ name: 'deep_navigation', yaml: deepSteps.join('\n') });
  }

  // Flow 4: Form interaction (if any input elements)
  if (inputElements.length > 0) {
    const formSteps: string[] = [`appId: ${appId}`, '---', '- launchApp', '- waitForAnimationToEnd'];
    for (const el of inputElements.slice(0, 3)) {
      const safeText = el.text.replace(/"/g, '\\"');
      formSteps.push(`- tapOn: "${safeText}"`);
      formSteps.push('- inputText: "test123"');
      formSteps.push(`- assertVisible: "test123"`);
    }
    flows.push({ name: 'form_interaction', yaml: formSteps.join('\n') });
  }

  // Flow 5: Scroll & discover (scroll down to find more elements)
  const scrollableElements = elements.filter(e => e.type === 'text').slice(0, 5);
  if (scrollableElements.length > 2) {
    const scrollSteps: string[] = [`appId: ${appId}`, '---', '- launchApp', '- waitForAnimationToEnd'];
    scrollSteps.push('- scroll');
    scrollSteps.push('- waitForAnimationToEnd');
    for (const el of scrollableElements.slice(0, 3)) {
      const safeText = el.text.replace(/"/g, '\\"');
      scrollSteps.push(`- scrollUntilVisible:\n    element:\n      text: "${safeText}"\n    direction: DOWN`);
      scrollSteps.push(`- assertVisible: "${safeText}"`);
    }
    flows.push({ name: 'scroll_discover', yaml: scrollSteps.join('\n') });
  }

  console.log(`[generateFlows] Created ${flows.length} deterministic flows from ${elements.length} elements`);
  return flows;
}

// ─── E2E flow generation from screen graph ──────────────────────────────────

function generateE2EFlows(
  appId: string,
  screens: DiscoveredScreen[],
  credentials?: Record<string, string>,
): { name: string; yaml: string }[] {
  const flows: { name: string; yaml: string }[] = [];
  if (!screens || screens.length < 2) return flows;

  const homeScreen = screens.find(s => s.name === 'Home') || screens[0];
  const childScreens = screens.filter(s => s.depth >= 1 && s.name !== 'Home');
  const skipPatterns = ['back', 'cancel', 'close', '×', 'exit', 'logout', 'sign out', 'hapus', 'delete'];
  const btnWords = ['masuk', 'login', 'submit', 'save', 'simpan', 'kirim', 'send', 'lanjut', 'continue',
    'next', 'back', 'previous', 'kembali', 'ok', 'cancel', 'batal', 'ya', 'tidak', 'hapus', 'delete',
    'edit', 'ubah', 'tambah', 'add', 'cari', 'search', 'filter', 'export', 'download', 'upload',
    'setting', 'profile', 'akun', 'account', 'home', 'beranda', 'dashboard', 'riwayat', 'history',
    'detail', 'info', 'about', 'help', 'bantuan'];

  // STRONGER filter: don't tap on section headers, descriptive text, or data labels
  // "Ringkasan bulan ini", "Total hari", "Toleransi tersisa" → NOT buttons
  const descriptiveWords = [
    'ringkasan','summary','total','jumlah','bulan','month','hari','day','minggu',
    'week','tahun','year','toleransi','tolerance','sisa','remaining','lembur',
    'overtime','hadir','present','absen','absent','terlambat','late','waktu',
    'time','tanggal','date','jam','hour','menit','minute','detik','second',
    'status','keterangan','description','catatan','note','informasi','data',
    'laporan','report','daftar','list','semua','all','tidak ada','no','belum',
    'not yet','sudah','already','aktif','active','nonaktif','inactive',
  ];

  const isActionable = (el: FlowElement) => {
    if (el.type !== 'button' && el.type !== 'nav') return false;
    const t = el.text.toLowerCase().trim();
    // Skip if too long (section headers, data labels)
    if (t.length > 25) return false;
    // Skip if multiple words that look like a phrase/sentence
    if (t.split(/\s+/).length > 3) return false;
    // Skip if contains descriptive words
    if (descriptiveWords.some(w => t.includes(w))) return false;
    // Skip back/cancel/close patterns
    if (skipPatterns.some(p => t.includes(p))) return false;
    return true;
  };

  const escapeText = (s: string) => s.replace(/"/g, '\\"');

  // E2E Flow 1: Full app tour — Home → every screen → back
  if (childScreens.length > 0) {
    const steps: string[] = [`appId: ${appId}`, '---', '- launchApp', '- waitForAnimationToEnd'];

    // Inject login if credentials exist
    if (credentials && Object.keys(credentials).length > 0) {
      const [user, pass] = Object.values(credentials);
      steps.push('- tapOn: "Email"');
      steps.push(`- inputText: "${user}"`);
      steps.push('- tapOn: "Password"');
      steps.push(`- inputText: "${pass}"`);
      steps.push('- tapOn: "Masuk"');
      steps.push('- waitForAnimationToEnd');
    }

    // Navigate through each discovered screen
    const tourScreens = childScreens.slice(0, 6);
    for (const screen of tourScreens) {
      const navBtn = homeScreen.elements.find(e =>
        e.text === screen.tapTarget || e.text.includes(screen.tapTarget)
      );
      if (navBtn && isActionable(navBtn)) {
        const safeText = escapeText(navBtn.text);
        steps.push(`# Navigate to ${screen.name}`);
        steps.push(`- tapOn: "${safeText}"`);
        steps.push('- waitForAnimationToEnd');
        steps.push(`- assertVisible: "${escapeText(screen.elements[0]?.text || screen.name)}"`);
      }
    }

    flows.push({ name: 'e2e_full_app_tour', yaml: steps.join('\n') });
  }

  // E2E Flow 2: CRUD-like workflow — navigate → interact with elements → verify
  if (childScreens.length > 0) {
    const firstChild = childScreens[0];
    const steps: string[] = [`appId: ${appId}`, '---', '- launchApp', '- waitForAnimationToEnd'];

    if (credentials && Object.keys(credentials).length > 0) {
      const [user, pass] = Object.values(credentials);
      steps.push('- tapOn: "Email"');
      steps.push(`- inputText: "${user}"`);
      steps.push('- tapOn: "Password"');
      steps.push(`- inputText: "${pass}"`);
      steps.push('- tapOn: "Masuk"');
      steps.push('- waitForAnimationToEnd');
    }

    // Navigate to first child screen
    const navBtn = homeScreen.elements.find(e =>
      e.text === firstChild.tapTarget || e.text.includes(firstChild.tapTarget)
    );
    if (navBtn && isActionable(navBtn)) {
      const safeNav = escapeText(navBtn.text);
      steps.push(`- tapOn: "${safeNav}"`);
      steps.push('- waitForAnimationToEnd');

      // Interact with elements on the child screen
      const childActions = firstChild.elements.filter(isActionable).slice(0, 4);
      for (const action of childActions) {
        const safeAction = escapeText(action.text);
        steps.push(`- tapOn: "${safeAction}"`);
        steps.push('- waitForAnimationToEnd');
        // Verify something is visible after the action
        const verifyEl = firstChild.elements.find(e => e.type === 'text' && e.text !== action.text);
        if (verifyEl) {
          steps.push(`- assertVisible: "${escapeText(verifyEl.text)}"`);
        }
      }
    }

    flows.push({ name: 'e2e_crud_workflow', yaml: steps.join('\n') });
  }

  // E2E Flow 3: Multi-tab navigation — cycle through tabs/sections
  const navElements = homeScreen.elements.filter(e => e.type === 'nav' || e.type === 'button').slice(0, 5);
  if (navElements.length >= 2) {
    const steps: string[] = [`appId: ${appId}`, '---', '- launchApp', '- waitForAnimationToEnd'];

    if (credentials && Object.keys(credentials).length > 0) {
      const [user, pass] = Object.values(credentials);
      steps.push('- tapOn: "Email"');
      steps.push(`- inputText: "${user}"`);
      steps.push('- tapOn: "Password"');
      steps.push(`- inputText: "${pass}"`);
      steps.push('- tapOn: "Masuk"');
      steps.push('- waitForAnimationToEnd');
    }

    for (const nav of navElements) {
      const safeNav = escapeText(nav.text);
      steps.push(`# Navigate to ${nav.text}`);
      steps.push(`- tapOn: "${safeNav}"`);
      steps.push('- waitForAnimationToEnd');
      // Verify the screen changed by checking for a text unique to that screen
      const targetScreen = screens.find(s => s.tapTarget === nav.text || s.name === nav.text);
      if (targetScreen) {
        const uniqueText = targetScreen.elements.find(e =>
          e.type === 'text' && !homeScreen.elements.some(h => h.text === e.text)
        );
        if (uniqueText) {
          steps.push(`- assertVisible: "${escapeText(uniqueText.text)}"`);
        }
      }
    }

    flows.push({ name: 'e2e_multi_tab_navigation', yaml: steps.join('\n') });
  }

  // E2E Flow 4: Form fill + submit (if any input elements exist)
  const allInputs = screens.flatMap(s => s.elements.filter(e => e.type === 'input'));
  if (allInputs.length > 0) {
    const steps: string[] = [`appId: ${appId}`, '---', '- launchApp', '- waitForAnimationToEnd'];

    if (credentials && Object.keys(credentials).length > 0) {
      const [user, pass] = Object.values(credentials);
      steps.push('- tapOn: "Email"');
      steps.push(`- inputText: "${user}"`);
      steps.push('- tapOn: "Password"');
      steps.push(`- inputText: "${pass}"`);
      steps.push('- tapOn: "Masuk"');
      steps.push('- waitForAnimationToEnd');
    }

    // Fill inputs and submit
    for (const input of allInputs.slice(0, 3)) {
      const safeInput = escapeText(input.text);
      steps.push(`- tapOn: "${safeInput}"`);
      steps.push('- inputText: "test123"');
      steps.push(`- assertVisible: "test123"`);
    }

    // Find submit button
    const submitBtn = homeScreen.elements.find(e =>
      btnWords.some(w => e.text.toLowerCase().includes(w)) && e.type === 'button'
    );
    if (submitBtn) {
      steps.push(`- tapOn: "${escapeText(submitBtn.text)}"`);
      steps.push('- waitForAnimationToEnd');
    }

    flows.push({ name: 'e2e_form_submission', yaml: steps.join('\n') });
  }

  // E2E Flow 5: Deep navigation (depth 2 screens)
  const deepScreens = screens.filter(s => s.depth >= 2);
  if (deepScreens.length > 0) {
    const steps: string[] = [`appId: ${appId}`, '---', '- launchApp', '- waitForAnimationToEnd'];

    if (credentials && Object.keys(credentials).length > 0) {
      const [user, pass] = Object.values(credentials);
      steps.push('- tapOn: "Email"');
      steps.push(`- inputText: "${user}"`);
      steps.push('- tapOn: "Password"');
      steps.push(`- inputText: "${pass}"`);
      steps.push('- tapOn: "Masuk"');
      steps.push('- waitForAnimationToEnd');
    }

    for (const deep of deepScreens.slice(0, 3)) {
      // Navigate: Home → parent → deep
      const parentNav = homeScreen.elements.find(e =>
        e.text === deep.tapTarget || deep.name.startsWith(e.text)
      );
      if (parentNav && isActionable(parentNav)) {
        steps.push(`- tapOn: "${escapeText(parentNav.text)}"`);
        steps.push('- waitForAnimationToEnd');
      }
      // Then navigate to deep
      const parentScreen = screens.find(s => s.name === deep.name.split(' → ')[0]);
      if (parentScreen) {
        const deepNav = parentScreen.elements.find(e =>
          e.text === deep.tapTarget || deep.name.endsWith(e.text)
        );
        if (deepNav && isActionable(deepNav)) {
          steps.push(`- tapOn: "${escapeText(deepNav.text)}"`);
          steps.push('- waitForAnimationToEnd');
          if (deep.elements.length > 0) {
            steps.push(`- assertVisible: "${escapeText(deep.elements[0].text)}"`);
          }
        }
      }
    }

    flows.push({ name: 'e2e_deep_navigation', yaml: steps.join('\n') });
  }

  // E2E Flow 6+: Generate per-screen interaction flows (one flow per discovered screen)
  for (const child of childScreens.slice(0, 4)) {
    const navBtn = homeScreen.elements.find(e =>
      e.text === child.tapTarget || e.text.includes(child.tapTarget)
    );
    if (!navBtn || !isActionable(navBtn)) continue;

    const steps: string[] = [`appId: ${appId}`, '---', '- launchApp', '- waitForAnimationToEnd'];

    if (credentials && Object.keys(credentials).length > 0) {
      const [user, pass] = Object.values(credentials);
      steps.push('- tapOn: "Email"');
      steps.push(`- inputText: "${user}"`);
      steps.push('- tapOn: "Password"');
      steps.push(`- inputText: "${pass}"`);
      steps.push('- tapOn: "Masuk"');
      steps.push('- waitForAnimationToEnd');
    }

    const safeNav = escapeText(navBtn.text);
    steps.push(`- tapOn: "${safeNav}"`);
    steps.push('- waitForAnimationToEnd');

    // Interact with elements on this screen
    const actions = child.elements.filter(isActionable).slice(0, 3);
    for (const action of actions) {
      steps.push(`- tapOn: "${escapeText(action.text)}"`);
      steps.push('- waitForAnimationToEnd');
      const verifyEl = child.elements.find(e => e.type === 'text' && e.text !== action.text);
      if (verifyEl) steps.push(`- assertVisible: "${escapeText(verifyEl.text)}"`);
    }

    const safeName = child.name.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40);
    flows.push({ name: `e2e_${safeName}`, yaml: steps.join('\n') });
  }

  console.log(`[generateE2EFlows] Created ${flows.length} E2E flows from ${screens.length} screens`);

  // Inject screenshots for evidence
  return flows.map(f => ({ ...f, yaml: injectScreenshots(f.yaml) }));
}

// Inject takeScreenshot after every tap/wait action for evidence
function injectScreenshots(yaml: string): string {
  const lines = yaml.split('\n');
  const result: string[] = [];
  let screenshotIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i]);
    // Only inject after COMPLETE command lines (not multi-line YAML headers like `- tapOn:`)
    // Complete lines: `- command: "value"` or indented continuation lines
    const line = lines[i];
    const isCompleteCommand = /^\s*-\s*(tapOn|waitForAnimationToEnd|inputText|pressKey|scroll)\s*:/i.test(line);
    const hasValue = line.includes(':"') || line.includes(': {') || line.includes(': "');

    if (isCompleteCommand && hasValue) {
      // Check if next line is already a takeScreenshot (avoid doubles)
      if (i + 1 < lines.length && lines[i + 1].includes('takeScreenshot')) continue;
      screenshotIdx++;
      result.push(`- takeScreenshot: "evidence_step_${String(screenshotIdx).padStart(2, '0')}.png"`);
    }
  }

  return result.join('\n');
}

// ─── Convert AI test case to executable Maestro flow ─────────────────────────

function testCaseToMaestroFlow(
  appId: string,
  testCase: CrawlGeneratedResult['testCases'][0],
  credentials: Record<string, string> | undefined,
  loginFields: { name: string; placeholder: string; type: string; tapTarget?: string }[] | undefined,
  submitText: string | undefined,
  detectedPlatform: DetectedPlatform,
  hierarchySummary?: string,
): { name: string; yaml: string } | null {
  const skipPatterns = ['back', 'cancel', 'close', '×', 'exit', 'logout', 'sign out', 'hapus', 'delete'];
  const escapeText = (s: string) => s.replace(/"/g, '\\"');

  const steps: string[] = [`appId: ${appId}`, '---', '- launchApp', '- waitForAnimationToEnd'];

  // Inject login flow if credentials provided — use same logic as buildLoginFlow
  if (credentials && Object.keys(credentials).length > 0) {
    const safeLoginFields: { name: string; placeholder: string; type: string; tapTarget?: string }[] =
      loginFields && loginFields.length > 0 ? loginFields : [];

    console.log(`[testCaseToMaestroFlow] Test: "${testCase.title}", loginFields: ${JSON.stringify(safeLoginFields)}, credentials: ${JSON.stringify(credentials)}, submitText: ${submitText}`);

    // Filter out garbage tapTarget values (system UI, status bar text, etc.)
    const isValidTapTarget = (s: string | undefined, fieldType?: string): boolean => {
      if (!s || s.length < 2) return false;
      // Reject system UI patterns
      if (/wi-?fi|battery|signal|status bar|navigation|notification|ringer|optimizer/i.test(s)) return false;
      // Reject placeholder-like values that look like input masks (dots, etc.)
      if (/^[•●\*]+$/.test(s)) return false;
      // Reject action/button text — especially for input fields
      // If tapTarget is "Masuk untuk melanjutkan" for a password field, it's the submit button, not the input
      if (/^(masuk|login|sign.?in|submit|lanjut|continue|daftar|enter|oke|ok)\b/i.test(s)) return false;
      if (/untuk|to\s+(continue|login|proceed|submit|enter)/i.test(s)) return false;
      return true;
    };

    const isReadable = (s: string | undefined): s is string =>
      !!s && s.length > 1 && !/^\?+$/.test(s) && !/^[^\x20-\x7E]+$/.test(s);

    Object.entries(credentials).forEach(([fieldName, val], i) => {
      // Smart field matching: by name/type (same as buildLoginFlow)
      const field = safeLoginFields.find(f =>
        f.name.toLowerCase().includes(fieldName.toLowerCase()) ||
        (fieldName.toLowerCase().includes('email') && f.type === 'email') ||
        (fieldName.toLowerCase().includes('password') && f.type === 'password') ||
        (fieldName.toLowerCase().includes('phone') && f.type === 'tel')
      );

      console.log(`[testCaseToMaestroFlow] Credential "${fieldName}": field found=${!!field}, tapTarget=${field?.tapTarget}, placeholder=${field?.placeholder}, type=${field?.type}, isValidTapTarget=${isValidTapTarget(field?.tapTarget)}`);

      if (field && isValidTapTarget(field.tapTarget)) {
        const safeText = field.tapTarget.replace(/"/g, '\\"');
        steps.push(`- tapOn: "${safeText}"`);
        steps.push(`- inputText: "${val}"`);
      } else if (field && isReadable(field.placeholder)) {
        const safeText = field.placeholder.replace(/"/g, '\\"');
        console.log(`[testCaseToMaestroFlow] Using placeholder for "${fieldName}": "${safeText}"`);
        steps.push(`- tapOn: "${safeText}"`);
        steps.push(`- inputText: "${val}"`);
      } else {
        // Last resort: coordinates
        const isPasswordField = field?.type === 'password' ||
          field?.name.toLowerCase().includes('password') ||
          fieldName.toLowerCase().includes('password');
        const coord = i === 0 ? '50%,40%' : '50%,55%';
        console.log(`[testCaseToMaestroFlow] Using coordinate fallback for "${fieldName}": ${coord}`);
        steps.push(`- tapOn:\n    point: "${coord}"`);
        steps.push(`- inputText: "${val}"`);
      }
    });

    steps.push('- hideKeyboard');

    if (submitText && isReadable(submitText)) {
      const safeSubmit = submitText.replace(/"/g, '\\"');
      steps.push(`- tapOn: "${safeSubmit}"`);
    } else {
      steps.push(`- tapOn:\n    point: "50%,70%"`);
    }
    steps.push('- waitForAnimationToEnd');
  }

  // Convert test case steps to Maestro commands
  const testSteps = testCase.steps || [];

  // Build a list of real UI element names from hierarchy to validate targets
  const realElementNames = new Set<string>();
  for (const m of (testCase.description || '').matchAll(/["']([^"']{1,50})["']/g)) realElementNames.add(m[1]);
  for (const m of (testCase.expectedResult || '').matchAll(/["']([^"']{1,50})["']/g)) realElementNames.add(m[1]);
  for (const m of hierarchySummary?.matchAll(/(?:text|hint|accessibilityText)="([^"]{1,60})"/g) || []) {
    const val = m[1];
    if (val.length > 1 && !/^\?+$/.test(val)) realElementNames.add(val);
  }

  // Helper: check if a string is likely a real UI element (not a description)
  const BANNED_WORDS = new Set([
    'screen','field','form','button','menu','tab','panel','card','item','list','grid',
    'text','label','title','header','footer','content','body','data','record','info',
    'message','alert','dialog','notification','warning','notice','tip','help','guide',
    'error','success','status','result','output','response','feedback','attempt',
    'credentials','tolerance','functionality','permission','feature','section','option',
    'setting','preference','account','dashboard','report','chart','graph','calendar',
    'schedule','event','task','note','comment','review','rating','score','summary',
    'detail','view','profile','home','login','main','user','greeting','displayed',
    'shown','appears','initiated','email','password','input','validation','cursor',
    'limited','access','attendance','information','navigation','outsource','vendor',
    'month','monthly','daily','weekly','time','date','day','today','yesterday',
    'still','filled','entering','leaving','appropriate','visible','correct',
    'process','starts','complete','proper','invalid','valid','wrong','right',
    'empty','blank','null','true','false','yes','no','new','old','first','last',
    'next','previous','back','forward','up','down','top','bottom','left','right',
    // Measurements & abstract concepts (NOT real UI button/label text)
    'count','total','number','amount','quantity','sum','average','mean','median',
    'percentage','percent','rate','ratio','value','level','degree','extent',
    'range','limit','maximum','minimum','min','max','threshold','target',
    'present','absent','late','early','on-time','overtime','working','remaining',
    'remaining','left','balance','due','overdue','pending','completed','done',
    'active','inactive','enabled','disabled','available','unavailable','missing',
    // Common AI description words
    'verify','check','ensure','confirm','validate','test','assess','evaluate',
    'appear','appears','appearing','shown','displayed','shown','visible','seen',
    'correct','incorrect','proper','improper','accurate','inaccurate','match',
    'same','different','changed','updated','modified','added','removed','deleted',
  ]);

  const isLikelyRealElement = (text: string): boolean => {
    if (!text || text.length < 2 || text.length > 40) return false;
    const t = text.toLowerCase().trim();
    // FIRST: accept if matches a known real element from hierarchy (bypass all other checks)
    if (realElementNames.has(t)) return true;
    // Accept partial match: any real element contains this text
    if ([...realElementNames].some(e => e.toLowerCase() === t)) return true;
    // For strings that DON'T match real elements, apply strict filtering
    const words = t.split(/\s+/);
    if (words.length > 2) return false;
    // Reject phrases starting with grammar words
    if (/^(the\s|a\s|an\s|on\s|in\s|at\s|to\s|for\s|from\s|with\s|about\s|of\s|is\s|are\s|was\s|has\s|have\s|not\s|no\s|still\s|all\s|any\s|this\s|that\s|its\s|each\s|every\s|both\s|few\s|more\s|most\s|other\s|some\s|such\s|only\s|own\s|same\s|so\s|than\s|too\s|very\s|just\s|also\s|now\s)/i.test(t)) return false;
    // Reject if any word is banned
    if (words.some(w => BANNED_WORDS.has(w))) return false;
    // Reject -ing verbs (descriptions of actions)
    if (/\w+ing\b/i.test(t)) return false;
    // Accept short labels: 1-2 words, looks like button/tab name
    if (words.length <= 2 && /^[a-z0-9\s&\-+/#.]+$/i.test(t)) return true;
    return false;
  };

  for (const step of testSteps) {
    const desc = step.description.toLowerCase();
    const expected = step.expected?.toLowerCase() || '';

    // Navigation steps: "navigate to X", "go to X", "tap X", "select X"
    const navMatch = desc.match(/(?:navigate|go|tap|press|select|choose|click)\s+(?:to\s+|on\s+)?["']?([^"']+)["']?/i);
    if (navMatch) {
      let target = navMatch[1].trim();
      // If description contains a quoted value, try to find matching real element
      const quotedMatch = desc.match(/["']([^"']{1,60})["']/);
      if (quotedMatch) {
        const quoted = quotedMatch[1];
        // Exact match in real elements
        if (isLikelyRealElement(quoted)) {
          target = quoted;
        } else {
          // Partial match: find real element that contains the quoted value
          const partialMatch = [...realElementNames].find(e =>
            e.toLowerCase().includes(quoted.toLowerCase())
          );
          if (partialMatch) target = partialMatch;
        }
      }
      // Skip if it's a skip pattern
      if (skipPatterns.some(p => target.toLowerCase().includes(p))) continue;
      if (!isLikelyRealElement(target)) continue;

      steps.push(`# ${step.description}`);
      steps.push(`- tapOn: "${escapeText(target)}"`);
      steps.push('- waitForAnimationToEnd');

      // Only assert on real UI element text
      if (step.expected && isLikelyRealElement(step.expected)) {
        steps.push(`- assertVisible: "${escapeText(step.expected)}"`);
      }
      continue;
    }

    // Input steps: "enter X", "type X", "input X", "fill X with Y"
    // IMPORTANT: extract the QUOTED value, not the field name before it
    // e.g. "enter email 'tono@vendor.com' in email field" → value = "tono@vendor.com"
    const inputMatch = desc.match(/(?:enter|type|input|fill).*?(?:"([^"]+)"|'([^']+)')/i);
    if (inputMatch) {
      const value = inputMatch[1] || inputMatch[2];
      steps.push(`# ${step.description}`);
      steps.push(`- inputText: "${escapeText(value)}"`);
      continue;
    }

    // Verification steps: "verify", "check", "assert", "ensure", "confirm"
    const verifyMatch = desc.match(/(?:verify|check|assert|ensure|confirm|should)\s+(.+)$/i);
    if (verifyMatch) {
      const target = verifyMatch[1].trim();
      // Only use quoted text or short concrete element names
      const quoteMatch = target.match(/["']([^"']{2,60})["']/);
      const assertText = quoteMatch ? quoteMatch[1] : '';

      steps.push(`# ${step.description}`);
      if (assertText && isLikelyRealElement(assertText)) {
        steps.push(`- assertVisible: "${escapeText(assertText)}"`);
      } else if (!assertText && isLikelyRealElement(target.split(/\s+/).slice(-2).join(' '))) {
        // Try last 2 words as fallback
        steps.push(`- assertVisible: "${escapeText(target.split(/\s+/).slice(-2).join(' '))}"`);
      }
      continue;
    }

    // Search steps: "search for X"
    const searchMatch = desc.match(/search\s+(?:for\s+)?["']?([^"']+)["']?/i);
    if (searchMatch) {
      const query = searchMatch[1].trim();
      steps.push(`# ${step.description}`);
      steps.push('- tapOn: "Search"');
      steps.push('- waitForAnimationToEnd');
      steps.push(`- inputText: "${escapeText(query)}"`);
      steps.push('- pressKey: Enter');
      steps.push('- waitForAnimationToEnd');
      continue;
    }

    // Generic step: just tap/wait
    const genericMatch = desc.match(/["']([^"']{2,50})["']/);
    if (genericMatch) {
      const target = genericMatch[1];
      if (!skipPatterns.some(p => target.toLowerCase().includes(p)) && isLikelyRealElement(target)) {
        steps.push(`# ${step.description}`);
        steps.push(`- tapOn: "${escapeText(target)}"`);
        steps.push('- waitForAnimationToEnd');
      }
    } else {
      // Last resort: add as comment + generic wait
      steps.push(`# TODO: ${step.description}`);
      steps.push('- waitForAnimationToEnd');
    }
  }

  // Only return flow if it has more than just launch + login
  const meaningfulSteps = steps.filter(s =>
    !s.startsWith('appId:') && !s.startsWith('---') &&
    !s.startsWith('- launchApp') && !s.startsWith('#') &&
    !s.startsWith('- waitForAnimationToEnd')
  );

  if (meaningfulSteps.length < 2) return null;

  return {
    name: testCase.title.replace(/[^a-zA-Z0-9_ ]/g, '').replace(/\s+/g, '_').slice(0, 50),
    yaml: injectScreenshots(steps.join('\n')),
  };
}

// ─── Expand flow coverage to match test case count ──────────────────────────

function expandFlowCoverage(
  appId: string,
  screens: DiscoveredScreen[] | undefined,
  existingFlows: { name: string; yaml: string }[],
  credentials?: Record<string, string>,
  hierarchySummary?: string,
): { name: string; yaml: string }[] {
  const flows = [...existingFlows];
  const skipPatterns = ['back', 'cancel', 'close', '×', 'exit', 'logout', 'sign out', 'hapus', 'delete'];
  const escapeText = (s: string) => s.replace(/"/g, '\\"');

  const descriptiveWords = [
    'ringkasan','summary','total','jumlah','bulan','month','hari','day','minggu',
    'week','tahun','year','toleransi','tolerance','sisa','remaining','lembur',
    'overtime','hadir','present','absen','absent','terlambat','late','waktu',
    'time','tanggal','date','jam','hour','menit','minute','detik','second',
    'status','keterangan','description','catatan','note','informasi','data',
    'laporan','report','daftar','list','semua','all','tidak ada','no','belum',
    'not yet','sudah','already','aktif','active','nonaktif','inactive',
  ];

  const isActionable = (el: FlowElement) => {
    if (el.type !== 'button' && el.type !== 'nav') return false;
    const t = el.text.toLowerCase().trim();
    if (t.length > 25) return false;
    if (t.split(/\s+/).length > 3) return false;
    if (descriptiveWords.some(w => t.includes(w))) return false;
    return !skipPatterns.some(p => t.includes(p));
  };

  const buildLoginSteps = (): string[] => {
    if (!credentials || Object.keys(credentials).length === 0) return [];
    const [user, pass] = Object.values(credentials);
    return [
      '- tapOn: "Email"',
      `- inputText: "${user}"`,
      '- tapOn: "Password"',
      `- inputText: "${pass}"`,
      '- tapOn: "Masuk"',
      '- waitForAnimationToEnd',
    ];
  };

  // Strategy 1: Generate per-screen interaction flows from discovered screens
  if (screens && screens.length > 1) {
    const homeScreen = screens.find(s => s.name === 'Home') || screens[0];
    const childScreens = screens.filter(s => s.depth >= 1 && s.name !== 'Home');

    for (const screen of childScreens) {
      if (flows.length >= 12) break;

      const navBtn = homeScreen.elements.find(e =>
        e.text === screen.tapTarget || e.text.includes(screen.tapTarget)
      );
      if (!navBtn || !isActionable(navBtn)) continue;

      const steps: string[] = [`appId: ${appId}`, '---', '- launchApp', '- waitForAnimationToEnd'];
      const loginSteps = buildLoginSteps();
      if (loginSteps.length > 0) steps.push(...loginSteps);

      const safeNav = escapeText(navBtn.text);
      steps.push(`# Navigate to ${screen.name}`);
      steps.push(`- tapOn: "${safeNav}"`);
      steps.push('- waitForAnimationToEnd');

      // Interact with all actionable elements on this screen
      const actions = screen.elements.filter(isActionable).slice(0, 5);
      let actionIdx = 0;
      for (const action of actions) {
        const safeAction = escapeText(action.text);
        steps.push(`# Interact: ${action.text}`);
        steps.push(`- tapOn: "${safeAction}"`);
        steps.push('- waitForAnimationToEnd');

        // Verify a non-actionable element is still visible
        const verifyEl = screen.elements.find(e =>
          e.type === 'text' && e.text !== action.text && actionIdx < 3
        );
        if (verifyEl) {
          steps.push(`- assertVisible: "${escapeText(verifyEl.text)}"`);
        }
        actionIdx++;
      }

      const safeName = screen.name.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40);
      flows.push({ name: `screen_${safeName}`, yaml: injectScreenshots(steps.join('\n')) });
    }
  }

  // Strategy 2: If still not enough, generate element-level test flows
  if (flows.length < 10 && screens && screens.length > 0) {
    const allElements = screens.flatMap(s =>
      s.elements.filter(e => e.type === 'button' || e.type === 'nav').slice(0, 3)
    );

    for (const element of allElements.slice(0, 6)) {
      if (flows.length >= 12) break;
      if (skipPatterns.some(p => element.text.toLowerCase().includes(p))) continue;

      const steps: string[] = [`appId: ${appId}`, '---', '- launchApp', '- waitForAnimationToEnd'];
      const loginSteps = buildLoginSteps();
      if (loginSteps.length > 0) steps.push(...loginSteps);

      const safeText = escapeText(element.text);
      steps.push(`- tapOn: "${safeText}"`);
      steps.push('- waitForAnimationToEnd');
      steps.push(`- assertVisible: "${safeText}"`);
      steps.push('- scroll');
      steps.push('- waitForAnimationToEnd');

      flows.push({ name: `element_${element.text.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 30)}`, yaml: injectScreenshots(steps.join('\n')) });
    }
  }

  // Strategy 3: Last resort - split hierarchy into section-based flows
  if (flows.length < 10 && hierarchySummary) {
    const sections = hierarchySummary.split(/=== Screen:|"===/g).filter(s => s.trim().length > 100);
    for (const section of sections.slice(0, 4)) {
      if (flows.length >= 12) break;

      const sectionElements = extractElementsFromHierarchy(section);
      if (sectionElements.length === 0) continue;

      const steps: string[] = [`appId: ${appId}`, '---', '- launchApp', '- waitForAnimationToEnd'];
      const loginSteps = buildLoginSteps();
      if (loginSteps.length > 0) steps.push(...loginSteps);

      for (const el of sectionElements.slice(0, 5)) {
        if (el.type === 'button' || el.type === 'nav') {
          steps.push(`- tapOn: "${escapeText(el.text)}"`);
          steps.push('- waitForAnimationToEnd');
        }
        steps.push(`- assertVisible: "${escapeText(el.text)}"`);
      }

      const sectionName = section.slice(0, 30).replace(/[^a-zA-Z0-9_]/g, '_');
      flows.push({ name: `section_${sectionName}`, yaml: injectScreenshots(steps.join('\n')) });
    }
  }

  console.log(`[expandFlowCoverage] Expanded from ${existingFlows.length} to ${flows.length} flows`);
  return flows;
}

// ─── AI test case + flow generation ──────────────────────────────────────────

export interface CrawlGeneratedResult {
  testCases: {
    title: string;
    description: string;
    steps: { order: number; description: string; expected: string }[];
    expectedResult: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    tags: string[];
  }[];
  maestroFlows: {
    name: string;
    yaml: string;
  }[];
}

export async function generateFromHierarchy(
  projectId: string,
  appId: string,
  hierarchySummary: string,
  credentials?: Record<string, string>,
  framework: 'native' | 'flutter' | 'auto' = 'auto',
  screens?: DiscoveredScreen[],
  loginFields?: { name: string; placeholder: string; type: string; tapTarget?: string }[],
  submitText?: string,
): Promise<CrawlGeneratedResult> {
  if (!process.env.ZAI_API_KEY) throw new Error('ZAI_API_KEY not set');

  // Build structured screen map for AI context
  const screenMap = screens && screens.length > 0
    ? `\n\nDISCOVERED SCREEN MAP (app structure we crawled):\n${screens.map(s =>
        `- "${s.name}" (depth: ${s.depth}, reached via: "${s.tapTarget}") — Elements: ${s.elements.slice(0, 8).map(e => `"${e.text}"(${e.type})`).join(', ')}${s.elements.length > 8 ? '...' : ''}`
      ).join('\n')}\n\nScreen navigation paths:\n${screens.filter(s => s.depth >= 1).map(s =>
        `  Home → "${s.tapTarget}" → "${s.name}"${s.depth >= 2 ? ` → sub-elements: ${s.elements.filter(e => e.type === 'button' || e.type === 'nav').slice(0, 4).map(e => `"${e.text}"`).join(', ')}` : ''}`
      ).join('\n')}`
    : '';

  // Extract real element texts/hints from hierarchy for AI context
  const realTexts: string[] = [];
  for (const m of hierarchySummary.matchAll(/text="([^"]{1,60})"/g)) realTexts.push(m[1]);
  for (const m of hierarchySummary.matchAll(/hint="([^"]{1,60})"/g)) realTexts.push(m[1]);
  const uniqueTexts = [...new Set(realTexts)].filter(t => t.trim().length > 1).slice(0, 60);
  const elementList = uniqueTexts.length > 0
    ? `\nAvailable UI elements:\n${uniqueTexts.map(t => `  - "${t}"`).join('\n')}`
    : '';

  const credentialsNote = credentials && Object.keys(credentials).length > 0
    ? `\nIf any flow requires login, use EXACTLY these credentials:\n${Object.entries(credentials).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`
    : '';

  const systemPrompt = `You are a senior QA automation engineer. Given a mobile app UI hierarchy covering multiple screens, generate EXACTLY this JSON structure with no extra text:
{
  "testCases": [
    {
      "title": "string",
      "description": "string",
      "steps": [{"order": 1, "description": "string", "expected": "string"}],
      "expectedResult": "string",
      "priority": "low|medium|high|critical",
      "tags": ["string"]
    }
  ]
}

CRITICAL RULES — Generate COMPREHENSIVE E2E workflows:

1. **Generate 10-15 test cases** (not 5) covering ALL screens and paths in the DISCOVERED SCREEN MAP
2. **Each test case MUST have 5-8 steps** (minimum 5, maximum 8)
3. **Steps must span multiple screens**: Navigation → Action → Verification → Further navigation → Final verification
4. **Use the DISCOVERED SCREEN MAP** — every test case must follow real navigation paths like "Home → [screen name] → [action]"
5. **Include these E2E patterns**:
   - **Full CRUD**: Create → List → View Detail → Edit → Delete → Verify removal
   - **Multi-tab flows**: Home → Tab A → Action → Tab B → Verify sync → Tab C → Check
   - **Form workflows**: Navigate → Fill fields → Submit → Verify → Navigate to detail → Verify data
   - **Settings/Config**: Home → Settings → Change option → Navigate away → Return → Verify persistence
   - **Search/Filter**: Navigate → Search input → Enter query → Verify results → Clear → Reset
   - **Navigation depth**: Home → Level 1 screen → Level 2 sub-screen → Action → Verify → Back → Back

6. **Each step MUST describe screen transitions**: "Navigate to X screen", "Tap Y to go to Z", "Verify W screen appears"
7. **Use ONLY real element names** from Available UI elements list and DISCOVERED SCREEN MAP
8. **Mix of priorities**: 4 critical, 4 high, 3 medium, 2 low
9. **Include both positive and negative**: 7 happy path + 3 error/edge case flows

Output ONLY the JSON object, no extra text or markdown. Use COMPACT JSON (no unnecessary whitespace).${screenMap}${elementList}${credentialsNote}`;

  // Note: Maestro flows are now auto-expanded to match test case count in post-processing

  const response = await fetch('https://api.z.ai/api/coding/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ZAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'glm-4.5-air',
      temperature: 0.2,
      max_tokens: 40000,  // Increased to prevent reasoning consuming all tokens
      enable_thinking: false,  // Disable reasoning to get direct JSON output
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Project: ${projectId}\nApp: ${appId}\n\nUI screens:\n${hierarchySummary}\n\nGenerate JSON.` },
      ],
    }),
    signal: AbortSignal.timeout(600000),  // 10 minutes
  });

  if (!response.ok) {
    const t = await response.text();
    throw new Error(`Z.ai API error: ${response.status} - ${t}`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  console.log('[generateFromHierarchy] Raw Z.ai response:', JSON.stringify(data).slice(0, 1000));
  const content = data.choices?.[0]?.message?.content ?? '';
  console.log(`[generateFromHierarchy] Content length: ${content.length}, first 200 chars:`, content.slice(0, 200));
  if (!content) throw new Error('CRAWL_GENERATION_FAILED: No content');

  const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/);
  let jsonStr = jsonBlockMatch ? jsonBlockMatch[1].trim() : content.trim();

  const objStart = jsonStr.indexOf('{');
  // Find the LAST closing brace (in case JSON was truncated)
  let objEnd = jsonStr.lastIndexOf('}');
  if (objStart !== -1 && objEnd > objStart) jsonStr = jsonStr.slice(objStart, objEnd + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // If parse fails, try to fix truncated JSON by finding the last valid array closing
    const lastArrayClose = jsonStr.lastIndexOf(']');
    if (lastArrayClose > objStart) {
      jsonStr = jsonStr.slice(0, lastArrayClose + 1) + ']}';
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        throw new Error('CRAWL_GENERATION_FAILED: ' + content.slice(0, 300));
      }
    } else {
      throw new Error('CRAWL_GENERATION_FAILED: ' + content.slice(0, 300));
    }
  }

  const aiResult = parsed as { testCases?: CrawlGeneratedResult['testCases'] };
  if (!Array.isArray(aiResult?.testCases)) throw new Error('CRAWL_GENERATION_FAILED: Missing testCases');

  const validPriorities = ['low', 'medium', 'high', 'critical'];
  const testCases = aiResult.testCases.map(tc => ({
    ...tc,
    priority: validPriorities.includes(tc.priority) ? tc.priority : 'medium',
    steps: Array.isArray(tc.steps) ? tc.steps.slice(0, 8) : [],
    tags: Array.isArray(tc.tags) ? tc.tags : [],
  }));

  // ═══════════════════════════════════════════════════════════════════
  // Maestro flows: PRIMARY = real screen interactions from crawl
  // SECONDARY = AI test case conversion (only if screens data is thin)
  // ═══════════════════════════════════════════════════════════════════
  const detectedPlatformVal = framework === 'auto' ? detectFramework(hierarchySummary) : (framework === 'flutter' ? 'flutter' : 'native-android');
  let maestroFlows: { name: string; yaml: string }[] = [];

  // PRIMARY: Generate flows from actual discovered screens (real element names from hierarchy)
  if (screens && screens.length >= 2) {
    maestroFlows = generateE2EFlows(appId, screens, credentials);
    console.log(`[generateFromHierarchy] Generated ${maestroFlows.length} E2E flows from ${screens.length} real screens`);
  }

  // SECONDARY: If screen-based flows are thin, supplement with AI test case conversion
  // But ONLY for navigation/tap steps, skip unreliable assertions
  if (maestroFlows.length < 8 && testCases.length > 0) {
    console.log(`[generateFromHierarchy] Supplementing with AI test case conversions (${maestroFlows.length} existing, need more)`);
    for (const tc of testCases) {
      const flow = testCaseToMaestroFlow(appId, tc, credentials, loginFields, submitText, detectedPlatformVal, hierarchySummary);
      if (flow) {
        // Only add if name doesn't conflict
        if (!maestroFlows.some(f => f.name === flow.name)) {
          maestroFlows.push(flow);
        }
      }
      if (maestroFlows.length >= 15) break;
    }
    console.log(`[generateFromHierarchy] After supplementation: ${maestroFlows.length} flows`);
  }

  // FALLBACK: If still no screens, use deterministic generation
  if (maestroFlows.length === 0) {
    maestroFlows = generateDeterministicFlows(appId, hierarchySummary, credentials, framework);
    console.log(`[generateFromHierarchy] Fallback: ${maestroFlows.length} deterministic flows`);
  }

  return { testCases, maestroFlows };
}

// ─── Save flows to Mac ────────────────────────────────────────────────────────

export async function saveFlowsToMac(flows: { name: string; yaml: string }[], clearFirst = false): Promise<string[]> {
  if (clearFirst) {
    await sshExec(`rm -f ${FLOWS_DIR}/*.yaml 2>/dev/null; mkdir -p ${FLOWS_DIR}`, 15000);
  }
  const savedPaths: string[] = [];
  for (const flow of flows) {
    const safeName = flow.name.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 60);
    const remotePath = `${FLOWS_DIR}/${safeName}.yaml`;
    const escaped = flow.yaml.replace(/'/g, "'\\''");
    await sshExec(`mkdir -p ${FLOWS_DIR} && printf '%s' '${escaped}' > ${remotePath}`, 30000);
    savedPaths.push(remotePath);
  }
  return savedPaths;
}
