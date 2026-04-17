import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

const TRADE_COLORS: Record<string, string> = {
  'Sitework & Foundation':    '#92400E',
  'Structural & Framing':     '#D97706',
  'Rough-ins':                '#2563EB',
  'Pre-drywall Checkpoint':   '#EA580C',
  'Finishes':                 '#0891B2',
  'Mechanical Systems':       '#7C3AED',
  'Site Finishes & Closeout': '#059669',
}

type Entry = {
  id: number
  created_at: string
  category: string
  area: string
  unit?: string
  description: string
  ai_insight?: string
  logged_by?: string
}

export async function POST(req: NextRequest) {
  const { toEmail, note, entries, filterPhase, filterTrade, generatedBy } = await req.json()

  if (!toEmail || !Array.isArray(entries)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Email service not configured' }, { status: 500 })
  }

  const filtered: Entry[] = entries.filter((e: Entry) =>
    (!filterTrade || e.category === filterTrade) &&
    (!filterPhase || e.area === filterPhase)
  )

  if (!filtered.length) {
    return NextResponse.json({ error: 'No items match the current filters' }, { status: 400 })
  }

  const groups: Record<string, Entry[]> = {}
  filtered.forEach(e => {
    if (!groups[e.category]) groups[e.category] = []
    groups[e.category].push(e)
  })

  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const subject = `Build Playbook${filterPhase ? ` — ${filterPhase}` : ''} | Peak Condo Storage`

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;">

  <!-- Header -->
  <div style="background:#CC2222;border-radius:12px 12px 0 0;padding:28px 32px;">
    <div style="font-size:11px;letter-spacing:0.12em;color:rgba(255,255,255,0.6);margin-bottom:6px;text-transform:uppercase;">Peak Condo Storage</div>
    <div style="font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px;margin-bottom:4px;">Build Playbook</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.7);">Construction Knowledge Base${filterPhase ? ` · ${esc(filterPhase)}` : ''}</div>
  </div>

  <!-- Meta bar -->
  <div style="background:#fff;border-left:1px solid #e5e5e5;border-right:1px solid #e5e5e5;padding:16px 32px;display:flex;gap:12px;flex-wrap:wrap;border-bottom:1px solid #f0f0f0;">
    <span style="background:#f5f5f5;border-radius:6px;padding:4px 12px;font-size:12px;color:#444;"><b style="color:#1a1a1a;">${filtered.length}</b> improvement${filtered.length !== 1 ? 's' : ''}</span>
    ${filterTrade ? `<span style="background:#f5f5f5;border-radius:6px;padding:4px 12px;font-size:12px;color:#444;">Trade: <b style="color:#1a1a1a;">${esc(filterTrade)}</b></span>` : ''}
    ${filterPhase ? `<span style="background:#f5f5f5;border-radius:6px;padding:4px 12px;font-size:12px;color:#444;">Phase: <b style="color:#1a1a1a;">${esc(filterPhase)}</b></span>` : ''}
    <span style="background:#f5f5f5;border-radius:6px;padding:4px 12px;font-size:12px;color:#444;"><b style="color:#1a1a1a;">${Object.keys(groups).length}</b> trade${Object.keys(groups).length !== 1 ? 's' : ''}</span>
  </div>

  ${note ? `
  <!-- Personal note -->
  <div style="background:#fffbeb;border-left:1px solid #e5e5e5;border-right:1px solid #e5e5e5;padding:16px 32px;border-bottom:1px solid #f0f0f0;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#92400E;margin-bottom:6px;text-transform:uppercase;">Note from ${esc(generatedBy || 'Peak Condo Storage')}</div>
    <div style="font-size:13px;color:#444;line-height:1.6;">${esc(note)}</div>
  </div>` : ''}

  <!-- Content -->
  <div style="background:#fff;border-left:1px solid #e5e5e5;border-right:1px solid #e5e5e5;padding:24px 32px;">

  ${Object.entries(groups).map(([trade, items]) => `
    <!-- Trade: ${esc(trade)} -->
    <div style="margin-bottom:32px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #f0f0f0;">
        <div style="width:10px;height:10px;border-radius:50%;background:${TRADE_COLORS[trade] || '#6B7280'};flex-shrink:0;"></div>
        <span style="font-size:15px;font-weight:700;">${esc(trade)}</span>
        <span style="font-size:12px;color:#999;">${items.length} item${items.length !== 1 ? 's' : ''}</span>
      </div>

      ${items.map(e => `
      <div style="background:#fafafa;border:1px solid #e8e8e8;border-radius:10px;overflow:hidden;margin-bottom:12px;">
        <div style="padding:14px 16px;">
          ${e.unit ? `<div style="font-size:14px;font-weight:700;margin-bottom:6px;">${esc(e.unit)}</div>` : ''}
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
            <span style="background:#fff0f0;color:#CC2222;border-radius:99px;padding:2px 10px;font-size:11px;font-weight:700;">${esc(e.area)}</span>
            <span style="font-size:11px;color:#999;">${new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            ${e.logged_by ? `<span style="font-size:11px;color:#999;">· ${esc(e.logged_by)}</span>` : ''}
          </div>
          <div style="font-size:13px;color:#333;line-height:1.65;">${esc(e.description)}</div>
          ${e.ai_insight ? `
          <div style="background:#fff;border-left:3px solid #CC2222;border-radius:0 6px 6px 0;padding:8px 12px;margin-top:10px;">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;color:#999;margin-bottom:3px;text-transform:uppercase;">AI Spec Note</div>
            <div style="font-size:12px;color:#444;line-height:1.55;">${esc(e.ai_insight)}</div>
          </div>` : ''}
        </div>
      </div>`).join('')}
    </div>`).join('')}

  </div>

  <!-- Footer -->
  <div style="background:#f9f9f9;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px;padding:16px 32px;display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:11px;color:#aaa;">Peak Condo Storage · Build Playbook</span>
    <span style="font-size:11px;color:#aaa;">${esc(date)}${generatedBy ? ` · ${esc(generatedBy)}` : ''}</span>
  </div>

</div>
</body>
</html>`

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: 'Peak Condo Storage <onboarding@resend.dev>',
      to: toEmail,
      subject,
      html,
    })
    if (error) return NextResponse.json({ error: (error as { message?: string }).message || 'Send failed' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Send failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
