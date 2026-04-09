'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

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

export default function Home() {
  const [tab, setTab] = useState<'log' | 'library' | 'plans' | 'phaseplan'>('log')
  const [entries, setEntries] = useState<Entry[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [userName, setUserName] = useState('')
  const [nameSet, setNameSet] = useState(false)

  // Log form
  const [trade, setTrade] = useState('')
  const [phase, setPhase] = useState('Phase 1')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Library filters
  const [filterTrade, setFilterTrade] = useState('')
  const [filterPhase, setFilterPhase] = useState('')

  // Plans
  const [planFile, setPlanFile] = useState<File | null>(null)
  const [planName, setPlanName] = useState('')
  const [planPhaseUpload, setPlanPhaseUpload] = useState('Phase 1')
  const [selectedTrades, setSelectedTrades] = useState<string[]>([])
  const [extractMode, setExtractMode] = useState<'all' | 'selected'>('all')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const planFileRef = useRef<HTMLInputElement>(null)

  // Phase planner
  const [planPhase, setPlanPhase] = useState('Phase 2')
  const [planTrade, setPlanTrade] = useState('')
  const [planOutput, setPlanOutput] = useState('')
  const [planLoading, setPlanLoading] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('pcs_username')
    if (saved) { setUserName(saved); setNameSet(true) }
    fetchAll()
    const ch1 = supabase.channel('entries-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'issues' }, fetchAll).subscribe()
    const ch2 = supabase.channel('plans-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'plans' }, fetchAll).subscribe()
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2) }
  }, [])

  async function fetchAll() {
    const [e, p] = await Promise.all([
      supabase.from('issues').select('*').order('created_at', { ascending: false }),
      supabase.from('plans').select('*').order('created_at', { ascending: false })
    ])
    if (e.data) setEntries(e.data as Entry[])
    if (p.data) setPlans(p.data as Plan[])
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

  async function handlePlanFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setPlanFile(f)
    setPlanName(f.name.replace('.pdf', '').replace(/_/g, ' '))
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

      await supabase.from('plans').insert({
        name: planName || planFile.name,
        phase: planPhaseUpload,
        extracted_items: extracted,
        logged_by: userName || null
      })

      setPlanFile(null); setPlanName(''); setSelectedTrades([])
      if (planFileRef.current) planFileRef.current.value = ''
      setUploadProgress('')
      setTab('plans')
    } catch (err) {
      setUploadProgress('Error processing plan. Try again.')
    }
    setUploading(false)
  }

  async function deletePlan(id: number) {
    if (!confirm('Remove this plan?')) return
    await supabase.from('plans').delete().eq('id', id)
  }

  async function deleteEntry(id: number) {
    if (!confirm('Remove this entry?')) return
    await supabase.from('issues').delete().eq('id', id)
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

  const S = { input: { width: '100%', border: '1px solid #E2DDD6', borderRadius: 8, padding: '9px 12px', fontSize: 14, background: '#fff', color: '#1A1814', fontFamily: 'DM Sans, sans-serif' } as React.CSSProperties }

  if (!nameSet) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: '#F5F3EE' }}>
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
    <div style={{ minHeight: '100vh', background: '#F5F3EE' }}>
      <header style={{ background: '#2B4D3F', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)' }}>PEAK CONDO STORAGE</span>
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>Construction Knowledge Base</span>
            <a href="/units" style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', textDecoration: 'none', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: 6, marginLeft: 4 }}>Unit Status →</a>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#fff' }}>{userName[0]?.toUpperCase()}</div>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{userName}</span>
          </div>
        </div>
      </header>

      <div style={{ background: '#fff', borderBottom: '1px solid #E2DDD6' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', padding: '0 1.5rem' }}>
          {[
            { key: 'log', label: 'Log lesson' },
            { key: 'library', label: `Library (${entries.length})` },
            { key: 'plans', label: `Plans (${plans.length})` },
            { key: 'phaseplan', label: 'Phase planner' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as 'log' | 'library' | 'plans' | 'phaseplan')} style={{ padding: '14px 18px', border: 'none', background: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: tab === t.key ? '#2B4D3F' : '#7A756E', borderBottom: tab === t.key ? '2px solid #2B4D3F' : '2px solid transparent' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem' }}>

        {/* LOG LESSON */}
        {tab === 'log' && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2DDD6', padding: '1.5rem' }}>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Log a lesson</div>
            <div style={{ fontSize: 13, color: '#7A756E', marginBottom: 20 }}>Document something to do differently — becomes the spec for future phases.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 5 }}>Trade *</label>
                <select value={trade} onChange={e => setTrade(e.target.value)} style={S.input}><option value="">Select trade...</option>{TRADES.map(t => <option key={t}>{t}</option>)}</select></div>
              <div><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 5 }}>Phase</label>
                <select value={phase} onChange={e => setPhase(e.target.value)} style={S.input}>{PHASES.map(p => <option key={p}>{p}</option>)}</select></div>
            </div>
            <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 5 }}>Short title (optional)</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Corner backing for drywall" style={S.input} /></div>
            <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 5 }}>Description *</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What would you do differently? What should be specified for future phases?" style={{ ...S.input, minHeight: 100, resize: 'vertical' }} /></div>
            <div style={{ marginBottom: 20 }}><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 5 }}>Photos</label>
              <div onClick={() => fileRef.current?.click()} style={{ border: '1px dashed #C4BFB8', borderRadius: 8, padding: '1rem', textAlign: 'center', cursor: 'pointer', fontSize: 13, color: '#7A756E' }}>Tap to add photos<input ref={fileRef} type="file" multiple accept="image/*" onChange={handlePhotos} style={{ display: 'none' }} /></div>
              {photos.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>{photos.map((p, i) => <div key={i} style={{ position: 'relative' }}><img src={p} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid #E2DDD6' }} /><button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#991B1B', color: '#fff', border: 'none', fontSize: 10, cursor: 'pointer' }}>x</button></div>)}</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setTrade(''); setPhase('Phase 1'); setDescription(''); setPhotos([]); setTitle('') }} style={{ padding: '9px 18px', border: '1px solid #E2DDD6', borderRadius: 8, background: 'transparent', fontSize: 14, color: '#7A756E', cursor: 'pointer' }}>Clear</button>
              <button onClick={submitEntry} disabled={submitting || !trade || !description.trim()} style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: '#2B4D3F', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', opacity: (!trade || !description.trim()) ? 0.5 : 1 }}>
                {submitting ? 'Saving...' : 'Save lesson'}</button>
            </div>
          </div>
        )}

        {/* PLANS */}
        {tab === 'plans' && (
          <div>
            {/* Upload card */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2DDD6', padding: '1.5rem', marginBottom: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Upload blueprint</div>
              <div style={{ fontSize: 13, color: '#7A756E', marginBottom: 16 }}>Claude will read your PDF and extract trade-specific line items automatically.</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 5 }}>Plan name</label>
                  <input value={planName} onChange={e => setPlanName(e.target.value)} placeholder="e.g. Electrical Phase 1" style={S.input} /></div>
                <div><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 5 }}>Phase</label>
                  <select value={planPhaseUpload} onChange={e => setPlanPhaseUpload(e.target.value)} style={S.input}>{PHASES.map(p => <option key={p}>{p}</option>)}</select></div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 5 }}>PDF file</label>
                <div onClick={() => planFileRef.current?.click()} style={{ border: '1px dashed #C4BFB8', borderRadius: 8, padding: '1rem', textAlign: 'center', cursor: 'pointer', fontSize: 13, color: planFile ? '#2B4D3F' : '#7A756E', background: planFile ? '#E8F0EC' : 'transparent' }}>
                  {planFile ? planFile.name : 'Tap to select PDF blueprint'}
                  <input ref={planFileRef} type="file" accept="application/pdf" onChange={handlePlanFile} style={{ display: 'none' }} />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 8 }}>Extract trades</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  {(['all', 'selected'] as const).map(m => (
                    <button key={m} onClick={() => setExtractMode(m)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid', fontSize: 13, cursor: 'pointer', borderColor: extractMode === m ? '#2B4D3F' : '#E2DDD6', background: extractMode === m ? '#E8F0EC' : 'transparent', color: extractMode === m ? '#2B4D3F' : '#7A756E', fontWeight: extractMode === m ? 500 : 400 }}>
                      {m === 'all' ? 'All trades' : 'Pick trades'}
                    </button>
                  ))}
                </div>
                {extractMode === 'selected' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {TRADES.map(t => (
                      <button key={t} onClick={() => setSelectedTrades(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                        style={{ padding: '5px 12px', borderRadius: 99, border: '1px solid', fontSize: 12, cursor: 'pointer', borderColor: selectedTrades.includes(t) ? TRADE_COLORS[t] : '#E2DDD6', background: selectedTrades.includes(t) ? TRADE_COLORS[t] + '20' : 'transparent', color: selectedTrades.includes(t) ? TRADE_COLORS[t] : '#7A756E', fontWeight: selectedTrades.includes(t) ? 500 : 400 }}>
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

            {/* Extracted items by trade */}
            {loading ? <div style={{ textAlign: 'center', padding: '2rem', color: '#7A756E' }}>Loading...</div>
              : plans.length === 0 ? <div style={{ textAlign: 'center', padding: '3rem', color: '#7A756E', fontSize: 14 }}>No plans uploaded yet.</div>
              : (
                <>
                  {/* Plans list */}
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: '#7A756E', marginBottom: 10 }}>UPLOADED PLANS</div>
                    {plans.map(plan => (
                      <div key={plan.id} style={{ background: '#fff', border: '1px solid #E2DDD6', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 14 }}>{plan.name}</div>
                            <div style={{ fontSize: 12, color: '#7A756E', marginTop: 2 }}>
                              <span style={{ background: '#E8F0EC', color: '#2B4D3F', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500 }}>{plan.phase}</span>
                              <span style={{ marginLeft: 8 }}>{new Date(plan.created_at).toLocaleDateString()}</span>
                              <span style={{ marginLeft: 8 }}>{plan.extracted_items?.length || 0} items extracted</span>
                            </div>
                          </div>
                          <button onClick={() => deletePlan(plan.id)} style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #E2DDD6', borderRadius: 6, background: 'transparent', color: '#7A756E', cursor: 'pointer' }}>Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Items by trade */}
                  <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: '#7A756E', marginBottom: 10 }}>EXTRACTED LINE ITEMS BY TRADE</div>
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
                            <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1814', minWidth: 160 }}>{item.item}</div>
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
              <span style={{ fontSize: 13, color: '#7A756E' }}>{filtered.length} lesson{filtered.length !== 1 ? 's' : ''}</span>
            </div>
            {loading ? <div style={{ textAlign: 'center', padding: '2rem', color: '#7A756E' }}>Loading...</div>
              : filtered.length === 0 ? <div style={{ textAlign: 'center', padding: '3rem', color: '#7A756E', fontSize: 14 }}>No lessons yet. Use Log lesson to get started.</div>
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
                      {entry.ai_insight && <div style={{ background: '#F5F3EE', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#4B4640', lineHeight: 1.6, borderLeft: '3px solid #2B4D3F' }}><div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: '#7A756E', marginBottom: 4 }}>SPEC RECOMMENDATION</div>{entry.ai_insight}</div>}
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
              <div style={{ fontSize: 13, color: '#7A756E', marginBottom: 16 }}>Generate a spec sheet using your logged lessons AND uploaded plan data.</div>
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
