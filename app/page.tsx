'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, type Issue } from '@/lib/supabase'

const CATEGORIES = ['Electrical', 'Plumbing', 'Framing', 'HVAC', 'Finishing', 'Other']
const PRIORITIES = ['Normal', 'High', 'Critical']
const STATUSES = ['Open', 'In progress', 'Done']

const CAT_COLORS: Record<string, string> = {
  Electrical: '#e8c84a', Plumbing: '#4a9e8a', Framing: '#e89a3a',
  HVAC: '#9a6ae8', Finishing: '#e86a6a', Other: '#6a8a9a'
}

const PRIORITY_STYLES: Record<string, { bg: string; color: string }> = {
  Normal: { bg: 'rgba(255,255,255,0.06)', color: '#8a8880' },
  High: { bg: 'rgba(232,154,58,0.15)', color: '#e89a3a' },
  Critical: { bg: 'rgba(224,90,74,0.15)', color: '#e05a4a' },
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  Open: { bg: 'rgba(232,200,74,0.12)', color: '#e8c84a' },
  'In progress': { bg: 'rgba(74,158,138,0.12)', color: '#4a9e8a' },
  Done: { bg: 'rgba(255,255,255,0.06)', color: '#8a8880' },
}

function Tag({ label, style }: { label: string; style: { bg: string; color: string } }) {
  return (
    <span style={{
      background: style.bg, color: style.color,
      padding: '3px 10px', borderRadius: 99, fontSize: 12,
      fontWeight: 500, letterSpacing: '0.02em', whiteSpace: 'nowrap'
    }}>{label}</span>
  )
}

