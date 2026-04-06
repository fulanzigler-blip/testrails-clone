# Bug Fix: "fields is not defined" Error in Maestro Crawl & Generate

## Problem
The Maestro mobile automation test crawl & generate functionality was throwing a `ReferenceError: fields is not defined` error when processing login screens.

## Root Cause
The issue occurred in the `buildLoginFlow` function in `crawl-generator.ts` when:

1. The `loginFields` parameter (optional in the Zod schema) was `undefined`
2. The route handler was casting `undefined` to the expected array type
3. The `buildLoginFlow` function was receiving `undefined` instead of a valid array
4. When the function tried to access `fields.map()` or iterate over fields, it threw "fields is not defined"

### Call Chain
```
Route Handler (test-cases.ts:593)
  ↓ statefulCrawl with loginFields (could be undefined)
  ↓ buildLoginFlow with fields parameter (undefined)
  ↓ Error: Cannot access properties of undefined
```

## Solution
Implemented comprehensive null/undefined safety at multiple layers:

### 1. buildLoginFlow Function
- Changed parameter type to accept `undefined | null`
- Added `safeFields` variable that ensures a valid array
- Wrapped entire function body in try-catch for better error messages

### 2. statefulCrawl Function
- Added `safeLoginFields` validation before calling `buildLoginFlow`
- Added detailed logging to track field counts
- Added try-catch around `buildLoginFlow` call

### 3. Route Handler
- Added `safeLoginFields` validation before calling `statefulCrawl`
- Removed unsafe type cast that was masking undefined values

## Code Changes

### Before (Unsafe)
```typescript
function buildLoginFlow(
  appId: string,
  fields: { name: string; placeholder: string; type: string }[],  // Required array
  credentials: Record<string, string>,
  submitText?: string,
): string {
  const credEntries = Object.entries(credentials);
  credEntries.forEach(([fieldName, val], i) => {
    const field = fields.find(...) ?? fields[i];  // Throws if fields is undefined
    // ...
  });
}

// Route handler
const crawlResult = await statefulCrawl(
  appId,
  loginSummary,
  credentials,
  maxScreens,
  loginFields as { name: string; placeholder: string; type: string }[],  // Unsafe cast!
  submitText
);
```

### After (Safe)
```typescript
function buildLoginFlow(
  appId: string,
  fields: { name: string; placeholder: string; type: string }[] | undefined | null,  // Accepts undefined
  credentials: Record<string, string>,
  submitText?: string,
): string {
  try {
    const safeFields = Array.isArray(fields) && fields.length > 0 ? fields : [];
    credEntries.forEach(([fieldName, val], i) => {
      const field = safeFields.find(...) ?? safeFields[i];  // Always safe
      // ...
    });
  } catch (error) {
    console.error('[buildLoginFlow] Error:', error);
    throw new Error(`Failed to build login flow: ${error.message}`);
  }
}

// Route handler
const safeLoginFields = Array.isArray(loginFields) && loginFields.length > 0 ? loginFields : undefined;
const crawlResult = await statefulCrawl(
  appId,
  loginSummary,
  credentials,
  maxScreens,
  safeLoginFields,  // Validated before passing
  submitText
);
```

## Testing
Created comprehensive test suite covering:
- ✅ undefined fields
- ✅ null fields
- ✅ empty array fields
- ✅ valid fields with placeholders
- ✅ unreadable placeholders (falls back to field name)
- ✅ no readable fields (falls back to coordinates)
- ✅ credential-to-field mapping
- ✅ default submit button
- ✅ error handling

## Impact
- **Fixed**: "fields is not defined" error
- **Improved**: Better error messages with context
- **Added**: Comprehensive logging for debugging
- **Enhanced**: Type safety without unsafe casts

## Files Modified
1. `backend/src/services/crawl-generator.ts`
   - `buildLoginFlow()`: Added undefined/null handling and error catching
   - `statefulCrawl()`: Added validation and logging

2. `backend/src/routes/test-cases.ts`
   - `/crawl-generate` route: Added safeLoginFields validation

3. `backend/src/services/__tests__/crawl-generator.test.ts`
   - New test file with comprehensive coverage

## Prevention
To prevent similar issues:
1. Always validate optional parameters before use
2. Avoid unsafe type casts (`as`)
3. Add try-catch blocks around critical operations
4. Log parameter states for debugging
5. Write tests for edge cases (undefined, null, empty arrays)

## Related
- Issue: Maestro crawl & generate fails when login fields are not provided
- Schema: `crawlGenerateSchema` in `backend/src/types/schemas.ts`
- Affected endpoint: `POST /test-cases/crawl-generate`
