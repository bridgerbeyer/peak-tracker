'use client'
import React, { useEffect, useState, useRef } from 'react'
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
type Unit = { id: number; name: string; phase: string; status: string; purchase_price?: number; realtor_commission?: number; close_date?: string }
type Task = { id: number; unit_id: number; completed: boolean }


// ─── Sales Chart Component ───────────────────────────────────────────────────
function SalesChart({ units }: { units: any[] }) {
  const months: { label: string; key: string }[] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
  }

  const data = months.map(m => {
    const soldUnits = units.filter(u => {
      if (u.status !== 'Sold' || !u.purchase_price || !u.close_date) return false
      return u.close_date.substring(0, 7) === m.key
    })
    const contractUnits = units.filter(u => u.status === 'Under Contract' && u.purchase_price)
    return {
      label: m.label,
      sold: soldUnits.reduce((s: number, u: any) => s + (u.purchase_price || 0), 0),
      contract: contractUnits.reduce((s: number, u: any) => s + (u.purchase_price || 0), 0),
      soldCount: soldUnits.length,
      contractCount: contractUnits.length,
    }
  })

  const maxVal = Math.max(...data.map(d => Math.max(d.sold, d.contract)), 1)
  const H = 180
  const W_STEP = 100 / months.length
  const fmt2 = (n: number) => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n/1000)}K` : `$${n}`

  const toY = (val: number) => H - (val / maxVal) * H

  const soldPath = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100
    const y = toY(d.sold)
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
  }).join(' ')

  const contractPath = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100
    const y = toY(d.contract)
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
  }).join(' ')

  const [tooltip, setTooltip] = React.useState<{x: number; y: number; d: typeof data[0]} | null>(null)

  return (
    <div style={{ position: 'relative', userSelect: 'none' }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        {[
          { label: 'Closings (Sold)', color: '#059669' },
          { label: 'Under Contract', color: '#D97706' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--gray)' }}>
            <div style={{ width: 24, height: 3, background: l.color, borderRadius: 2 }} />
            {l.label}
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div style={{ position: 'relative', height: H + 32 }}>
        {/* Y axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => (
          <div key={pct} style={{ position: 'absolute', right: 'calc(100% - 36px)', top: H * (1 - pct) - 8, fontSize: 10, color: 'var(--gray)', whiteSpace: 'nowrap', textAlign: 'right', width: 34 }}>
            {pct === 0 ? '$0' : fmt2(maxVal * pct)}
          </div>
        ))}

        {/* Grid lines */}
        <svg style={{ position: 'absolute', left: 40, right: 0, top: 0, height: H, width: 'calc(100% - 40px)', overflow: 'visible' }} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none">
          {[0, 0.25, 0.5, 0.75, 1].map(pct => (
            <line key={pct} x1="0" y1={H * (1 - pct)} x2="100" y2={H * (1 - pct)} stroke="var(--border)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
          ))}
          {/* Under Contract line */}
          {maxVal > 1 && <polyline points={data.map((d, i) => `${(i/(data.length-1))*100},${toY(d.contract)}`).join(' ')} fill="none" stroke="#D97706" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" strokeDasharray="4 2" />}
          {/* Sold line */}
          {maxVal > 1 && <polyline points={data.map((d, i) => `${(i/(data.length-1))*100},${toY(d.sold)}`).join(' ')} fill="none" stroke="#059669" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          {/* Sold dots */}
          {data.map((d, i) => d.sold > 0 ? (
            <circle key={i} cx={(i/(data.length-1))*100} cy={toY(d.sold)} r="3" fill="#059669" vectorEffect="non-scaling-stroke" />
          ) : null)}
          {/* Contract dots */}
          {data.map((d, i) => d.contract > 0 ? (
            <circle key={i} cx={(i/(data.length-1))*100} cy={toY(d.contract)} r="3" fill="#D97706" stroke="var(--surface)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          ) : null)}
          {/* Hover targets */}
          {data.map((d, i) => (
            <rect key={i} x={(i/(data.length-1))*100 - W_STEP/2} y={0} width={W_STEP} height={H}
              fill="transparent" style={{ cursor: 'crosshair' }}
              onMouseEnter={e => {
                const rect = e.currentTarget.closest('svg')!.getBoundingClientRect()
                setTooltip({ x: (i/(data.length-1))*100, y: Math.min(toY(d.sold), toY(d.contract)), d })
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}
        </svg>

        {/* Tooltip */}
        {tooltip && (tooltip.d.sold > 0 || tooltip.d.contract > 0) && (
          <div style={{ position: 'absolute', left: `calc(40px + ${tooltip.x}%)`, top: 0, transform: 'translateX(-50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
            <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{tooltip.d.label}</div>
            {tooltip.d.sold > 0 && <div style={{ color: '#059669' }}>Closed: {fmt2(tooltip.d.sold)} ({tooltip.d.soldCount} unit{tooltip.d.soldCount !== 1 ? 's' : ''})</div>}
            {tooltip.d.contract > 0 && <div style={{ color: '#D97706' }}>Under contract: {fmt2(tooltip.d.contract)} ({tooltip.d.contractCount} unit{tooltip.d.contractCount !== 1 ? 's' : ''})</div>}
          </div>
        )}

        {/* X axis labels */}
        <div style={{ position: 'absolute', left: 40, right: 0, top: H + 6, display: 'flex', justifyContent: 'space-between' }}>
          {data.map((d, i) => (
            <div key={i} style={{ fontSize: 10, color: 'var(--gray)', textAlign: 'center', flex: 1 }}>{i % 2 === 0 ? d.label : ''}</div>
          ))}
        </div>
      </div>

      {maxVal <= 1 && (
        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--gray)', marginTop: 8 }}>
          Add purchase prices and close dates to units to see the sales timeline.
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const LOGO = "data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAFhAgwDASIAAhEBAxEB/8QAHQABAAICAwEBAAAAAAAAAAAAAAcIBQYDBAkCAf/EAGIQAAEDAgMEBAYHEQwFDAMAAAEAAgMEBQYHERIhMUEIE1FhFBUiMnGBCUJSYnWR0RYXGCMkMzc4VVaVobGys8HwNUNTV3J0gpKTlNLTNGOltOElOURHVGd2haPE1OSEosL/xAAcAQEAAgIDAQAAAAAAAAAAAAAABQYEBwECAwj/xAA2EQEAAQIDBgUBBgUFAAAAAAAAAQIDBAURBiExQVFhEhNxgdEyFBUiI6GxUpHB8PEHM4LC4f/aAAwDAQACEQMRAD8ApkiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIuaqpamke1lVTywOexsjRI0tJa4atcNeRB1BQcKIiAiIgIuQQTGnNSIZDAHhhk2TshxBIbrw10BOncuNAREQERb/gzArbjZJq25bcT6iPSkHDY7JCOevIdnpC8r16izT4q0lleU4nNL3k4anWdJntH+eEd2gIuxcaOooK6ajqmFk0Li14/bkuuvSJiY1hH10VUVTTVGkwIiLl1EREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQERbPlthCsxliKO3QbUdLHo+rnA3RR6/nHgB+oFBsuRuXxxRdPG90i/5GpH72uH+kyDfsfyRxd8XM6b10lsKisslPiajiHXUGkNQGjjCT5J/ouPxOPYpXs1torPa6e2W6BsFLTsDI2N5DtPaTxJ5lclwpKevoZ6GrjEtPURuilYeDmuGhHxFBR5FlsYWZ2H8T3CzOlbL4JO6Nr2kHabxaTpz0I1HI6hYlAWVwnYLhia+09ntse1NMd7j5sbRxe7sAWOpoJqmpjpqeJ8s0rwyNjBq5zidAAO1WsygwLDgyxa1DWSXarAdVyDfsdkbT2DmeZ39mgfNxy5tXzsZsIULG7QZ1kc7xo51QN4kPpO7uB0VVaiGWnqJKeeN0csTyx7HDQtcDoQfWryKtnSRwyy04rivdMGtguoLntHKZum0dOwgtPp1QRUiLMYTsVRf7qykh1ZE3yppdNzG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MGhvWTyukdoOWpOui6ymjPTPKizMwlS2Gmy9s+HHwV7Ks1VJIHPeGxyM6s6Rt3HrNePtQoXQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERB//9k="
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [tab, setTab] = useState<'dashboard' | 'library' | 'plans' | 'phaseplan'>('dashboard')
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
  const [showLogForm, setShowLogForm] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [expandedImg, setExpandedImg] = useState<string | null>(null)

  useEffect(() => {
    const savedTheme = localStorage.getItem('pcs_theme') as 'dark' | 'light' | null
    if (savedTheme) { setTheme(savedTheme); document.documentElement.setAttribute('data-theme', savedTheme) }
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('pcs_theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

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
    setShowLogForm(false)
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
    input: { width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 14, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'DM Sans, sans-serif' } as React.CSSProperties,
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem' } as React.CSSProperties,
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


  function exportPDF() {
    setExporting(true)
    const TCOLORS: Record<string,string> = { Framing:'#D97706',Electrical:'#2563EB',Plumbing:'#059669',HVAC:'#DB2777','Fire Sprinkler':'#DC2626',Drywall:'#7C3AED',Concrete:'#6B7280',Finishing:'#0891B2',Other:'#92400E' }
    const date = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})
    const fil = entries.filter((e:any)=>(!filterTrade||e.category===filterTrade)&&(!filterPhase||e.area===filterPhase))
    const grps: Record<string,any[]> = {}
    fil.forEach((e:any)=>{ if(!grps[e.category]) grps[e.category]=[]; grps[e.category].push(e) })

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Build Playbook</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;background:#fff;font-size:13px;line-height:1.5}
.page{max-width:760px;margin:0 auto;padding:48px 48px 64px}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:18px;border-bottom:3px solid #CC2222}
.hdr h1{font-size:24px;font-weight:800;letter-spacing:-.5px;margin-bottom:4px}
.hdr p{font-size:12px;color:#666}
.hdr-r{text-align:right;font-size:12px;color:#666}
.hdr-r .d{font-size:13px;color:#1a1a1a;font-weight:600}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:28px}
.chip{background:#f5f5f5;border-radius:6px;padding:5px 12px;font-size:12px;color:#444}
.chip b{color:#1a1a1a}
.trade{margin-bottom:28px}
.trade-hdr{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:7px;border-bottom:1px solid #e5e5e5}
.dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.trade-hdr strong{font-size:14px}
.trade-hdr span{font-size:12px;color:#888}
.card{background:#fafafa;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;margin-bottom:14px;page-break-inside:avoid}
.photos{display:grid;gap:2px}
.photos img{width:100%;object-fit:cover;display:block}
.body{padding:14px 16px}
.title{font-size:14px;font-weight:700;margin-bottom:5px}
.meta{display:flex;gap:7px;align-items:center;margin-bottom:8px;flex-wrap:wrap}
.badge{background:#fff0f0;color:#CC2222;border-radius:99px;padding:2px 9px;font-size:11px;font-weight:700}
.muted{font-size:11px;color:#888}
.desc{font-size:13px;color:#333;line-height:1.65}
.ai{background:#fff;border-left:3px solid #CC2222;padding:8px 12px;margin-top:10px;border-radius:0 6px 6px 0}
.ai-lbl{font-size:10px;font-weight:700;letter-spacing:.08em;color:#999;margin-bottom:2px;text-transform:uppercase}
.ai-txt{font-size:12px;color:#444;line-height:1.55}
.footer{margin-top:40px;padding-top:12px;border-top:1px solid #e5e5e5;font-size:11px;color:#aaa;display:flex;justify-content:space-between}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.card{page-break-inside:avoid}.trade{page-break-inside:avoid}}
</style></head><body><div class="page">
<div class="hdr"><div><h1>Build Playbook</h1><p>Peak Condo Storage &mdash; Construction Knowledge Base</p></div><div class="hdr-r"><div class="d">${date}</div>${userName?`<div style="margin-top:3px">Prepared by ${userName}</div>`:''}</div></div>
<div class="chips">
  <div class="chip">Improvements: <b>${fil.length}</b></div>
  ${filterTrade?`<div class="chip">Trade: <b>${filterTrade}</b></div>`:''}
  ${filterPhase?`<div class="chip">Phase: <b>${filterPhase}</b></div>`:''}
  <div class="chip">Trades: <b>${Object.keys(grps).length}</b></div>
</div>
${Object.entries(grps).map(([trade,items])=>`
<div class="trade">
  <div class="trade-hdr"><div class="dot" style="background:${TCOLORS[trade]||'#6B7280'}"></div><strong>${trade}</strong><span>${items.length} item${items.length!==1?'s':''}</span></div>
  ${items.map((e:any)=>`
  <div class="card">
    ${e.photos?.length>0?`<div class="photos" style="grid-template-columns:${e.photos.length===1?'1fr':e.photos.length===2?'1fr 1fr':'repeat(3,1fr)'}">${e.photos.map((p:string)=>`<img src="${p}" style="max-height:${e.photos.length===1?'260px':'175px'}">`).join('')}</div>`:''}
    <div class="body">
      ${e.unit?`<div class="title">${e.unit}</div>`:''}
      <div class="meta"><span class="badge">${e.area}</span><span class="muted">${new Date(e.created_at).toLocaleDateString()}</span>${e.logged_by?`<span class="muted">&middot; ${e.logged_by}</span>`:''}</div>
      <div class="desc">${e.description}</div>
      ${e.ai_insight?`<div class="ai"><div class="ai-lbl">AI Spec Note</div><div class="ai-txt">${e.ai_insight}</div></div>`:''}
    </div>
  </div>`).join('')}
