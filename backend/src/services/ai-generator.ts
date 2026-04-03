export interface GeneratedTestCase {
  title: string
  description: string
  steps: { order: number; description: string; expected: string }[]
  expectedResult: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  automationType: 'automated'
  tags: string[]
}

export async function generateTestCases(
  projectId: string,
  flutterCode: string
): Promise<GeneratedTestCase[]> {
  if (!process.env.ZAI_API_KEY) {
    throw new Error('ZAI_API_KEY environment variable is not set');
  }

  const systemPrompt =
    'You are a QA engineer. Given Flutter/Dart source code, generate comprehensive test cases as a JSON array. Each test case must include: title (string), description (string), steps (array of {order: number, description: string, expected: string}), expectedResult (string), priority (one of: low/medium/high/critical), automationType (always "automated"), tags (string array). Output ONLY valid JSON array, no markdown, no explanation.'

  // Escape backtick sequences that could break the code fence delimiter
  const sanitizedCode = flutterCode.replace(/```/g, "'''")
  const userMessage = `Project: ${projectId}\n\nFlutter code:\n\`\`\`dart\n${sanitizedCode}\n\`\`\`\n\nGenerate test cases as a JSON array.`

  const body = {
    model: 'glm-5.1',
    temperature: 0.2,
    max_tokens: 6000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ]
  }

  const response = await fetch(
    'https://api.z.ai/api/coding/paas/v4/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ZAI_API_KEY}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Z.ai API error: ${response.status} ${response.statusText} - ${errorText}`
    )
  }

  const data = await response.json() as { choices?: { message?: { content?: string } }[] }

  const content: string = data.choices?.[0]?.message?.content ?? ''
  if (!content) {
    throw new Error('GENERATION_FAILED: No content in response')
  }

  let parsed: unknown

  // Try to extract JSON from markdown code blocks
  const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)```/)
  if (jsonBlockMatch) {
    try {
      parsed = JSON.parse(jsonBlockMatch[1].trim())
    } catch {
      throw new Error('GENERATION_FAILED: ' + content.slice(0, 200))
    }
  } else {
    // Try direct JSON parse
    try {
      parsed = JSON.parse(content)
    } catch {
      throw new Error('GENERATION_FAILED: ' + content.slice(0, 200))
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error('GENERATION_FAILED: Response is not a JSON array')
  }

  return parsed as GeneratedTestCase[]
}
