import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { issue } = await req.json()

  const prompt = `You are a construction quality control assistant for Peak Condo Storage, a 172-unit condo storage facility being built in Eagle, Idaho. Analyze this punch list item and give a concise, practical 1-2 sentence recommendation for the crew.

Issue:
- Area: ${issue.area}${issue.unit ? ', ' + issue.unit : ''}
- Trade: ${issue.category}
- Priority: ${issue.priority}
- Description: ${issue.description}

Respond with ONLY the recommendation. No preamble, no labels.`

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await resp.json()
  const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text || ''
  return NextResponse.json({ insight: text })
}
