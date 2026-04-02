import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { issues } = await req.json()

  const list = issues.map((i: { status: string; category: string; area: string; unit?: string; priority: string; description: string }) =>
    `- [${i.status}] ${i.category} | ${i.area}${i.unit ? ' ' + i.unit : ''} | ${i.priority} priority: ${i.description}`
  ).join('\n')

  const prompt = `You are a construction PM assistant for Peak Condo Storage, a 172-unit condo storage facility in Eagle, Idaho. Based on the punch list below, write a concise 3-4 sentence project status summary. Cover: overall progress, biggest risk areas, and the single most important next action. Be direct and practical — this is for the owner, not a report.

Punch list:
${list}`

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await resp.json()
  const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text || ''
  return NextResponse.json({ summary: text })
}
