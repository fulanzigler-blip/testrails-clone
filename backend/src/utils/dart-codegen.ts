import logger from './logger';
import type { AppContext } from './flutter-scanner';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CredentialRecord {
  email?: string;
  emailAddress?: string;
  username?: string;
  password?: string;
}

// ─── AI Code Generation ─────────────────────────────────────────────────────────

export async function generateDartCode(
  hierarchy: string,
  scenario: string,
  credentials?: Record<string, string>,
  appContext?: AppContext,
): Promise<string> {
  if (!process.env.ZAI_API_KEY) {
    throw new Error('ZAI_API_KEY environment variable is not set');
  }

  // Extract package name dynamically from main.dart
  // The app's own package is the one that matches the project directory name or the first import that's NOT a common Flutter package
  const allImports = appContext?.mainDart?.match(/import\s+'package:([^/]+)/g) || [];
  const appPkgs = allImports
    .map(m => m.match(/package:([^/]+)/)?.[1])
    .filter(Boolean)
    .filter(p => !['flutter', 'cupertino', 'material', 'go_router', 'flutter_riverpod', 'google_fonts', 'intl', 'provider'].includes(p));

  const packageName = appPkgs[0] || 'my_app';

  // Use discovered values or fallbacks
  const fieldType = appContext?.fieldTypes || 'TextField';
  const loginButtonText = appContext?.loginButton || 'Login';
  const hasOnFieldSubmitted = appContext?.authFlow?.includes('onFieldSubmitted') || false;

  // Build credential instruction
  let credInstruction = '';
  if (credentials && Object.keys(credentials).length > 0) {
    const email = credentials.email || credentials.emailAddress || credentials.username || '';
    const password = credentials.password || '';
    credInstruction = `USE THESE EXACT CREDENTIALS:
   Email: "${email}"
   Password: "${password}"
   You MUST use these EXACT string values. DO NOT use placeholders like 'email@example.com' or 'password123'.`;
  } else if (appContext?.hasMockData && appContext?.mockCredentials) {
    credInstruction = `The app has mock data. Use valid credentials that exist in the app:
${appContext.mockCredentials.substring(0, 400)}`;
  } else {
    credInstruction = 'The app uses authentication. Use valid credentials that match the app\'s user model.';
  }

  // Build route info
  const routeInfo = appContext?.routes
    ? `\n   App routes discovered: ${appContext.routes.substring(0, 200)}`
    : '';

  const systemPrompt = `You are a Flutter integration test expert. Generate a complete integration test for: ${scenario}

DISCOVERED APP CONTEXT (from the actual codebase):
+- Package name: ${packageName}
+- Form widget type: ${fieldType} (discovered from login screen code)
+- Login button text: "${loginButtonText}"
+- Auth trigger: ${hasOnFieldSubmitted ? 'onFieldSubmitted on password field' : 'Tap on login button'}${routeInfo}

IMPORTANT RULES:

1. REQUIRED imports:
   import 'package:flutter/material.dart';
   import 'package:flutter_test/flutter_test.dart';
   import 'package:integration_test/integration_test.dart';
   import 'package:${packageName}/main.dart' as app;

2. DO NOT use pumpWidget(app.main()) — it returns void. Use:
   void main() {
     IntegrationTestWidgetsFlutterBinding.ensureInitialized();
     testWidgets('Test description', (WidgetTester tester) async {
       app.main();
       await tester.pump(const Duration(seconds: 2));
       await tester.pumpAndSettle();
       // ... test steps
     });
   }

3. Use ${fieldType} for form inputs (discovered from app code):
   - find.byType(${fieldType}).first → first input field
   - find.byType(${fieldType}).last → last input field
   - find.text('Label') → to find text

4. KEYBOARD & LOGIN PATTERN:
${hasOnFieldSubmitted ? `   CRITICAL: The app's password field has onFieldSubmitted that triggers the login function.
   You MUST use this EXACT code sequence — DO NOT deviate:

     await tester.enterText(find.byType(${fieldType}).first, 'email');
     await tester.enterText(find.byType(${fieldType}).last, 'password');
     await tester.testTextInput.receiveAction(TextInputAction.done);
     await tester.pump(const Duration(seconds: 2));
     await tester.pumpAndSettle();

   RULES:
   - receiveAction(TextInputAction.done) BOTH closes the keyboard AND triggers the login
   - DO NOT call tap() on the login button after receiveAction
   - DO NOT use closeConnection() — use receiveAction instead
   - The login button will show a loading spinner after receiveAction, so tap() will fail` : `   Enter text then tap the login button:

     await tester.enterText(find.byType(${fieldType}).first, 'email');
     await tester.enterText(find.byType(${fieldType}).last, 'password');
     await tester.pumpAndSettle();
     await tester.tap(find.text('${loginButtonText}'));
     await tester.pump(const Duration(seconds: 2));
     await tester.pumpAndSettle();`}

5. VERIFICATION AFTER LOGIN:
   Safest — verify login screen is gone:
     expect(find.text('${loginButtonText}'), findsNothing);
     expect(find.byType(${fieldType}), findsNothing);

6. CREDENTIALS:
${credInstruction}

Output ONLY valid Dart code, no markdown, no explanation. Start with imports, end with test function.`;

  const body = {
    model: 'glm-4.5-air',
    temperature: 0.2,
    max_tokens: 8192,
    enable_thinking: false,
    messages: [
      { role: 'user', content: systemPrompt },
    ],
  };

  logger.info(`[DartCodegen] Calling Z.ai API for scenario: "${scenario}"`);

  const response = await fetch(
    'https://api.z.ai/api/coding/paas/v4/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ZAI_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`[DartCodegen] Z.ai API error: ${response.status} - ${errorText}`);
    throw new Error(
      `Z.ai API error: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  const data = await response.json() as { choices?: { message?: { content?: string } }[], error?: { message?: string } };
  const content: string = data.choices?.[0]?.message?.content ?? '';

  logger.info(`[DartCodegen] Z.ai response length: ${content.length}`);
  if (content.length < 10) {
    logger.error(`[DartCodegen] Z.ai returned empty/short content: ${JSON.stringify(data).slice(0, 500)}`);
  }

  if (!content) {
    throw new Error(`AI returned no content. API response: ${JSON.stringify(data).slice(0, 300)}`);
  }

  // Strip markdown code fences if present
  let cleaned = content
    .replace(/^```dart\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  return cleaned;
}