export default function Home() {
  const [tab, setTab] = useState<'log' | 'list' | 'overview'>('log')
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [summary, setSummary] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [loggedBy, setLoggedBy] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('pcs_user') || '' : '')
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([])

  const [form, setForm] = useState({
    area: '', unit: '', category: '', priority: 'Normal', description: ''
  })

  const fetchIssues = useCallback(async () => {
    const { data } = await supabase.from('issues').select('*').order('created_at', { ascending: false })
    setIssues((data as Issue[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchIssues()
    const channel = supabase.channel('issues-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'issues' }, () => fetchIssues())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchIssues])

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    files.forEach(f => {
      const reader = new FileReader()
      reader.onload = ev => setPendingPhotos(p => [...p, ev.target!.result as string])
      reader.readAsDataURL(f)
    })
  }

  const handleSubmit = async () => {
    if (!form.area.trim() || !form.description.trim()) return
    setSubmitting(true)
    const newIssue = {
      area: form.area.trim(),
      unit: form.unit.trim() || null,
      category: form.category || 'Other',
      priority: form.priority,
      description: form.description.trim(),
      status: 'Open',
      photos: pendingPhotos,
      ai_insight: null,
      logged_by: loggedBy || null,
    }
    const { data } = await supabase.from('issues').insert(newIssue).select().single()
    setForm({ area: '', unit: '', category: '', priority: 'Normal', description: '' })
    setPendingPhotos([])
    setSubmitting(false)
    setTab('list')
    if (data) analyzeIssue(data as Issue)
  }

  const analyzeIssue = async (issue: Issue) => {
    try {
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue }),
      })
      const { insight } = await resp.json()
      await supabase.from('issues').update({ ai_insight: insight }).eq('id', issue.id)
      fetchIssues()
    } catch {}
  }

  const updateStatus = async (id: number, status: string) => {
    await supabase.from('issues').update({ status }).eq('id', id)
  }

  const deleteIssue = async (id: number) => {
    if (!confirm('Remove this issue?')) return
    await supabase.from('issues').delete().eq('id', id)
  }

  const generateSummary = async () => {
    if (!issues.length) return
    setSummaryLoading(true)
    try {
      const resp = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issues }),
      })
      const { summary: s } = await resp.json()
      setSummary(s)
    } catch { setSummary('Could not generate summary.') }
    setSummaryLoading(false)
  }

  const filtered = issues.filter(i =>
    (!filterStatus || i.status === filterStatus) &&
    (!filterCat || i.category === filterCat) &&
    (!filterPriority || i.priority === filterPriority)
  )

  const total = issues.length
  const open = issues.filter(i => i.status === 'Open').length
  const inprog = issues.filter(i => i.status === 'In progress').length
  const done = issues.filter(i => i.status === 'Done').length
  const critical = issues.filter(i => i.priority === 'Critical' && i.status !== 'Done').length

  const saveUser = (val: string) => {
    setLoggedBy(val)
    localStorage.setItem('pcs_user', val)
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px 64px' }}>
      {/* Header */}
      <div style={{ padding: '32px 0 24px', borderBottom: '1px solid var(--border)', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Peak Condo Storage · Eagle, ID</div>
            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', lineHeight: 1 }}>Construction tracker</h1>
            <div className="mono" style={{ fontSize: 12, color: 'var(--dim)', marginTop: 6 }}>172 units · {total} issues logged</div>
          </div>
          <input
            value={loggedBy}
            onChange={e => saveUser(e.target.value)}
            placeholder="Your name"
            style={{ width: 160, fontSize: 13, padding: '8px 12px' }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 28, background: 'var(--surface)', borderRadius: 8, padding: 4 }}>
        {(['log', 'list', 'overview'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '9px 16px', borderRadius: 6, border: 'none',
            background: tab === t ? 'var(--surface2)' : 'transparent',
            color: tab === t ? 'var(--text)' : 'var(--muted)',
            fontWeight: tab === t ? 600 : 400, fontSize: 14,
          }}>
            {t === 'log' ? 'Log issue' : t === 'list' ? `Punch list${total ? ` (${total})` : ''}` : 'Overview'}
          </button>
        ))}
      </div>

      {/* LOG TAB */}
      {tab === 'log' && (
        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 24, border: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 500 }}>Area / Zone *</label>
              <input value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} placeholder="e.g. Building A, Row 3" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 500 }}>Unit # (optional)</label>
              <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="e.g. Unit 47" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 500 }}>Trade</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">Select trade...</option>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 500 }}>Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 500 }}>Description *</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the issue, what was observed, or improvement needed..." />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 500 }}>Photos</label>
            <div
              onClick={() => fileRef.current?.click()}
              style={{ border: '1px dashed var(--border2)', borderRadius: 8, padding: '20px 16px', textAlign: 'center', cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }}
            >
              Tap to upload photos
              <input ref={fileRef} type="file" multiple accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />
            </div>
            {pendingPhotos.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {pendingPhotos.map((p, i) => (
                  <img key={i} src={p} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => { setForm({ area: '', unit: '', category: '', priority: 'Normal', description: '' }); setPendingPhotos([]) }}
              style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--muted)', fontSize: 14 }}>
              Clear
            </button>
            <button onClick={handleSubmit} disabled={submitting || !form.area || !form.description}
              style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#0f0f0e', fontSize: 14, fontWeight: 600, opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Logging...' : 'Log issue'}
            </button>
          </div>
        </div>
      )}

      {/* LIST TAB */}
      {tab === 'list' && (
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {[
              { id: 'filterStatus', val: filterStatus, set: setFilterStatus, opts: STATUSES, label: 'Status' },
              { id: 'filterCat', val: filterCat, set: setFilterCat, opts: CATEGORIES, label: 'Trade' },
              { id: 'filterPriority', val: filterPriority, set: setFilterPriority, opts: PRIORITIES, label: 'Priority' },
            ].map(f => (
              <select key={f.id} value={f.val} onChange={e => f.set(e.target.value)}
                style={{ width: 'auto', padding: '7px 12px', fontSize: 13 }}>
                <option value="">All {f.label}</option>
                {f.opts.map(o => <option key={o}>{o}</option>)}
              </select>
            ))}
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--dim)', fontSize: 14 }}>Loading...</div>
          ) : !filtered.length ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--dim)', fontSize: 14 }}>No issues yet. Log one to get started.</div>
          ) : filtered.map(issue => (
            <div key={issue.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 3 }}>
                    {issue.area}{issue.unit ? ` — ${issue.unit}` : ''}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--dim)' }}>{new Date(issue.created_at).toLocaleDateString()}</span>
                    {issue.logged_by && <span className="mono" style={{ fontSize: 11, color: 'var(--dim)' }}>· {issue.logged_by}</span>}
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: CAT_COLORS[issue.category] || '#888', display: 'inline-block' }} />
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{issue.category}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Tag label={issue.status} style={STATUS_STYLES[issue.status] || STATUS_STYLES.Open} />
                  {issue.priority !== 'Normal' && <Tag label={issue.priority} style={PRIORITY_STYLES[issue.priority]} />}
                </div>
              </div>
              <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 10 }}>{issue.description}</div>
              {issue.photos?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {issue.photos.map((p, i) => <img key={i} src={p} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />)}
                </div>
              )}
              {issue.ai_insight === null ? (
                <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: 'var(--dim)', fontStyle: 'italic', marginBottom: 10 }}>Analyzing...</div>
              ) : issue.ai_insight ? (
                <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, borderLeft: '2px solid var(--accent2)', marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>AI recommendation</div>
                  {issue.ai_insight}
                </div>
              ) : null}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select value={issue.status} onChange={e => updateStatus(issue.id, e.target.value)}
                  style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
                <button onClick={() => deleteIssue(issue.id)}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--dim)', fontSize: 12 }}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
            {[
              { label: 'Total', value: total },
              { label: 'Open', value: open, color: '#e8c84a' },
              { label: 'In progress', value: inprog, color: '#4a9e8a' },
              { label: 'Resolved', value: done, sub: total ? `${Math.round(done / total * 100)}%` : '—', color: '#8a8880' },
            ].map(m => (
              <div key={m.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{m.label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: m.color || 'var(--text)', lineHeight: 1 }}>{m.value}</div>
                {m.sub && <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 4 }}>{m.sub} complete</div>}
              </div>
            ))}
          </div>

          {critical > 0 && (
            <div style={{ background: 'rgba(224,90,74,0.08)', border: '1px solid rgba(224,90,74,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#e05a4a', fontSize: 16 }}>⚠</span>
              <span style={{ fontSize: 14, color: '#e05a4a' }}>{critical} critical issue{critical > 1 ? 's' : ''} still open</span>
            </div>
          )}

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>By trade</div>
            {CATEGORIES.map(cat => {
              const count = issues.filter(i => i.category === cat).length
              const pct = total ? count / total : 0
              return (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <span style={{ width: 80, fontSize: 13, color: 'var(--muted)', flexShrink: 0 }}>{cat}</span>
                  <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 99, height: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.round(pct * 100)}%`, height: '100%', background: CAT_COLORS[cat], borderRadius: 99, transition: 'width 0.4s' }} />
                  </div>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--dim)', width: 20, textAlign: 'right' }}>{count}</span>
                </div>
              )
            })}
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>AI project summary</div>
              <button onClick={generateSummary} disabled={summaryLoading || !issues.length}
                style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--muted)', fontSize: 12, opacity: summaryLoading ? 0.5 : 1 }}>
                {summaryLoading ? 'Analyzing...' : 'Refresh summary'}
              </button>
            </div>
            <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7 }}>
              {summary || 'Log some issues, then click "Refresh summary" for an AI overview of your project status.'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