</div>`).join('')}
<div class="footer"><span>Peak Condo Storage &mdash; Build Playbook</span><span>Generated ${date}</span></div>
</div><script>window.onload=function(){setTimeout(function(){window.print()},500)}</script></body></html>`

    const win = window.open('','_blank')
    if (win) { win.document.write(html); win.document.close() }
    else alert('Please allow popups for this site to export PDF.')
    setExporting(false)
  }

  if (!nameSet) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'var(--bg)', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '2.5rem', maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.1em', color: 'var(--gray)', marginBottom: 8 }}>PEAK CONDO STORAGE</div>
        <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Construction Knowledge Base</div>
        <div style={{ color: 'var(--gray)', fontSize: 14, marginBottom: 24 }}>Who is logging in?</div>
        <input value={userName} onChange={e => setUserName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSetName()} placeholder="Your name" style={{ ...S.input, marginBottom: 12, textAlign: 'center' }} autoFocus />
        <button onClick={handleSetName} style={{ width: '100%', padding: '10px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Enter</button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'DM Sans, sans-serif' }}>
      <header style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img src="data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAFhAgwDASIAAhEBAxEB/8QAHQABAAICAwEBAAAAAAAAAAAAAAcIBQYDBAkCAf/EAGIQAAEDAgMEBAYHEQwFDAMAAAEAAgMEBQYHERIhMUEIE1FhFBUiMnGBCUJSYnWR0RYXGCMkMzc4VVaVobGys8HwNUNTV3J0gpKTlNLTNGOltOElOURHVGd2haPE1OSEosL/xAAcAQEAAgIDAQAAAAAAAAAAAAAABQYEBwECAwj/xAA2EQEAAQIDBgUBBgUFAAAAAAAAAQIDBAURBiExQVFhEhNxgdEyFBUiI6GxUpHB8PEHM4LC4f/aAAwDAQACEQMRAD8ApkiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIuaqpamke1lVTywOexsjRI0tJa4atcNeRB1BQcKIiAiIgIuQQTGnNSIZDAHhhk2TshxBIbrw10BOncuNAREQERb/gzArbjZJq25bcT6iPSkHDY7JCOevIdnpC8r16izT4q0lleU4nNL3k4anWdJntH+eEd2gIuxcaOooK6ajqmFk0Li14/bkuuvSJiY1hH10VUVTTVGkwIiLl1EREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQERbPlthCsxliKO3QbUdLHo+rnA3RR6/nHgB+oFBsuRuXxxRdPG90i/5GpH72uH+kyDfsfyRxd8XM6b10lsKisslPiajiHXUGkNQGjjCT5J/ouPxOPYpXs1torPa6e2W6BsFLTsDI2N5DtPaTxJ5lclwpKevoZ6GrjEtPURuilYeDmuGhHxFBR5FlsYWZ2H8T3CzOlbL4JO6Nr2kHabxaTpz0I1HI6hYlAWVwnYLhia+09ntse1NMd7j5sbRxe7sAWOpoJqmpjpqeJ8s0rwyNjBq5zidAAO1WsygwLDgyxa1DWSXarAdVyDfsdkbT2DmeZ39mgfNxy5tXzsZsIULG7QZ1kc7xo51QN4kPpO7uB0VVaiGWnqJKeeN0csTyx7HDQtcDoQfWryKtnSRwyy04rivdMGtguoLntHKZum0dOwgtPp1QRUiLMYTsVRf7qykh1ZE3yppdNzG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MGhvWTyukdoOWpOui6ymjPTPKizMwlS2Gmy9s+HHwV7Ks1VJIHPeGxyM6s6Rt3HrNePtQoXQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERB//9k=" alt="Peak Condo Storage" style={{ height: 34, width: 'auto' }} />
            <div style={{ width: 1, height: 20, background: 'var(--surface2)' }} />
            <span style={{ fontSize: 12, color: 'var(--gray)', letterSpacing: '0.04em' }}>Construction Knowledge Base</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={toggleTheme} title="Toggle theme" style={{ fontSize: 13, color: 'var(--gray)', background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', padding: '5px 10px', borderRadius: 6, lineHeight: 1 }}>
              {theme === 'dark' ? '☀' : '◑'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#fff' }}>{userName[0]?.toUpperCase()}</div>
              <span style={{ fontSize: 13, color: 'var(--gray)' }}>{userName}</span>
            </div>
            <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
              style={{ fontSize: 12, color: 'var(--gray)', background: 'none', border: '1px solid var(--border)', cursor: 'pointer', padding: '5px 10px', borderRadius: 6 }}>Sign out</button>
          </div>
        </div>
      </header>

      <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', padding: '0 1.5rem' }}>
          <Link href="/units" style={{ padding: '14px 18px', border: 'none', background: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: 'var(--gray)', borderBottom: '2px solid transparent', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>Unit status</Link>
          {([
            { key: 'dashboard', label: 'Dashboard' },
            { key: 'library', label: `Build playbook (${entries.length})` },
            { key: 'plans', label: `Plans (${plans.length})` },
            { key: 'phaseplan', label: 'Phase planner' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '14px 18px', border: 'none', background: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: tab === t.key ? '#F5F5F5' : '#8A8A8A', borderBottom: tab === t.key ? '2px solid #CC2222' : '2px solid transparent' }}>
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
                <div key={m.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem 1.25rem' }}>
                  <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 600, color: m.color || '#1A1814', lineHeight: 1.1 }}>{m.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 4 }}>{m.sub}</div>
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
                <div key={m.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem 1.25rem' }}>
                  <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: m.color, lineHeight: 1.1 }}>{m.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 4 }}>{m.sub}</div>
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
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gray)' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Sales timeline chart */}
            <div style={{ ...S.card, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Sales timeline</div>
              <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 16 }}>Month-to-month pipeline value</div>
              <SalesChart units={units} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {/* Construction progress */}
              <div style={S.card}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Construction progress</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>{constructionPct}%</div>
                <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 12 }}>{completedTasks} of {totalTasks} tasks complete across all units</div>
                <div style={{ background: 'var(--bg)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${constructionPct}%`, height: '100%', borderRadius: 99, background: constructionPct === 100 ? '#059669' : '#2B4D3F', transition: 'width 0.4s' }} />
                </div>
              </div>

              {/* Knowledge base */}
              <div style={S.card}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Knowledge base</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Lessons logged', value: entries.length, action: () => { setTab('library'); setShowLogForm(true) } },
                    { label: 'Plans uploaded', value: plans.length, action: () => setTab('plans') },
                    { label: 'Trades covered', value: Object.keys(tradeGroups).length, action: () => setTab('library') },
                    { label: 'Spec items', value: allExtracted.length, action: () => setTab('plans') },
                  ].map(m => (
                    <div key={m.label} onClick={m.action} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', cursor: 'pointer' }}>
                      <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--red)' }}>{m.value}</div>
                      <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>{m.label}</div>
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
                  <div key={p.phase} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px' }}>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.08em', color: 'var(--gray)', marginBottom: 10 }}>{p.phase.toUpperCase()}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      {[
                        { label: 'Total units', value: p.total },
                        { label: 'Sold', value: p.sold, color: '#059669' },
                        { label: 'Under contract', value: p.underContract, color: '#D97706' },
                        { label: 'Available', value: p.available, color: '#2563EB' },
                      ].map(row => (
                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ color: 'var(--gray)' }}>{row.label}</span>
                          <span style={{ fontWeight: 500, color: row.color || '#1A1814' }}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 4 }}>Construction {p.taskPct}%</div>
                    <div style={{ background: 'var(--bg)', borderRadius: 99, height: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${p.taskPct}%`, height: '100%', borderRadius: 99, background: 'var(--red)' }} />
                    </div>
                  </div>
                ))}
                {phaseStats.length === 0 && (
                  <div style={{ color: 'var(--gray)', fontSize: 13, gridColumn: '1/-1' }}>No unit data yet. <Link href="/units" style={{ color: 'var(--red)' }}>Go to Unit Status →</Link></div>
                )}
              </div>
            </div>

            {/* Recent lessons */}
            {recentLessons.length > 0 && (
              <div style={S.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Recent lessons</div>
                  <button onClick={() => setTab('library')} style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}>View all →</button>
                </div>
                {recentLessons.map(e => (
                  <div key={e.id} style={{ padding: '10px 0', borderBottom: '1px solid #F5F3EE', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: TRADE_COLORS[e.category] || '#6B7280', flexShrink: 0, marginTop: 5 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{e.unit || e.category}</div>
                      <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 1 }}>{e.description.slice(0, 100)}{e.description.length > 100 ? '...' : ''}</div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--gray)', flexShrink: 0, marginLeft: 'auto' }}>{e.area}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Quick actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <Link href="/units" style={{ flex: 1, display: 'block', background: 'var(--red)', color: '#fff', borderRadius: 10, padding: '14px', textAlign: 'center', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Go to Unit Status</Link>
              <button onClick={() => { setTab('library'); setShowLogForm(true) }} style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: 'var(--text)' }}>Log improvement</button>
              <button onClick={() => setTab('phaseplan')} style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: 'var(--text)' }}>Generate spec sheet</button>
            </div>
          </div>
        )}

        {/* PLANS */}
        {tab === 'plans' && (
          <div>
            <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.5rem', marginBottom: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Upload blueprint</div>
              <div style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 16 }}>Claude will read your PDF and extract trade-specific line items automatically.</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div><label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 5 }}>Plan name</label><input value={planName} onChange={e => setPlanName(e.target.value)} placeholder="e.g. Electrical Phase 1" style={S.input} /></div>
                <div><label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 5 }}>Phase</label><select value={planPhaseUpload} onChange={e => setPlanPhaseUpload(e.target.value)} style={S.input}>{PHASES.map(p => <option key={p}>{p}</option>)}</select></div>
              </div>
              <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 5 }}>PDF file</label>
                <div onClick={() => planFileRef.current?.click()} style={{ border: '1px dashed #C4BFB8', borderRadius: 8, padding: '1rem', textAlign: 'center', cursor: 'pointer', fontSize: 13, color: planFile ? '#2B4D3F' : '#7A756E', background: planFile ? '#E8F0EC' : 'transparent' }}>
                  {planFile ? planFile.name : 'Tap to select PDF blueprint'}
                  <input ref={planFileRef} type="file" accept="application/pdf" onChange={e => { const f = e.target.files?.[0]; if (f) { setPlanFile(f); setPlanName(f.name.replace('.pdf', '').replace(/_/g, ' ')) }}} style={{ display: 'none' }} />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 8 }}>Extract trades</label>
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
              {uploadProgress && <div style={{ fontSize: 13, color: 'var(--red)', background: 'var(--red-dim)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>{uploadProgress}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={uploadAndExtract} disabled={uploading || !planFile} style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: 'var(--red)', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', opacity: !planFile ? 0.5 : 1 }}>
                  {uploading ? 'Extracting...' : 'Upload and extract'}
                </button>
              </div>
            </div>
            {plans.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: 'var(--gray)', marginBottom: 10 }}>UPLOADED PLANS</div>
                {plans.map(plan => (
                  <div key={plan.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{plan.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 2 }}>
                          <span style={{ background: 'var(--red-dim)', color: 'var(--red)', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500 }}>{plan.phase}</span>
                          <span style={{ marginLeft: 8 }}>{new Date(plan.created_at).toLocaleDateString()}</span>
                          <span style={{ marginLeft: 8 }}>{plan.extracted_items?.length || 0} items</span>
                        </div>
                      </div>
                      <button onClick={() => deletePlan(plan.id)} style={{ fontSize: 11, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--gray)', cursor: 'pointer' }}>Remove</button>
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: 'var(--gray)', marginBottom: 10, marginTop: 20 }}>EXTRACTED LINE ITEMS BY TRADE</div>
                {Object.entries(extractedByTrade).map(([tradeName, items]) => (
                  <div key={tradeName} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: TRADE_COLORS[tradeName] || '#6B7280' }} />
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{tradeName}</div>
                      <div style={{ fontSize: 12, color: 'var(--gray)' }}>({items.length})</div>
                    </div>
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginLeft: 18 }}>
                      {items.map((item, i) => (
                        <div key={i} style={{ padding: '10px 14px', borderBottom: i < items.length - 1 ? '1px solid #F5F3EE' : 'none', display: 'flex', gap: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, minWidth: 160 }}>{item.item}</div>
                          <div style={{ fontSize: 13, color: 'var(--text2)', flex: 1 }}>{item.detail}</div>
                          <div style={{ fontSize: 11, color: 'var(--gray)', flexShrink: 0 }}>{item.planName}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* BUILD PLAYBOOK */}
        {tab === 'library' && (
          <div>
            {/* Filter bar + add button */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={filterTrade} onChange={e => setFilterTrade(e.target.value)} style={{ ...S.input, width: 'auto' }}><option value="">All trades</option>{TRADES.map(t => <option key={t}>{t}</option>)}</select>
                <select value={filterPhase} onChange={e => setFilterPhase(e.target.value)} style={{ ...S.input, width: 'auto' }}><option value="">All phases</option>{PHASES.map(p => <option key={p}>{p}</option>)}</select>
                <span style={{ fontSize: 13, color: 'var(--gray)' }}>{filtered.length} improvement{filtered.length !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={exportPDF} disabled={exporting || filtered.length === 0} style={{ padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', color: 'var(--text)', opacity: filtered.length === 0 ? 0.4 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {exporting ? '⏳' : '↓'} {exporting ? 'Exporting...' : 'Export PDF'}
                </button>
                <button onClick={() => setShowLogForm(f => !f)} style={{ padding: '8px 16px', background: showLogForm ? 'var(--surface2)' : 'var(--red)', color: showLogForm ? 'var(--text)' : '#fff', border: showLogForm ? '1px solid var(--border)' : 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  {showLogForm ? '✕ Cancel' : '+ Log improvement'}
                </button>
              </div>
            </div>

            {/* Inline log form */}
            {showLogForm && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem', marginBottom: 24 }}>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 14, color: 'var(--text)' }}>New improvement</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div><label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 4 }}>Trade *</label>
                    <select value={trade} onChange={e => setTrade(e.target.value)} style={S.input}><option value="">Select...</option>{TRADES.map(t => <option key={t}>{t}</option>)}</select></div>
                  <div><label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 4 }}>Phase</label>
                    <select value={phase} onChange={e => setPhase(e.target.value)} style={S.input}>{PHASES.map(p => <option key={p}>{p}</option>)}</select></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div><label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 4 }}>Short title (optional)</label>
                    <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Corner backing" style={S.input} /></div>
                  <div><label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 4 }}>Related unit (optional)</label>
                    <select value={title.startsWith('Unit:') ? title.replace('Unit:','').trim() : ''} onChange={e => e.target.value ? setTitle('Unit:' + e.target.value) : setTitle('')} style={S.input}>
                      <option value="">No specific unit</option>
                      {units.map(u => <option key={u.id} value={u.name}>{u.name} — {u.phase}</option>)}
                    </select></div>
                </div>
                <div style={{ marginBottom: 10 }}><label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 4 }}>Description *</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What would you do differently next time?" style={{ ...S.input, minHeight: 80, resize: 'vertical' }} /></div>
                <div style={{ marginBottom: 14 }}><label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 4 }}>Photos</label>
                  <div onClick={() => fileRef.current?.click()} style={{ border: '1px dashed var(--border2)', borderRadius: 8, padding: '12px', textAlign: 'center', cursor: 'pointer', fontSize: 13, color: 'var(--gray)' }}>Tap to add photos<input ref={fileRef} type="file" multiple accept="image/*" onChange={handlePhotos} style={{ display: 'none' }} /></div>
                  {photos.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{photos.map((p, i) => <div key={i} style={{ position: 'relative' }}><img src={p} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} /><button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#991B1B', color: '#fff', border: 'none', fontSize: 10, cursor: 'pointer' }}>x</button></div>)}</div>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button onClick={() => { setTrade(''); setPhase('Phase 1'); setDescription(''); setPhotos([]); setTitle(''); setShowLogForm(false) }} style={{ padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', fontSize: 13, color: 'var(--gray)', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={submitEntry} disabled={submitting || !trade || !description.trim()} style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: 'var(--red)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (!trade || !description.trim()) ? 0.5 : 1 }}>
                    {submitting ? 'Saving...' : 'Save improvement'}
                  </button>
                </div>
              </div>
            )}

            {/* Entries */}
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray)', fontSize: 14 }}>
                No improvements logged yet. Hit "+ Log improvement" to get started.
              </div>
            ) : Object.entries(tradeGroups).map(([tradeName, items]) => (
              <div key={tradeName} style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: TRADE_COLORS[tradeName] || '#6B7280' }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{tradeName}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray)' }}>({items.length})</div>
                </div>
                {items.map(entry => (
                  <div key={entry.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 14, marginLeft: 18 }}>
                    {/* Photos — large, top, clickable */}
                    {entry.photos?.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: entry.photos.length === 1 ? '1fr' : entry.photos.length === 2 ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 2 }}>
                        {entry.photos.map((p, i) => (
                          <div key={i} onClick={() => setExpandedImg(p)}
                            style={{ position: 'relative', paddingBottom: entry.photos.length === 1 ? '50%' : '65%', overflow: 'hidden', cursor: 'zoom-in', background: '#000' }}>
                            <img src={p} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.2s' }}
                              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
                              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')} />
                            <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.55)', borderRadius: 6, padding: '3px 7px', fontSize: 11, color: '#fff' }}>🔍</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Text content */}
                    <div style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                        <div>
                          {entry.unit && <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 3, color: 'var(--text)' }}>{entry.unit}</div>}
                          <div style={{ fontSize: 12, color: 'var(--gray)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ background: 'var(--red-dim)', color: 'var(--red)', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500 }}>{entry.area}</span>
                            <span>{new Date(entry.created_at).toLocaleDateString()}</span>
                            {entry.logged_by && <span>· {entry.logged_by}</span>}
                          </div>
                        </div>
                        <button onClick={() => deleteEntry(entry.id)} style={{ fontSize: 11, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--gray)', cursor: 'pointer', flexShrink: 0 }}>Remove</button>
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65, marginBottom: entry.ai_insight ? 12 : 0 }}>{entry.description}</div>
                      {entry.ai_insight && (
                        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, borderLeft: '3px solid var(--red)', marginTop: 10 }}>
                          <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: 'var(--gray)', marginBottom: 4 }}>AI SPEC NOTE</div>
                          {entry.ai_insight}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* Lightbox */}
            {expandedImg && (
              <div onClick={() => setExpandedImg(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, cursor: 'zoom-out', padding: '2rem' }}>
                <img src={expandedImg} style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 10, objectFit: 'contain', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }} />
                <div style={{ position: 'absolute', top: 20, right: 24, color: '#fff', fontSize: 28, cursor: 'pointer', lineHeight: 1 }} onClick={() => setExpandedImg(null)}>×</div>
              </div>
            )}
          </div>
        )}

        {/* PHASE PLANNER */}
        {tab === 'phaseplan' && (
          <div>
            <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.5rem', marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Phase planner</div>
              <div style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 16 }}>Generate a spec sheet using your logged lessons and uploaded plan data.</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div><label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 5 }}>Generate spec for</label>
                  <select value={planPhase} onChange={e => setPlanPhase(e.target.value)} style={S.input}>{PHASES.map(p => <option key={p}>{p}</option>)}</select></div>
                <div><label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 5 }}>Trade (optional)</label>
                  <select value={planTrade} onChange={e => setPlanTrade(e.target.value)} style={S.input}><option value="">All trades</option>{TRADES.map(t => <option key={t}>{t}</option>)}</select></div>
              </div>
              <button onClick={generatePhasePlan} disabled={planLoading} style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: 'var(--red)', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                {planLoading ? 'Generating...' : 'Generate spec sheet'}
              </button>
            </div>
            {planOutput && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: 'var(--gray)', marginBottom: 4 }}>AI-GENERATED SPEC SHEET</div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{planPhase}{planTrade ? ` — ${planTrade}` : ' — All Trades'}</div>
                  </div>
                  <button onClick={() => navigator.clipboard.writeText(planOutput)} style={{ padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', fontSize: 12, color: 'var(--gray)', cursor: 'pointer' }}>Copy</button>
                </div>
                <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{planOutput}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {expandedImg && (
        <div onClick={() => setExpandedImg(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: '2rem' }}>
          <button onClick={() => setExpandedImg(null)} style={{ position: 'absolute', top: 20, right: 24, background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', lineHeight: 1 }}>×</button>
          <img src={expandedImg} onClick={e => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} />
        </div>
      )}
    </div>
  )
}
