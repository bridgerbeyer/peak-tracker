'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

const TRADES = ['Framing', 'Electrical', 'Plumbing', 'HVAC', 'Fire Sprinkler', 'Drywall', 'Concrete', 'Finishing', 'Other']
const PHASES = ['Phase 1', 'Phase 2', 'Phase 3']
const TRADE_COLORS: Record<string, string> = {
  Framing: '#D97706', Electrical: '#2563EB', Plumbing: '#059669',
  HVAC: '#DB2777', 'Fire Sprinkler': '#DC2626', Drywall: '#7C3AED',
  Concrete: '#6B7280', Finishing: '#0891B2', Other: '#92400E',
}

type Entry = { id: number; created_at: string; category: string; area: string; unit?: string; description: string; photos: string[]; ai_insight?: string; logged_by?: string }
type Plan = { id: number; created_at: string; name: string; phase: string; extracted_items: ExtractedItem[]; logged_by?: string }
type ExtractedItem = { trade: string; item: string; detail: string }
type Unit = { id: number; name: string; phase: string; status: string; purchase_price?: number; realtor_commission?: number }
type Task = { id: number; unit_id: number; completed: boolean }

export default function Home() {
  const [tab, setTab] = useState<'dashboard' | 'log' | 'library' | 'plans' | 'phaseplan'>('dashboard')
  const [entries, setEntries] = useState<Entry[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [userName, setUserName] = useState('')
  const [nameSet, setNameSet] = useState(false)

  const [trade, setTrade] = useState('')
  const [phase, setPhase] = useState('Phase 1')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const [filterTrade, setFilterTrade] = useState('')
  const [filterPhase, setFilterPhase] = useState('')

  const [planFile, setPlanFile] = useState<File | null>(null)
  const [planName, setPlanName] = useState('')
  const [planPhaseUpload, setPlanPhaseUpload] = useState('Phase 1')
  const [selectedTrades, setSelectedTrades] = useState<string[]>([])
  const [extractMode, setExtractMode] = useState<'all' | 'selected'>('all')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const planFileRef = useRef<HTMLInputElement>(null)

  const [planPhase, setPlanPhase] = useState('Phase 2')
  const [planTrade, setPlanTrade] = useState('')
  const [planOutput, setPlanOutput] = useState('')
  const [planLoading, setPlanLoading] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('pcs_username')
    if (saved) { setUserName(saved); setNameSet(true) }
    fetchAll()
  }, [])

  async function fetchAll() {
    const [e, p, u, t] = await Promise.all([
      supabase.from('issues').select('*').order('created_at', { ascending: false }),
      supabase.from('plans').select('*').order('created_at', { ascending: false }),
      supabase.from('units').select('id,name,phase,status,purchase_price,realtor_commission,buyer_name,close_date').order('name'),
      supabase.from('tasks').select('id,unit_id,completed'),
    ])
    if (e.data) setEntries(e.data as Entry[])
    if (p.data) setPlans(p.data as Plan[])
    if (u.data) setUnits(u.data as Unit[])
    if (t.data) setTasks(t.data as Task[])
    setLoading(false)
  }

  function handleSetName() {
    if (!userName.trim()) return
    localStorage.setItem('pcs_username', userName.trim())
    setNameSet(true)
  }

  function handlePhotos(e: React.ChangeEvent<HTMLInputElement>) {
    Array.from(e.target.files || []).forEach(f => {
      const r = new FileReader()
      r.onload = ev => setPhotos(prev => [...prev, ev.target?.result as string])
      r.readAsDataURL(f)
    })
  }

  async function getAIInsight(entry: Partial<Entry> & { phase?: string }): Promise<string> {
    try {
      const resp = await fetch('/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: entry.category, description: entry.description, phase: entry.phase })
      })
      const data = await resp.json()
      return data.insight || ''
    } catch { return '' }
  }

  async function submitEntry() {
    if (!trade || !description.trim()) return
    setSubmitting(true)
    const aiInsight = await getAIInsight({ category: trade, description, phase })
    await supabase.from('issues').insert({ category: trade, area: phase, unit: title.trim() || null, description: description.trim(), photos, status: 'Open', priority: 'Normal', logged_by: userName || null, ai_insight: aiInsight })
    setTrade(''); setPhase('Phase 1'); setDescription(''); setPhotos([]); setTitle('')
    if (fileRef.current) fileRef.current.value = ''
    setSubmitting(false)
    setTab('library')
  }

  async function uploadAndExtract() {
    if (!planFile) return
    setUploading(true)
    setUploadProgress('Reading PDF...')
    const tradesToExtract = extractMode === 'all' ? TRADES : selectedTrades
    if (!tradesToExtract.length) { setUploadProgress('Please select at least one trade.'); setUploading(false); return }
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = ev => res((ev.target?.result as string).split(',')[1])
        r.onerror = () => rej(new Error('Read failed'))
        r.readAsDataURL(planFile)
      })
      setUploadProgress('Claude is reading your plans...')
      const resp = await fetch('/api/extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, trades: tradesToExtract })
      })
      const data = await resp.json()
      const extracted: ExtractedItem[] = data.items || []
      setUploadProgress(`Saving ${extracted.length} items...`)
      await supabase.from('plans').insert({ name: planName || planFile.name, phase: planPhaseUpload, extracted_items: extracted, logged_by: userName || null })
      setPlanFile(null); setPlanName(''); setSelectedTrades([])
      if (planFileRef.current) planFileRef.current.value = ''
      setUploadProgress('')
      setTab('plans')
    } catch { setUploadProgress('Error processing plan. Try again.') }
    setUploading(false)
  }

  async function deletePlan(id: number) {
    if (!confirm('Remove this plan?')) return
    await supabase.from('plans').delete().eq('id', id)
    setPlans(prev => prev.filter(p => p.id !== id))
  }

  async function deleteEntry(id: number) {
    if (!confirm('Remove this entry?')) return
    await supabase.from('issues').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  async function generatePhasePlan() {
    const relevant = entries.filter(e => !planTrade || e.category === planTrade)
    const planItems = plans.flatMap(p => (p.extracted_items || []).filter(i => !planTrade || i.trade === planTrade))
    if (!relevant.length && !planItems.length) { setPlanOutput('No lessons or plan data found. Log some lessons or upload a plan first.'); return }
    setPlanLoading(true); setPlanOutput('')
    try {
      const resp = await fetch('/api/phaseplan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessons: relevant, planItems, phase: planPhase, trade: planTrade })
      })
      const data = await resp.json()
      setPlanOutput(data.plan || 'Could not generate.')
    } catch { setPlanOutput('Could not reach AI.') }
    setPlanLoading(false)
  }

  const filtered = entries.filter(e => (!filterTrade || e.category === filterTrade) && (!filterPhase || e.area === filterPhase))
  const tradeGroups = TRADES.reduce((acc, t) => { const items = filtered.filter(e => e.category === t); if (items.length) acc[t] = items; return acc }, {} as Record<string, Entry[]>)
  const allExtracted = plans.flatMap(p => (p.extracted_items || []).map(i => ({ ...i, planName: p.name, phase: p.phase })))
  const extractedByTrade = TRADES.reduce((acc, t) => { const items = allExtracted.filter(i => i.trade === t); if (items.length) acc[t] = items; return acc }, {} as Record<string, typeof allExtracted>)

  const S = {
    input: { width: '100%', border: '1px solid #E2DDD6', borderRadius: 8, padding: '9px 12px', fontSize: 14, background: '#fff', color: '#1A1814', fontFamily: 'DM Sans, sans-serif' } as React.CSSProperties,
    card: { background: '#fff', border: '1px solid #E2DDD6', borderRadius: 12, padding: '1.25rem' } as React.CSSProperties,
  }

  // Dashboard stats
  const fmt = (n: number) => n >= 1000000 ? `$${(n/1000000).toFixed(2)}M` : n >= 1000 ? `$${Math.round(n/1000)}K` : `$${Math.round(n).toLocaleString()}`
  const totalUnits = units.length
  const sold = units.filter(u => u.status === 'Sold').length
  const underContract = units.filter(u => u.status === 'Under Contract').length
  const available = units.filter(u => u.status === 'Available').length
  const totalTasks = tasks.length
  const completedTasks = tasks.filter(t => t.completed).length
  const constructionPct = totalTasks ? Math.round(completedTasks / totalTasks * 100) : 0

  const soldUnits = units.filter(u => u.status === 'Sold' && u.purchase_price)
  const contractUnits = units.filter(u => u.status === 'Under Contract' && u.purchase_price)
  const totalClosed = soldUnits.reduce((sum, u) => sum + (u.purchase_price || 0), 0)
  const totalPending = contractUnits.reduce((sum, u) => sum + (u.purchase_price || 0), 0)
  const avgTicket = soldUnits.length ? totalClosed / soldUnits.length : 0

  const phaseStats = PHASES.map(p => {
    const phaseUnits = units.filter(u => u.phase === p)
    const phaseTasks = tasks.filter(t => phaseUnits.some(u => u.id === t.unit_id))
    const phaseDone = phaseTasks.filter(t => t.completed).length
    return {
      phase: p,
      total: phaseUnits.length,
      sold: phaseUnits.filter(u => u.status === 'Sold').length,
      underContract: phaseUnits.filter(u => u.status === 'Under Contract').length,
      available: phaseUnits.filter(u => u.status === 'Available').length,
      taskPct: phaseTasks.length ? Math.round(phaseDone / phaseTasks.length * 100) : 0,
    }
  }).filter(p => p.total > 0)

  const recentLessons = entries.slice(0, 3)

  if (!nameSet) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: '#F5F3EE', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2DDD6', padding: '2.5rem', maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.1em', color: '#7A756E', marginBottom: 8 }}>PEAK CONDO STORAGE</div>
        <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Construction Knowledge Base</div>
        <div style={{ color: '#7A756E', fontSize: 14, marginBottom: 24 }}>Who is logging in?</div>
        <input value={userName} onChange={e => setUserName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSetName()} placeholder="Your name" style={{ ...S.input, marginBottom: 12, textAlign: 'center' }} autoFocus />
        <button onClick={handleSetName} style={{ width: '100%', padding: '10px', background: '#2B4D3F', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Enter</button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F5F3EE', fontFamily: 'DM Sans, sans-serif' }}>
      <header style={{ background: '#2B4D3F', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)' }}>PEAK CONDO STORAGE</span>
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>Construction Knowledge Base</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#fff' }}>{userName[0]?.toUpperCase()}</div>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{userName}</span>
            <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
              style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}>Sign out</button>
          </div>
        </div>
      </header>

      <div style={{ background: '#fff', borderBottom: '1px solid #E2DDD6' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', padding: '0 1.5rem' }}>
          <Link href="/units" style={{ padding: '14px 18px', border: 'none', background: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: '#7A756E', borderBottom: '2px solid transparent', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>Unit status</Link>
          {([
            { key: 'dashboard', label: 'Dashboard' },
            { key: 'log', label: 'Phase improvements' },
            { key: 'library', label: `Build playbook (${entries.length})` },
            { key: 'plans', label: `Plans (${plans.length})` },
            { key: 'phaseplan', label: 'Phase planner' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '14px 18px', border: 'none', background: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: tab === t.key ? '#2B4D3F' : '#7A756E', borderBottom: tab === t.key ? '2px solid #2B4D3F' : '2px solid transparent' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>

        {/* DASHBOARD */}
        {tab === 'dashboard' && (
          <div>
            {/* Top metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Total units', value: totalUnits, sub: 'across all phases' },
                { label: 'Sold', value: sold, sub: `${totalUnits ? Math.round(sold/totalUnits*100) : 0}% of total`, color: '#059669' },
                { label: 'Under contract', value: underContract, sub: `${totalUnits ? Math.round(underContract/totalUnits*100) : 0}% of total`, color: '#D97706' },
                { label: 'Available', value: available, sub: `${totalUnits ? Math.round(available/totalUnits*100) : 0}% of total`, color: '#2563EB' },
              ].map(m => (
                <div key={m.label} style={{ background: '#fff', border: '1px solid #E2DDD6', borderRadius: 12, padding: '1rem 1.25rem' }}>
                  <div style={{ fontSize: 12, color: '#7A756E', marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 600, color: m.color || '#1A1814', lineHeight: 1.1 }}>{m.value}</div>
                  <div style={{ fontSize: 11, color: '#7A756E', marginTop: 4 }}>{m.sub}</div>
                </div>
              ))}
            </div>

            {/* Sales dollar metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Total deals closed', value: totalClosed ? fmt(totalClosed) : '—', sub: `${soldUnits.length} unit${soldUnits.length !== 1 ? 's' : ''} sold`, color: '#059669' },
                { label: 'Pending deals', value: totalPending ? fmt(totalPending) : '—', sub: `${contractUnits.length} under contract`, color: '#D97706' },
                { label: 'Avg ticket price', value: avgTicket ? fmt(avgTicket) : '—', sub: 'per sold unit', color: '#2563EB' },
              ].map(m => (
                <div key={m.label} style={{ background: '#fff', border: '1px solid #E2DDD6', borderRadius: 12, padding: '1rem 1.25rem' }}>
                  <div style={{ fontSize: 12, color: '#7A756E', marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: m.color, lineHeight: 1.1 }}>{m.value}</div>
                  <div style={{ fontSize: 11, color: '#7A756E', marginTop: 4 }}>{m.sub}</div>
                </div>
              ))}
            </div>

            {/* Sales progress bar */}
            <div style={{ ...S.card, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Sales pipeline</div>
              <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', height: 28, marginBottom: 10 }}>
                {[
                  { label: 'Sold', count: sold, color: '#059669' },
                  { label: 'Under Contract', count: underContract, color: '#D97706' },
                  { label: 'Available', count: available, color: '#E2DDD6' },
                ].map(({ label, count, color }) => {
                  const pct = totalUnits ? count / totalUnits * 100 : 0
                  return pct > 0 ? (
                    <div key={label} style={{ width: `${pct}%`, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500, color: color === '#E2DDD6' ? '#7A756E' : '#fff', minWidth: pct > 8 ? 'auto' : 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {pct > 8 ? `${label} ${count}` : ''}
                    </div>
                  ) : null
                })}
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                {[{ label: 'Sold', color: '#059669' }, { label: 'Under Contract', color: '#D97706' }, { label: 'Available', color: '#E2DDD6', textColor: '#7A756E' }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#7A756E' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {/* Construction progress */}
              <div style={S.card}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Construction progress</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: '#2B4D3F', marginBottom: 4 }}>{constructionPct}%</div>
                <div style={{ fontSize: 12, color: '#7A756E', marginBottom: 12 }}>{completedTasks} of {totalTasks} tasks complete across all units</div>
                <div style={{ background: '#F5F3EE', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${constructionPct}%`, height: '100%', borderRadius: 99, background: constructionPct === 100 ? '#059669' : '#2B4D3F', transition: 'width 0.4s' }} />
                </div>
              </div>

              {/* Knowledge base */}
              <div style={S.card}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Knowledge base</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Lessons logged', value: entries.length, action: () => setTab('log') },
                    { label: 'Plans uploaded', value: plans.length, action: () => setTab('plans') },
                    { label: 'Trades covered', value: Object.keys(tradeGroups).length, action: () => setTab('library') },
                    { label: 'Spec items', value: allExtracted.length, action: () => setTab('plans') },
                  ].map(m => (
                    <div key={m.label} onClick={m.action} style={{ background: '#F5F3EE', borderRadius: 8, padding: '10px 12px', cursor: 'pointer' }}>
                      <div style={{ fontSize: 20, fontWeight: 600, color: '#2B4D3F' }}>{m.value}</div>
                      <div style={{ fontSize: 11, color: '#7A756E', marginTop: 2 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Phase breakdown */}
            <div style={{ ...S.card, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>Phase breakdown</div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${phaseStats.length}, 1fr)`, gap: 12 }}>
                {phaseStats.map(p => (
                  <div key={p.phase} style={{ border: '1px solid #E2DDD6', borderRadius: 10, padding: '14px' }}>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.08em', color: '#7A756E', marginBottom: 10 }}>{p.phase.toUpperCase()}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      {[
                        { label: 'Total units', value: p.total },
                        { label: 'Sold', value: p.sold, color: '#059669' },
                        { label: 'Under contract', value: p.underContract, color: '#D97706' },
                        { label: 'Available', value: p.available, color: '#2563EB' },
                      ].map(row => (
                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ color: '#7A756E' }}>{row.label}</span>
                          <span style={{ fontWeight: 500, color: row.color || '#1A1814' }}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: '#7A756E', marginBottom: 4 }}>Construction {p.taskPct}%</div>
                    <div style={{ background: '#F5F3EE', borderRadius: 99, height: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${p.taskPct}%`, height: '100%', borderRadius: 99, background: '#2B4D3F' }} />
                    </div>
                  </div>
                ))}
                {phaseStats.length === 0 && (
                  <div style={{ color: '#7A756E', fontSize: 13, gridColumn: '1/-1' }}>No unit data yet. <Link href="/units" style={{ color: '#2B4D3F' }}>Go to Unit Status →</Link></div>
                )}
              </div>
            </div>

            {/* Recent lessons */}
            {recentLessons.length > 0 && (
              <div style={S.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Recent lessons</div>
                  <button onClick={() => setTab('library')} style={{ fontSize: 12, color: '#2B4D3F', background: 'none', border: 'none', cursor: 'pointer' }}>View all →</button>
                </div>
                {recentLessons.map(e => (
                  <div key={e.id} style={{ padding: '10px 0', borderBottom: '1px solid #F5F3EE', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: TRADE_COLORS[e.category] || '#6B7280', flexShrink: 0, marginTop: 5 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1814' }}>{e.unit || e.category}</div>
                      <div style={{ fontSize: 12, color: '#7A756E', marginTop: 1 }}>{e.description.slice(0, 100)}{e.description.length > 100 ? '...' : ''}</div>
                    </div>
                    <span style={{ fontSize: 11, color: '#7A756E', flexShrink: 0, marginLeft: 'auto' }}>{e.area}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Quick actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <Link href="/units" style={{ flex: 1, display: 'block', background: '#2B4D3F', color: '#fff', borderRadius: 10, padding: '14px', textAlign: 'center', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Go to Unit Status</Link>
              <button onClick={() => setTab('log')} style={{ flex: 1, background: '#fff', border: '1px solid #E2DDD6', borderRadius: 10, padding: '14px', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: '#1A1814' }}>Phase improvements</button>
              <button onClick={() => setTab('phaseplan')} style={{ flex: 1, background: '#fff', border: '1px solid #E2DDD6', borderRadius: 10, padding: '14px', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: '#1A1814' }}>Generate spec sheet</button>
            </div>
          </div>
        )}

        {/* LOG LESSON */}
        {tab === 'log' && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2DDD6', padding: '1.5rem' }}>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Phase improvements</div>
            <div style={{ fontSize: 13, color: '#7A756E', marginBottom: 20 }}>Document what to do differently — builds your playbook for future phases.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 5 }}>Trade *</label>
                <select value={trade} onChange={e => setTrade(e.target.value)} style={S.input}><option value="">Select trade...</option>{TRADES.map(t => <option key={t}>{t}</option>)}</select></div>
              <div><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 5 }}>Phase</label>
                <select value={phase} onChange={e => setPhase(e.target.value)} style={S.input}>{PHASES.map(p => <option key={p}>{p}</option>)}</select></div>
            </div>
            <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 5 }}>Short title (optional)</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Corner backing for drywall" style={S.input} /></div>
            <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 5 }}>Related unit (optional)</label>
              <select value={title.startsWith('Unit:') ? title.replace('Unit:','').trim() : ''} onChange={e => e.target.value ? setTitle('Unit:' + e.target.value) : setTitle('')} style={S.input}>
                <option value="">No specific unit</option>
                {units.map(u => <option key={u.id} value={u.name}>{u.name} — {u.phase}</option>)}
              </select>
              <div style={{ fontSize: 11, color: '#7A756E', marginTop: 4 }}>Link this improvement to a specific unit to avoid repeat notes.</div>
            </div>
            <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 5 }}>Description *</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What would you do differently? What should be specified for future phases?" style={{ ...S.input, minHeight: 100, resize: 'vertical' }} /></div>
            <div style={{ marginBottom: 20 }}><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 5 }}>Photos</label>
              <div onClick={() => fileRef.current?.click()} style={{ border: '1px dashed #C4BFB8', borderRadius: 8, padding: '1rem', textAlign: 'center', cursor: 'pointer', fontSize: 13, color: '#7A756E' }}>Tap to add photos<input ref={fileRef} type="file" multiple accept="image/*" onChange={handlePhotos} style={{ display: 'none' }} /></div>
              {photos.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>{photos.map((p, i) => <div key={i} style={{ position: 'relative' }}><img src={p} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid #E2DDD6' }} /><button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#991B1B', color: '#fff', border: 'none', fontSize: 10, cursor: 'pointer' }}>x</button></div>)}</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setTrade(''); setPhase('Phase 1'); setDescription(''); setPhotos([]); setTitle('') }} style={{ padding: '9px 18px', border: '1px solid #E2DDD6', borderRadius: 8, background: 'transparent', fontSize: 14, color: '#7A756E', cursor: 'pointer' }}>Clear</button>
              <button onClick={submitEntry} disabled={submitting || !trade || !description.trim()} style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: '#2B4D3F', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', opacity: (!trade || !description.trim()) ? 0.5 : 1 }}>
                {submitting ? 'Saving...' : 'Save improvement'}</button>
            </div>
          </div>
        )}

        {/* PLANS */}
        {tab === 'plans' && (
          <div>
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2DDD6', padding: '1.5rem', marginBottom: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Upload blueprint</div>
              <div style={{ fontSize: 13, color: '#7A756E', marginBottom: 16 }}>Claude will read your PDF and extract trade-specific line items automatically.</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 5 }}>Plan name</label><input value={planName} onChange={e => setPlanName(e.target.value)} placeholder="e.g. Electrical Phase 1" style={S.input} /></div>
                <div><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 5 }}>Phase</label><select value={planPhaseUpload} onChange={e => setPlanPhaseUpload(e.target.value)} style={S.input}>{PHASES.map(p => <option key={p}>{p}</option>)}</select></div>
              </div>
              <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 5 }}>PDF file</label>
                <div onClick={() => planFileRef.current?.click()} style={{ border: '1px dashed #C4BFB8', borderRadius: 8, padding: '1rem', textAlign: 'center', cursor: 'pointer', fontSize: 13, color: planFile ? '#2B4D3F' : '#7A756E', background: planFile ? '#E8F0EC' : 'transparent' }}>
                  {planFile ? planFile.name : 'Tap to select PDF blueprint'}
                  <input ref={planFileRef} type="file" accept="application/pdf" onChange={e => { const f = e.target.files?.[0]; if (f) { setPlanFile(f); setPlanName(f.name.replace('.pdf', '').replace(/_/g, ' ')) }}} style={{ display: 'none' }} />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 8 }}>Extract trades</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  {(['all', 'selected'] as const).map(m => (
                    <button key={m} onClick={() => setExtractMode(m)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid', fontSize: 13, cursor: 'pointer', borderColor: extractMode === m ? '#2B4D3F' : '#E2DDD6', background: extractMode === m ? '#E8F0EC' : 'transparent', color: extractMode === m ? '#2B4D3F' : '#7A756E' }}>
                      {m === 'all' ? 'All trades' : 'Pick trades'}
                    </button>
                  ))}
                </div>
                {extractMode === 'selected' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {TRADES.map(t => (
                      <button key={t} onClick={() => setSelectedTrades(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                        style={{ padding: '5px 12px', borderRadius: 99, border: '1px solid', fontSize: 12, cursor: 'pointer', borderColor: selectedTrades.includes(t) ? TRADE_COLORS[t] : '#E2DDD6', background: selectedTrades.includes(t) ? TRADE_COLORS[t] + '20' : 'transparent', color: selectedTrades.includes(t) ? TRADE_COLORS[t] : '#7A756E' }}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {uploadProgress && <div style={{ fontSize: 13, color: '#2B4D3F', background: '#E8F0EC', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>{uploadProgress}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={uploadAndExtract} disabled={uploading || !planFile} style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: '#2B4D3F', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', opacity: !planFile ? 0.5 : 1 }}>
                  {uploading ? 'Extracting...' : 'Upload and extract'}
                </button>
              </div>
            </div>
            {plans.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: '#7A756E', marginBottom: 10 }}>UPLOADED PLANS</div>
                {plans.map(plan => (
                  <div key={plan.id} style={{ background: '#fff', border: '1px solid #E2DDD6', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{plan.name}</div>
                        <div style={{ fontSize: 12, color: '#7A756E', marginTop: 2 }}>
                          <span style={{ background: '#E8F0EC', color: '#2B4D3F', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500 }}>{plan.phase}</span>
                          <span style={{ marginLeft: 8 }}>{new Date(plan.created_at).toLocaleDateString()}</span>
                          <span style={{ marginLeft: 8 }}>{plan.extracted_items?.length || 0} items</span>
                        </div>
                      </div>
                      <button onClick={() => deletePlan(plan.id)} style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #E2DDD6', borderRadius: 6, background: 'transparent', color: '#7A756E', cursor: 'pointer' }}>Remove</button>
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: '#7A756E', marginBottom: 10, marginTop: 20 }}>EXTRACTED LINE ITEMS BY TRADE</div>
                {Object.entries(extractedByTrade).map(([tradeName, items]) => (
                  <div key={tradeName} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: TRADE_COLORS[tradeName] || '#6B7280' }} />
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{tradeName}</div>
                      <div style={{ fontSize: 12, color: '#7A756E' }}>({items.length})</div>
                    </div>
                    <div style={{ background: '#fff', border: '1px solid #E2DDD6', borderRadius: 12, overflow: 'hidden', marginLeft: 18 }}>
                      {items.map((item, i) => (
                        <div key={i} style={{ padding: '10px 14px', borderBottom: i < items.length - 1 ? '1px solid #F5F3EE' : 'none', display: 'flex', gap: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, minWidth: 160 }}>{item.item}</div>
                          <div style={{ fontSize: 13, color: '#4B4640', flex: 1 }}>{item.detail}</div>
                          <div style={{ fontSize: 11, color: '#7A756E', flexShrink: 0 }}>{item.planName}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* LIBRARY */}
        {tab === 'library' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={filterTrade} onChange={e => setFilterTrade(e.target.value)} style={{ ...S.input, width: 'auto' }}><option value="">All trades</option>{TRADES.map(t => <option key={t}>{t}</option>)}</select>
              <select value={filterPhase} onChange={e => setFilterPhase(e.target.value)} style={{ ...S.input, width: 'auto' }}><option value="">All phases</option>{PHASES.map(p => <option key={p}>{p}</option>)}</select>
              <span style={{ fontSize: 13, color: '#7A756E' }}>{filtered.length} improvement{filtered.length !== 1 ? 's' : ''}</span>
            </div>
            {filtered.length === 0 ? <div style={{ textAlign: 'center', padding: '3rem', color: '#7A756E', fontSize: 14 }}>No improvements logged yet.</div>
              : Object.entries(tradeGroups).map(([tradeName, items]) => (
                <div key={tradeName} style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: TRADE_COLORS[tradeName] || '#6B7280' }} />
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{tradeName}</div>
                    <div style={{ fontSize: 12, color: '#7A756E' }}>({items.length})</div>
                  </div>
                  {items.map(entry => (
                    <div key={entry.id} style={{ background: '#fff', border: '1px solid #E2DDD6', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 8, marginLeft: 18 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                        <div>
                          {entry.unit && <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>{entry.unit}</div>}
                          <div style={{ fontSize: 12, color: '#7A756E' }}>
                            <span style={{ background: '#E8F0EC', color: '#2B4D3F', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500 }}>{entry.area}</span>
                            <span style={{ marginLeft: 8 }}>{new Date(entry.created_at).toLocaleDateString()}</span>
                            {entry.logged_by && <span style={{ marginLeft: 8 }}>· {entry.logged_by}</span>}
                          </div>
                        </div>
                        <button onClick={() => deleteEntry(entry.id)} style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #E2DDD6', borderRadius: 6, background: 'transparent', color: '#7A756E', cursor: 'pointer', flexShrink: 0 }}>Remove</button>
                      </div>
                      <div style={{ fontSize: 13, color: '#4B4640', lineHeight: 1.6, marginBottom: entry.ai_insight ? 10 : 0 }}>{entry.description}</div>
                      {entry.photos?.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>{entry.photos.map((p, i) => <img key={i} src={p} style={{ width: 68, height: 68, objectFit: 'cover', borderRadius: 8, border: '1px solid #E2DDD6' }} />)}</div>}
                      {entry.ai_insight && <div style={{ background: '#F5F3EE', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#4B4640', lineHeight: 1.6, borderLeft: '3px solid #2B4D3F' }}><div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: '#7A756E', marginBottom: 4 }}>AI SPEC NOTE</div>{entry.ai_insight}</div>}
                    </div>
                  ))}
                </div>
              ))}
          </div>
        )}

        {/* PHASE PLANNER */}
        {tab === 'phaseplan' && (
          <div>
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2DDD6', padding: '1.5rem', marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Phase planner</div>
              <div style={{ fontSize: 13, color: '#7A756E', marginBottom: 16 }}>Generate a spec sheet using your logged lessons and uploaded plan data.</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 5 }}>Generate spec for</label>
                  <select value={planPhase} onChange={e => setPlanPhase(e.target.value)} style={S.input}>{PHASES.map(p => <option key={p}>{p}</option>)}</select></div>
                <div><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 5 }}>Trade (optional)</label>
                  <select value={planTrade} onChange={e => setPlanTrade(e.target.value)} style={S.input}><option value="">All trades</option>{TRADES.map(t => <option key={t}>{t}</option>)}</select></div>
              </div>
              <button onClick={generatePhasePlan} disabled={planLoading} style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: '#2B4D3F', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                {planLoading ? 'Generating...' : 'Generate spec sheet'}
              </button>
            </div>
            {planOutput && (
              <div style={{ background: '#fff', border: '1px solid #E2DDD6', borderRadius: 16, padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: '#7A756E', marginBottom: 4 }}>AI-GENERATED SPEC SHEET</div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{planPhase}{planTrade ? ` — ${planTrade}` : ' — All Trades'}</div>
                  </div>
                  <button onClick={() => navigator.clipboard.writeText(planOutput)} style={{ padding: '7px 14px', border: '1px solid #E2DDD6', borderRadius: 8, background: 'transparent', fontSize: 12, color: '#7A756E', cursor: 'pointer' }}>Copy</button>
                </div>
                <div style={{ fontSize: 14, color: '#4B4640', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{planOutput}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
