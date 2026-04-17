import { NextRequest, NextResponse } from 'next/server'

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

export async function POST(req: NextRequest) {
  const { entries, filterTrade, filterPhase, generatedBy } = await req.json()

  const TRADE_COLORS: Record<string, string> = {
    Framing: '#D97706', Electrical: '#2563EB', Plumbing: '#059669',
    HVAC: '#DB2777', 'Fire Sprinkler': '#DC2626', Drywall: '#7C3AED',
    Concrete: '#6B7280', Finishing: '#0891B2', Other: '#92400E',
  }

  const filtered = entries.filter((e: any) =>
    (!filterTrade || e.category === filterTrade) &&
    (!filterPhase || e.area === filterPhase)
  )

  const groups: Record<string, any[]> = {}
  filtered.forEach((e: any) => {
    if (!groups[e.category]) groups[e.category] = []
    groups[e.category].push(e)
  })

  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; background: #fff; font-size: 13px; line-height: 1.5; }
  .page { max-width: 800px; margin: 0 auto; padding: 48px 48px 64px; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 36px; padding-bottom: 24px; border-bottom: 2px solid #CC2222; }
  .header-left h1 { font-size: 22px; font-weight: 700; color: #1a1a1a; margin-bottom: 4px; }
  .header-left p { font-size: 12px; color: #666; }
  .header-right { text-align: right; font-size: 12px; color: #666; }
  .header-right .date { font-size: 13px; color: #1a1a1a; font-weight: 500; }
  .meta-row { display: flex; gap: 16px; margin-bottom: 32px; }
  .meta-chip { background: #f5f5f5; border-radius: 6px; padding: 6px 12px; font-size: 12px; color: #444; }
  .meta-chip span { font-weight: 600; color: #1a1a1a; }
  .trade-section { margin-bottom: 36px; }
  .trade-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid #e5e5e5; }
  .trade-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .trade-title { font-size: 15px; font-weight: 700; }
  .trade-count { font-size: 12px; color: #888; }
  .entry { background: #fafafa; border: 1px solid #e8e8e8; border-radius: 10px; overflow: hidden; margin-bottom: 14px; }
  .entry-photos { display: grid; gap: 2px; }
  .entry-photos img { width: 100%; object-fit: cover; display: block; }
  .entry-body { padding: 14px 16px; }
  .entry-title { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
  .entry-meta { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
  .phase-badge { background: #fff0f0; color: #CC2222; border-radius: 99px; padding: 2px 10px; font-size: 11px; font-weight: 600; }
  .entry-date { font-size: 11px; color: #888; }
  .entry-author { font-size: 11px; color: #888; }
  .entry-desc { font-size: 13px; color: #333; line-height: 1.6; margin-bottom: 0; }
  .ai-note { background: #fff; border-left: 3px solid #CC2222; border-radius: 0 6px 6px 0; padding: 8px 12px; margin-top: 10px; }
  .ai-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: #888; margin-bottom: 3px; text-transform: uppercase; }
  .ai-text { font-size: 12px; color: #444; line-height: 1.55; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 11px; color: #aaa; display: flex; justify-content: space-between; }
  @media print { .page { padding: 32px; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-left">
      <h1>Build Playbook</h1>
      <p>Peak Condo Storage — Construction Knowledge Base</p>
    </div>
    <div class="header-right">
      <div class="date">${date}</div>
      ${generatedBy ? `<div style="margin-top:4px">Prepared by ${esc(generatedBy)}</div>` : ''}
    </div>
  </div>

  <div class="meta-row">
    <div class="meta-chip">Total improvements: <span>${filtered.length}</span></div>
    ${filterTrade ? `<div class="meta-chip">Trade: <span>${esc(filterTrade)}</span></div>` : ''}
    ${filterPhase ? `<div class="meta-chip">Phase: <span>${esc(filterPhase)}</span></div>` : ''}
    <div class="meta-chip">Trades: <span>${Object.keys(groups).length}</span></div>
  </div>

  ${Object.entries(groups).map(([trade, items]) => `
  <div class="trade-section">
    <div class="trade-header">
      <div class="trade-dot" style="background: ${TRADE_COLORS[trade] || '#6B7280'}"></div>
      <div class="trade-title">${esc(trade)}</div>
      <div class="trade-count">${items.length} item${items.length !== 1 ? 's' : ''}</div>
    </div>
    ${(items as any[]).map(entry => `
    <div class="entry">
      ${entry.photos?.length > 0 ? `
      <div class="entry-photos" style="grid-template-columns: ${entry.photos.length === 1 ? '1fr' : entry.photos.length === 2 ? '1fr 1fr' : 'repeat(3,1fr)'}">
        ${entry.photos.map((p: string) => `<img src="${p}" style="max-height: ${entry.photos.length === 1 ? '280px' : '180px'}" />`).join('')}
      </div>` : ''}
      <div class="entry-body">
        ${entry.unit ? `<div class="entry-title">${esc(entry.unit)}</div>` : ''}
        <div class="entry-meta">
          <span class="phase-badge">${esc(entry.area)}</span>
          <span class="entry-date">${new Date(entry.created_at).toLocaleDateString()}</span>
          ${entry.logged_by ? `<span class="entry-author">· ${esc(entry.logged_by)}</span>` : ''}
        </div>
        <div class="entry-desc">${esc(entry.description)}</div>
        ${entry.ai_insight ? `
        <div class="ai-note">
          <div class="ai-label">AI Spec Note</div>
          <div class="ai-text">${esc(entry.ai_insight)}</div>
        </div>` : ''}
      </div>
    </div>`).join('')}
  </div>`).join('')}

  <div class="footer">
    <span>Peak Condo Storage — Build Playbook</span>
    <span>Generated ${date}</span>
  </div>
</div>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    }
  })
}
