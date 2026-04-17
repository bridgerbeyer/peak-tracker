'use client'
import React, { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const TRADES = ['Framing', 'Electrical', 'Plumbing', 'HVAC', 'Fire Sprinkler', 'Drywall', 'Concrete', 'Finishing', 'Other']
const PHASES = ['Phase 1', 'Phase 2', 'Phase 3']
const TRADE_COLORS: Record<string, string> = {
  Framing: '#D97706', Electrical: '#2563EB', Plumbing: '#059669',
  HVAC: '#DB2777', 'Fire Sprinkler': '#DC2626', Drywall: '#7C3AED',
  Concrete: '#6B7280', Finishing: '#0891B2', Other: '#92400E',
}
const STATUSES = ['Available', 'Under Contract', 'Sold']
const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  'Available':      { bg: '#F0FDF4', color: '#166534', border: '#BBF7D0' },
  'Under Contract': { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' },
  'Sold':           { bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE' },
}
const DEFAULT_TASKS = [
  'Framing complete', 'Electrical rough-in', 'Plumbing rough-in',
  'HVAC rough-in', 'Fire sprinkler rough-in', 'Insulation complete',
  'Drywall complete', 'Paint complete', 'Garage door installed',
  'Flooring complete', 'Final electrical', 'Final inspection',
]

type Entry = { id: number; created_at: string; category: string; area: string; unit?: string; description: string; photos: string[]; ai_insight?: string; logged_by?: string }
type Plan = { id: number; created_at: string; name: string; phase: string; extracted_items: ExtractedItem[]; logged_by?: string }
type ExtractedItem = { trade: string; item: string; detail: string }
type Unit = { id: number; name: string; phase: string; status: string; size?: string; notes?: string; purchase_price?: number; realtor_commission?: number; buyer_name?: string; close_date?: string }
type Task = { id: number; unit_id: number; title: string; description?: string; completed: boolean; due_date?: string; images?: TaskImage[] }
type TaskImage = { id: number; task_id: number; image_data: string }
type UnitPhoto = { id: number; unit_id: number; image_data: string; caption?: string; created_at: string }
type UnitCost = { id: number; unit_id: number; label: string; amount: number }
type ChangeOrder = { id: number; unit_id: number; title: string; description?: string; amount: number; status: string; date: string; created_at: string; included_in_price: boolean }


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
  const [tab, setTab] = useState<'dashboard' | 'library' | 'plans' | 'phaseplan' | 'units'>('dashboard')
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
  const [exportingXlsx, setExportingXlsx] = useState(false)
  const [expandedImg, setExpandedImg] = useState<string | null>(null)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailNote, setEmailNote] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  // ── Units tab state ──────────────────────────────────────────────────────
  const [taskImages, setTaskImages] = useState<TaskImage[]>([])
  const [unitPhotos, setUnitPhotos] = useState<UnitPhoto[]>([])
  const [unitCosts, setUnitCosts] = useState<UnitCost[]>([])
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([])
  const [unitPhase, setUnitPhase] = useState('Phase 1')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null)
  const [drawerTab, setDrawerTab] = useState<'tasks' | 'photos' | 'changeorders'>('tasks')
  const [showAddUnit, setShowAddUnit] = useState(false)
  const [newUnitName, setNewUnitName] = useState('')
  const [newUnitPhase, setNewUnitPhase] = useState('Phase 1')
  const [newUnitSize, setNewUnitSize] = useState('')
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [newTaskDue, setNewTaskDue] = useState('')
  const [addingTask, setAddingTask] = useState(false)
  const [editPrice, setEditPrice] = useState('')
  const [editCommission, setEditCommission] = useState('')
  const [editBuyer, setEditBuyer] = useState('')
  const [editCloseDate, setEditCloseDate] = useState('')
  const [savingSales, setSavingSales] = useState(false)
  const [newCostLabel, setNewCostLabel] = useState('')
  const [newCostAmount, setNewCostAmount] = useState('')
  const [addingCost, setAddingCost] = useState(false)
  const [newCOTitle, setNewCOTitle] = useState('')
  const [newCODesc, setNewCODesc] = useState('')
  const [newCOAmount, setNewCOAmount] = useState('')
  const [newCODate, setNewCODate] = useState('')
  const [showCOForm, setShowCOForm] = useState(false)
  const [addingCO, setAddingCO] = useState(false)
  const [newPhotoCaption, setNewPhotoCaption] = useState('')
  const imgRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const unitPhotoRef = useRef<HTMLInputElement>(null)

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
    const [e, p, u, t, ti, up, uc, co] = await Promise.all([
      supabase.from('issues').select('*').order('created_at', { ascending: false }),
      supabase.from('plans').select('*').order('created_at', { ascending: false }),
      supabase.from('units').select('*').order('name'),
      supabase.from('tasks').select('*').order('created_at'),
      supabase.from('task_images').select('*').order('created_at'),
      supabase.from('unit_photos').select('*').order('created_at', { ascending: false }),
      supabase.from('unit_costs').select('*').order('created_at'),
      supabase.from('change_orders').select('*').order('date', { ascending: false }),
    ])
    const errs = [e.error, u.error, t.error, ti.error, up.error, uc.error, co.error].filter(Boolean)
    if (errs.length) alert(`Failed to load some data: ${errs[0]?.message}. Please refresh.`)
    if (e.data) setEntries(e.data as Entry[])
    if (p.data) setPlans(p.data as Plan[])
    if (u.data) setUnits(u.data as Unit[])
    if (t.data) setTasks(t.data as Task[])
    if (ti.data) setTaskImages(ti.data as TaskImage[])
    if (up.data) setUnitPhotos(up.data as UnitPhoto[])
    if (uc.data) setUnitCosts(uc.data as UnitCost[])
    if (co.data) setChangeOrders(co.data as ChangeOrder[])
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

  // ── Units tab helpers ────────────────────────────────────────────────────
  const unitTasks = useCallback((unitId: number) =>
    tasks.filter(t => t.unit_id === unitId).map(t => ({ ...t, images: taskImages.filter(i => i.task_id === t.id) }))
  , [tasks, taskImages])

  const progress = useCallback((unitId: number) => {
    const ut = tasks.filter(t => t.unit_id === unitId)
    if (!ut.length) return 0
    return Math.round(ut.filter(t => t.completed).length / ut.length * 100)
  }, [tasks])

  async function updateStatus(unitId: number, status: string) {
    await supabase.from('units').update({ status }).eq('id', unitId)
    setUnits(prev => prev.map(u => u.id === unitId ? { ...u, status } : u))
    if (selectedUnit?.id === unitId) setSelectedUnit(prev => prev ? { ...prev, status } : prev)
  }

  function openUnit(unit: Unit) {
    setSelectedUnit(unit)
    setDrawerTab('tasks')
    setEditPrice(unit.purchase_price ? unit.purchase_price.toString() : '')
    setEditCommission(unit.realtor_commission !== undefined && unit.realtor_commission !== null ? unit.realtor_commission.toString() : '0')
    setEditBuyer(unit.buyer_name || '')
    setEditCloseDate(unit.close_date || '')
  }

  async function addUnit() {
    if (!newUnitName.trim()) return
    const { data } = await supabase.from('units').insert({ name: newUnitName.trim().toUpperCase(), phase: newUnitPhase, status: 'Available', size: newUnitSize.trim() || null }).select().single()
    if (data) setUnits(prev => [...prev, data as Unit].sort((a, b) => a.name.localeCompare(b.name)))
    setNewUnitName(''); setNewUnitSize(''); setShowAddUnit(false)
  }

  async function addTask() {
    if (!selectedUnit || !newTaskTitle.trim()) return
    setAddingTask(true)
    const { data } = await supabase.from('tasks').insert({ unit_id: selectedUnit.id, title: newTaskTitle.trim(), description: newTaskDesc.trim() || null, due_date: newTaskDue || null, completed: false }).select().single()
    if (data) setTasks(prev => [...prev, data as Task])
    setNewTaskTitle(''); setNewTaskDesc(''); setNewTaskDue(''); setShowAddTask(false)
    setAddingTask(false)
  }

  async function addDefaultTasks() {
    if (!selectedUnit) return
    const existing = tasks.filter(t => t.unit_id === selectedUnit.id).map(t => t.title)
    const toAdd = DEFAULT_TASKS.filter(t => !existing.includes(t))
    if (!toAdd.length) return
    const { data } = await supabase.from('tasks').insert(toAdd.map(title => ({ unit_id: selectedUnit.id, title, completed: false }))).select()
    if (data) setTasks(prev => [...prev, ...(data as Task[])])
  }

  async function toggleTask(taskId: number, completed: boolean) {
    await supabase.from('tasks').update({ completed }).eq('id', taskId)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed } : t))
  }

  async function deleteTask(taskId: number) {
    if (!confirm('Delete this task?')) return
    const { error } = await supabase.from('tasks').delete().eq('id', taskId)
    if (error) { alert(`Failed to delete: ${error.message}`); return }
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setTaskImages(prev => prev.filter(i => i.task_id !== taskId))
  }

  async function uploadTaskImage(taskId: number, file: File) {
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const imageData = ev.target?.result as string
      const { data } = await supabase.from('task_images').insert({ task_id: taskId, image_data: imageData }).select().single()
      if (data) setTaskImages(prev => [...prev, data as TaskImage])
    }
    reader.readAsDataURL(file)
  }

  async function deleteTaskImage(imageId: number) {
    await supabase.from('task_images').delete().eq('id', imageId)
    setTaskImages(prev => prev.filter(i => i.id !== imageId))
  }

  async function uploadUnitPhoto(file: File, caption?: string) {
    if (!selectedUnit) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const imageData = ev.target?.result as string
      const { data } = await supabase.from('unit_photos').insert({ unit_id: selectedUnit.id, image_data: imageData, caption: caption?.trim() || null }).select().single()
      if (data) setUnitPhotos(prev => [data as UnitPhoto, ...prev])
    }
    reader.readAsDataURL(file)
  }

  async function deleteUnitPhoto(photoId: number) {
    await supabase.from('unit_photos').delete().eq('id', photoId)
    setUnitPhotos(prev => prev.filter(p => p.id !== photoId))
  }

  async function saveSalesInfo() {
    if (!selectedUnit) return
    setSavingSales(true)
    const updates: Partial<Unit> = {
      purchase_price: editPrice ? parseFloat(editPrice.replace(/,/g, '')) : undefined,
      realtor_commission: editCommission ? parseFloat(editCommission) : undefined,
      buyer_name: editBuyer.trim() || undefined,
      close_date: editCloseDate || undefined,
    }
    const { error } = await supabase.from('units').update(updates).eq('id', selectedUnit.id)
    if (error) {
      alert(`Failed to save: ${error.message}`)
    } else {
      setUnits(prev => prev.map(u => u.id === selectedUnit.id ? { ...u, ...updates } : u))
      setSelectedUnit(prev => prev ? { ...prev, ...updates } : prev)
    }
    setSavingSales(false)
  }

  async function addCost() {
    if (!selectedUnit || !newCostLabel.trim() || !newCostAmount) return
    setAddingCost(true)
    const { data, error } = await supabase.from('unit_costs').insert({ unit_id: selectedUnit.id, label: newCostLabel.trim(), amount: parseFloat(newCostAmount) || 0 }).select().single()
    if (error) {
      alert(`Failed to add cost: ${error.message}`)
    } else if (data) {
      setUnitCosts(prev => [...prev, data as UnitCost])
      setNewCostLabel(''); setNewCostAmount('')
    }
    setAddingCost(false)
  }

  async function deleteCost(id: number) {
    if (!confirm('Delete this cost item?')) return
    const { error } = await supabase.from('unit_costs').delete().eq('id', id)
    if (error) { alert(`Failed to delete: ${error.message}`); return }
    setUnitCosts(prev => prev.filter(c => c.id !== id))
  }

  async function updateCostAmount(id: number, amount: number) {
    await supabase.from('unit_costs').update({ amount }).eq('id', id)
    setUnitCosts(prev => prev.map(c => c.id === id ? { ...c, amount } : c))
  }

  async function addChangeOrder() {
    if (!selectedUnit || !newCOTitle.trim()) return
    setAddingCO(true)
    const { data, error } = await supabase.from('change_orders').insert({
      unit_id: selectedUnit.id, title: newCOTitle.trim(),
      description: newCODesc.trim() || null,
      amount: parseFloat(newCOAmount) || 0,
      status: 'Pending', date: newCODate || new Date().toISOString().split('T')[0], included_in_price: false
    }).select().single()
    if (error) {
      alert(`Failed to add change order: ${error.message}`)
    } else if (data) {
      setChangeOrders(prev => [data as ChangeOrder, ...prev])
      setNewCOTitle(''); setNewCODesc(''); setNewCOAmount(''); setNewCODate(''); setShowCOForm(false)
    }
    setAddingCO(false)
  }

  async function updateCOStatus(id: number, status: string) {
    await supabase.from('change_orders').update({ status }).eq('id', id)
    setChangeOrders(prev => prev.map(c => c.id === id ? { ...c, status } : c))
  }

  async function toggleCOIncluded(id: number, included: boolean) {
    await supabase.from('change_orders').update({ included_in_price: included }).eq('id', id)
    setChangeOrders(prev => prev.map(c => c.id === id ? { ...c, included_in_price: included } : c))
  }

  async function deleteCO(id: number) {
    if (!confirm('Delete this change order?')) return
    const { error } = await supabase.from('change_orders').delete().eq('id', id)
    if (error) { alert(`Failed to delete: ${error.message}`); return }
    setChangeOrders(prev => prev.filter(c => c.id !== id))
  }

  const filtered = entries.filter(e => (!filterTrade || e.category === filterTrade) && (!filterPhase || e.area === filterPhase))
  const tradeGroups = TRADES.reduce((acc, t) => { const items = filtered.filter(e => e.category === t); if (items.length) acc[t] = items; return acc }, {} as Record<string, Entry[]>)
  const allExtracted = plans.flatMap(p => (p.extracted_items || []).map(i => ({ ...i, planName: p.name, phase: p.phase })))
  const extractedByTrade = TRADES.reduce((acc, t) => { const items = allExtracted.filter(i => i.trade === t); if (items.length) acc[t] = items; return acc }, {} as Record<string, typeof allExtracted>)

  const S = {
    input: { width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 14, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'DM Sans, sans-serif' } as React.CSSProperties,
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem' } as React.CSSProperties,
    btn: { padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', fontSize: 13, cursor: 'pointer', color: 'var(--text)', fontFamily: 'DM Sans, sans-serif' } as React.CSSProperties,
    btnPrimary: { padding: '8px 18px', border: 'none', borderRadius: 8, background: 'var(--red)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' } as React.CSSProperties,
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


  async function exportExcel() {
    setExportingXlsx(true)
    try {
      const resp = await fetch('/api/export-excel')
      if (!resp.ok) throw new Error('Export failed')
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `PeakCondoStorage_Pipeline_${new Date().toISOString().split('T')[0]}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Export failed. Please try again.')
    }
    setExportingXlsx(false)
  }

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

  async function sendPlaybook() {
    if (!emailTo.trim()) return
    setSendingEmail(true)
    try {
      const resp = await fetch('/api/send-playbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: emailTo.trim(),
          note: emailNote.trim() || null,
          entries,
          filterPhase,
          filterTrade,
          generatedBy: userName,
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Send failed')
      setEmailSent(true)
      setTimeout(() => {
        setShowEmailModal(false)
        setEmailSent(false)
        setEmailTo('')
        setEmailNote('')
      }, 2000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Send failed'
      alert(`Failed to send: ${message}`)
    }
    setSendingEmail(false)
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
          {([
            { key: 'dashboard', label: 'Dashboard' },
            { key: 'units', label: 'Units' },
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
                  <div style={{ color: 'var(--gray)', fontSize: 13, gridColumn: '1/-1' }}>No unit data yet. <button onClick={() => setTab('units')} style={{ color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0 }}>Go to Units →</button></div>
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
              <button onClick={() => setTab('units')} style={{ flex: 1, background: 'var(--red)', color: '#fff', borderRadius: 10, padding: '14px', textAlign: 'center', fontSize: 14, fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Go to Units</button>
              <button onClick={() => { setTab('library'); setShowLogForm(true) }} style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: 'var(--text)' }}>Log improvement</button>
              <button onClick={() => setTab('phaseplan')} style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: 'var(--text)' }}>Generate spec sheet</button>
              <button onClick={exportExcel} disabled={exportingXlsx} style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {exportingXlsx ? '⏳ Exporting...' : '↓ Export Excel'}
              </button>
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
                <button onClick={() => setShowEmailModal(true)} disabled={filtered.length === 0} style={{ padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', color: 'var(--text)', opacity: filtered.length === 0 ? 0.4 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✉ Send to GC
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

        {/* UNITS TAB */}
        {tab === 'units' && (() => {
          const filteredUnits = units.filter(u => u.phase === unitPhase && (statusFilter === 'all' || u.status === statusFilter))
          const counts = STATUSES.reduce((acc, s) => { acc[s] = units.filter(u => u.phase === unitPhase && u.status === s).length; return acc }, {} as Record<string, number>)
          const selectedUnitPhotos = selectedUnit ? unitPhotos.filter(p => p.unit_id === selectedUnit.id) : []
          return (
            <div>
              {/* Phase + status filter bar */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '0 1rem' }}>
                  <div style={{ display: 'flex' }}>
                    {PHASES.map(p => (
                      <button key={p} onClick={() => setUnitPhase(p)} style={{ padding: '14px 18px', border: 'none', background: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: unitPhase === p ? 'var(--text)' : 'var(--gray)', borderBottom: unitPhase === p ? '2px solid #CC2222' : '2px solid transparent' }}>{p}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6, padding: '8px 0' }}>
                    {['all', ...STATUSES].map(s => (
                      <button key={s} onClick={() => setStatusFilter(s)} style={{ padding: '5px 12px', borderRadius: 99, border: '1px solid', fontSize: 12, cursor: 'pointer', borderColor: statusFilter === s ? '#2B4D3F' : 'var(--border)', background: statusFilter === s ? '#E8F0EC' : 'transparent', color: statusFilter === s ? '#2B4D3F' : 'var(--gray)', fontWeight: statusFilter === s ? 500 : 400 }}>
                        {s === 'all' ? `All (${units.filter(u => u.phase === unitPhase).length})` : `${s} (${counts[s] || 0})`}
                      </button>
                    ))}
                    <button onClick={() => setShowAddUnit(true)} style={{ ...S.btnPrimary, fontSize: 12, padding: '5px 14px' }}>+ Add unit</button>
                  </div>
                </div>
              </div>

              {/* Status summary row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                {STATUSES.map(s => {
                  const st = STATUS_STYLE[s]
                  return (
                    <div key={s} style={{ background: st.bg, border: `1px solid ${st.border}`, borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: st.color, fontWeight: 500 }}>{s}</span>
                      <span style={{ fontSize: 22, fontWeight: 600, color: st.color }}>{counts[s] || 0}</span>
                    </div>
                  )
                })}
              </div>

              {/* Unit grid */}
              {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray)' }}>Loading...</div>
              ) : filteredUnits.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray)', fontSize: 14 }}>No units found.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                  {filteredUnits.map(unit => {
                    const pct = progress(unit.id)
                    const st = STATUS_STYLE[unit.status]
                    const utasks = tasks.filter(t => t.unit_id === unit.id)
                    const photoCount = unitPhotos.filter(p => p.unit_id === unit.id).length
                    return (
                      <div key={unit.id} onClick={() => openUnit(unit)}
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)')}
                        onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div style={{ fontWeight: 600, fontSize: 16 }}>{unit.name}</div>
                          <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 99, background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>{unit.status === 'Under Contract' ? 'Contract' : unit.status}</span>
                        </div>
                        {unit.purchase_price && <div style={{ fontSize: 12, color: 'var(--red)', fontWeight: 500, marginBottom: 4 }}>{fmt(unit.purchase_price)}</div>}
                        {unit.size && <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 4 }}>{unit.size}</div>}
                        {photoCount > 0 && <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 4 }}>{photoCount} photo{photoCount !== 1 ? 's' : ''}</div>}
                        {utasks.length > 0 && (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--gray)', marginBottom: 3 }}>
                              <span>{pct}%</span><span>{utasks.filter(t => t.completed).length}/{utasks.length}</span>
                            </div>
                            <div style={{ background: 'var(--bg)', borderRadius: 99, height: 4, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: pct === 100 ? '#22AA66' : '#CC2222', transition: 'width 0.3s' }} />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Add Unit Modal */}
              {showAddUnit && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
                  <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 400 }}>
                    <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Add unit</div>
                    <div style={{ marginBottom: 10 }}><label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 4 }}>Unit ID</label><input value={newUnitName} onChange={e => setNewUnitName(e.target.value)} placeholder="e.g. A13" style={S.input} autoFocus /></div>
                    <div style={{ marginBottom: 10 }}><label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 4 }}>Phase</label><select value={newUnitPhase} onChange={e => setNewUnitPhase(e.target.value)} style={S.input}>{PHASES.map(p => <option key={p}>{p}</option>)}</select></div>
                    <div style={{ marginBottom: 16 }}><label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 4 }}>Size (optional)</label><input value={newUnitSize} onChange={e => setNewUnitSize(e.target.value)} placeholder="e.g. 10x20" style={S.input} /></div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => setShowAddUnit(false)} style={S.btn}>Cancel</button>
                      <button onClick={addUnit} style={S.btnPrimary}>Add unit</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Unit Detail Drawer */}
              {selectedUnit && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setSelectedUnit(null)}>
                  <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', width: '100%', maxWidth: 560, height: '100%', overflowY: 'auto', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column' }}>
                    {/* Drawer header */}
                    <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ fontSize: 20, fontWeight: 700 }}>{selectedUnit.name}</div>
                          <span style={{ fontSize: 11, color: 'var(--gray)' }}>{selectedUnit.phase}</span>
                        </div>
                        <button onClick={() => setSelectedUnit(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--gray)' }}>×</button>
                      </div>
                      {/* Status */}
                      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                        {STATUSES.map(s => {
                          const st = STATUS_STYLE[s]
                          const active = selectedUnit.status === s
                          return (
                            <button key={s} onClick={() => updateStatus(selectedUnit.id, s)} style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${active ? st.border : 'var(--border)'}`, background: active ? st.bg : 'transparent', color: active ? st.color : 'var(--gray)', fontSize: 12, fontWeight: active ? 500 : 400, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                              {s}
                            </button>
                          )
                        })}
                      </div>
                      {/* Deal info */}
                      <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: 'var(--gray)', marginBottom: 10 }}>DEAL INFO</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                          <div>
                            <label style={{ fontSize: 11, color: 'var(--gray)', display: 'block', marginBottom: 3 }}>Purchase price</label>
                            <div style={{ position: 'relative' }}>
                              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--gray)' }}>$</span>
                              <input value={editPrice} onChange={e => setEditPrice(e.target.value)} placeholder="0" style={{ ...S.input, paddingLeft: 22, fontSize: 13 }} />
                            </div>
                          </div>
                          <div>
                            <label style={{ fontSize: 11, color: 'var(--gray)', display: 'block', marginBottom: 3 }}>Realtor commission (%)</label>
                            <div style={{ position: 'relative' }}>
                              <input value={editCommission} onChange={e => setEditCommission(e.target.value)} placeholder="3" style={{ ...S.input, paddingRight: 28, fontSize: 13 }} />
                              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--gray)' }}>%</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                          <div>
                            <label style={{ fontSize: 11, color: 'var(--gray)', display: 'block', marginBottom: 3 }}>Buyer name</label>
                            <input value={editBuyer} onChange={e => setEditBuyer(e.target.value)} placeholder="Optional" style={{ ...S.input, fontSize: 13 }} />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, color: 'var(--gray)', display: 'block', marginBottom: 3 }}>Close date</label>
                            <input type="date" value={editCloseDate} onChange={e => setEditCloseDate(e.target.value)} style={{ ...S.input, fontSize: 13 }} />
                          </div>
                        </div>
                        {editPrice && editCommission && (
                          <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-dim)', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>
                            Commission: {fmt(parseFloat(editPrice.replace(/,/g, '') || '0') * parseFloat(editCommission || '0') / 100)}
                          </div>
                        )}
                        <button onClick={saveSalesInfo} disabled={savingSales} style={{ ...S.btnPrimary, fontSize: 12, padding: '6px 14px', opacity: savingSales ? 0.6 : 1 }}>
                          {savingSales ? 'Saving...' : 'Save deal info'}
                        </button>
                      </div>
                      {/* Costs & concessions */}
                      {(() => {
                        const costs = unitCosts.filter(c => c.unit_id === selectedUnit.id)
                        const totalCosts = costs.reduce((s, c) => s + c.amount, 0)
                        const price = parseFloat(editPrice.replace(/,/g, '') || '0')
                        const commission = price * parseFloat(editCommission || '0') / 100
                        const net = price - commission - totalCosts
                        const PRESET_COSTS = ['Electrical', 'Plumbing', 'Flooring', 'HVAC', 'Drywall', 'Paint', 'Garage Door', 'Concrete', 'Framing', 'Other']
                        return (
                          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 14px', marginTop: 10 }}>
                            <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: 'var(--gray)', marginBottom: 10 }}>COSTS & CONCESSIONS</div>
                            {costs.map(cost => (
                              <div key={cost.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                                <div style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{cost.label}</div>
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                  <span style={{ position: 'absolute', left: 8, fontSize: 12, color: 'var(--gray)' }}>$</span>
                                  <input type="number" defaultValue={cost.amount} onBlur={e => updateCostAmount(cost.id, parseFloat(e.target.value) || 0)} style={{ ...S.input, width: 110, paddingLeft: 20, fontSize: 13, textAlign: 'right' }} />
                                </div>
                                <button onClick={() => deleteCost(cost.id)} style={{ fontSize: 11, padding: '3px 7px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--gray)', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                              </div>
                            ))}
                            <div style={{ display: 'flex', gap: 6, marginTop: 8, marginBottom: 12 }}>
                              <div style={{ flex: 1, position: 'relative' }}>
                                <input value={newCostLabel} onChange={e => setNewCostLabel(e.target.value)} placeholder="Cost label..." list="cost-presets" style={{ ...S.input, fontSize: 12 }} />
                                <datalist id="cost-presets">{PRESET_COSTS.map(p => <option key={p} value={p} />)}</datalist>
                              </div>
                              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <span style={{ position: 'absolute', left: 8, fontSize: 12, color: 'var(--gray)', zIndex: 1 }}>$</span>
                                <input type="number" value={newCostAmount} onChange={e => setNewCostAmount(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCost()} placeholder="0" style={{ ...S.input, width: 90, paddingLeft: 20, fontSize: 12 }} />
                              </div>
                              <button onClick={addCost} disabled={addingCost || !newCostLabel.trim() || !newCostAmount} style={{ ...S.btnPrimary, fontSize: 12, padding: '6px 12px', opacity: (!newCostLabel.trim() || !newCostAmount) ? 0.4 : 1, flexShrink: 0 }}>+</button>
                            </div>
                            {price > 0 && (
                              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                                {costs.length > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--gray)', marginBottom: 4 }}><span>Total costs</span><span style={{ color: '#DC2626' }}>- {fmt(totalCosts)}</span></div>}
                                {commission > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--gray)', marginBottom: 4 }}><span>Commission ({editCommission}%)</span><span style={{ color: '#DC2626' }}>- {fmt(commission)}</span></div>}
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                                  <span>Net price</span><span style={{ color: net >= 0 ? '#22AA66' : '#DC2626' }}>{fmt(net)}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      {/* Progress */}
                      {tasks.filter(t => t.unit_id === selectedUnit.id).length > 0 && (() => {
                        const pct = progress(selectedUnit.id)
                        const ut = tasks.filter(t => t.unit_id === selectedUnit.id)
                        return (
                          <div style={{ marginTop: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--gray)', marginBottom: 4 }}>
                              <span>Construction progress</span><span>{ut.filter(t => t.completed).length}/{ut.length} · {pct}%</span>
                            </div>
                            <div style={{ background: 'var(--bg)', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: pct === 100 ? '#22AA66' : '#CC2222', transition: 'width 0.4s' }} />
                            </div>
                          </div>
                        )
                      })()}
                      {/* Drawer tabs */}
                      <div style={{ display: 'flex', marginTop: 14, borderBottom: '1px solid var(--border)', marginLeft: -24, marginRight: -24, paddingLeft: 24 }}>
                        {([
                          { key: 'tasks', label: `Tasks (${tasks.filter(t => t.unit_id === selectedUnit.id).length})` },
                          { key: 'photos', label: `Photos (${selectedUnitPhotos.length})` },
                          { key: 'changeorders', label: `Change Orders (${changeOrders.filter(c => c.unit_id === selectedUnit.id).length})` },
                        ] as const).map(t => (
                          <button key={t.key} onClick={() => setDrawerTab(t.key)} style={{ padding: '8px 14px', border: 'none', background: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', color: drawerTab === t.key ? 'var(--text)' : 'var(--gray)', borderBottom: drawerTab === t.key ? '2px solid var(--red)' : '2px solid transparent', marginBottom: -1, whiteSpace: 'nowrap' }}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Tasks tab */}
                    {drawerTab === 'tasks' && (
                      <div style={{ padding: '1.25rem 1.5rem', flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>Tasks</div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {tasks.filter(t => t.unit_id === selectedUnit.id).length === 0 && (
                              <button onClick={addDefaultTasks} style={{ ...S.btn, fontSize: 12, padding: '5px 10px', color: 'var(--red)', borderColor: '#CC2222' }}>Use template</button>
                            )}
                            <button onClick={() => setShowAddTask(true)} style={{ ...S.btnPrimary, fontSize: 12, padding: '5px 12px' }}>+ Task</button>
                          </div>
                        </div>
                        {showAddTask && (
                          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px', marginBottom: 12 }}>
                            <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="Task title" style={{ ...S.input, marginBottom: 8 }} autoFocus onKeyDown={e => e.key === 'Enter' && addTask()} />
                            <input value={newTaskDesc} onChange={e => setNewTaskDesc(e.target.value)} placeholder="Description (optional)" style={{ ...S.input, marginBottom: 8 }} />
                            <input type="date" value={newTaskDue} onChange={e => setNewTaskDue(e.target.value)} style={{ ...S.input, marginBottom: 10 }} />
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button onClick={() => setShowAddTask(false)} style={{ ...S.btn, fontSize: 12, padding: '5px 10px' }}>Cancel</button>
                              <button onClick={addTask} disabled={addingTask || !newTaskTitle.trim()} style={{ ...S.btnPrimary, fontSize: 12, padding: '5px 12px', opacity: !newTaskTitle.trim() ? 0.5 : 1 }}>Save</button>
                            </div>
                          </div>
                        )}
                        {unitTasks(selectedUnit.id).length === 0 && !showAddTask ? (
                          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray)', fontSize: 13 }}>No tasks yet.</div>
                        ) : (
                          unitTasks(selectedUnit.id).map(task => (
                            <div key={task.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 14, marginBottom: 14 }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                <input type="checkbox" checked={task.completed} onChange={e => toggleTask(task.id, e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, accentColor: '#CC2222', flexShrink: 0, cursor: 'pointer' }} />
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 14, fontWeight: 500, color: task.completed ? 'var(--gray)' : 'var(--text)', textDecoration: task.completed ? 'line-through' : 'none' }}>{task.title}</div>
                                  {task.description && <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 2 }}>{task.description}</div>}
                                  {task.due_date && <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>Due {new Date(task.due_date).toLocaleDateString()}</div>}
                                  {task.images && task.images.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                      {task.images.map(img => (
                                        <div key={img.id} style={{ position: 'relative' }}>
                                          <img src={img.image_data} onClick={() => setExpandedImg(img.image_data)} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }} />
                                          <button onClick={() => deleteTaskImage(img.id)} style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: '50%', background: '#991B1B', color: '#fff', border: 'none', fontSize: 9, cursor: 'pointer' }}>x</button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                                    <button onClick={() => imgRefs.current[task.id]?.click()} style={{ fontSize: 11, padding: '3px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--gray)', cursor: 'pointer' }}>+ Photo</button>
                                    <input ref={el => { imgRefs.current[task.id] = el }} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadTaskImage(task.id, f) }} />
                                    <button onClick={() => deleteTask(task.id)} style={{ fontSize: 11, padding: '3px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--gray)', cursor: 'pointer' }}>Delete</button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* Photos tab */}
                    {drawerTab === 'photos' && (
                      <div style={{ padding: '1.25rem 1.5rem', flex: 1 }}>
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ marginBottom: 8 }}>
                            <label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 4 }}>Caption (optional)</label>
                            <input value={newPhotoCaption} onChange={e => setNewPhotoCaption(e.target.value)} placeholder="Describe what you are documenting..." style={{ ...S.input, fontSize: 13 }} />
                          </div>
                          <div onClick={() => unitPhotoRef.current?.click()} style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: '1rem', textAlign: 'center', cursor: 'pointer', color: 'var(--red)', fontSize: 13, background: 'var(--red-dim)', fontWeight: 500 }}>
                            + Upload photos for {selectedUnit.name}
                            <input ref={unitPhotoRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                              onChange={e => { Array.from(e.target.files || []).forEach(f => uploadUnitPhoto(f, newPhotoCaption)); if (unitPhotoRef.current) unitPhotoRef.current.value = ''; setNewPhotoCaption('') }} />
                          </div>
                        </div>
                        {selectedUnitPhotos.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray)', fontSize: 13 }}>No photos yet.</div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                            {selectedUnitPhotos.map(photo => (
                              <div key={photo.id} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                <img src={photo.image_data} onClick={() => setExpandedImg(photo.image_data)} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', cursor: 'pointer', display: 'block' }} />
                                <div style={{ padding: '8px 10px', background: 'var(--surface)' }}>
                                  {photo.caption && <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4 }}>{photo.caption}</div>}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 11, color: 'var(--gray)' }}>{new Date(photo.created_at).toLocaleDateString()}</span>
                                    <button onClick={() => deleteUnitPhoto(photo.id)} style={{ fontSize: 11, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: 'var(--gray)', cursor: 'pointer' }}>Remove</button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Change Orders tab */}
                    {drawerTab === 'changeorders' && (
                      <div style={{ padding: '1.25rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>Change Orders</div>
                          <button onClick={() => setShowCOForm(f => !f)} style={{ ...S.btnPrimary, fontSize: 12, padding: '5px 12px' }}>{showCOForm ? 'Cancel' : '+ Add line item'}</button>
                        </div>
                        {showCOForm && (
                          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 12, marginBottom: 14, border: '1px solid var(--border)' }}>
                            <div style={{ marginBottom: 8 }}><label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 3 }}>Description *</label><input value={newCOTitle} onChange={e => setNewCOTitle(e.target.value)} placeholder="e.g. Upgraded electrical panel" style={S.input} autoFocus /></div>
                            <div style={{ marginBottom: 8 }}><label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 3 }}>Notes</label><input value={newCODesc} onChange={e => setNewCODesc(e.target.value)} placeholder="Additional details..." style={S.input} /></div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                              <div><label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 3 }}>Amount ($)</label><div style={{ position: 'relative' }}><span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--gray)' }}>$</span><input type="number" value={newCOAmount} onChange={e => setNewCOAmount(e.target.value)} onKeyDown={e => e.key === 'Enter' && addChangeOrder()} placeholder="0" style={{ ...S.input, paddingLeft: 20 }} /></div></div>
                              <div><label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 3 }}>Date</label><input type="date" value={newCODate} onChange={e => setNewCODate(e.target.value)} style={S.input} /></div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                              <button onClick={() => { setShowCOForm(false); setNewCOTitle(''); setNewCODesc(''); setNewCOAmount(''); setNewCODate('') }} style={{ ...S.btn, fontSize: 12, padding: '5px 10px' }}>Cancel</button>
                              <button onClick={addChangeOrder} disabled={addingCO || !newCOTitle.trim()} style={{ ...S.btnPrimary, fontSize: 12, padding: '5px 12px', opacity: !newCOTitle.trim() ? 0.5 : 1 }}>Add</button>
                            </div>
                          </div>
                        )}
                        {(() => {
                          const unitCOs = changeOrders.filter(c => c.unit_id === selectedUnit.id)
                          const activeCOs = unitCOs.filter(c => c.status !== 'Rejected')
                          const total = activeCOs.reduce((s, c) => s + c.amount, 0)
                          const includedTotal = activeCOs.filter(c => c.included_in_price).reduce((s, c) => s + c.amount, 0)
                          const addOnTotal = activeCOs.filter(c => !c.included_in_price).reduce((s, c) => s + c.amount, 0)
                          const basePrice = parseFloat((editPrice || '0').replace(/,/g, ''))
                          const finalPrice = basePrice + addOnTotal
                          if (unitCOs.length === 0 && !showCOForm) return <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--gray)', fontSize: 13 }}>No change orders yet.<br /><span style={{ fontSize: 12 }}>Add line items for any scope changes or upgrades.</span></div>
                          return (
                            <>
                              {unitCOs.length > 0 && (
                                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
                                  {unitCOs.map((co, idx) => {
                                    const SC: Record<string, { bg: string; color: string }> = { Pending: { bg: 'rgba(234,179,8,0.1)', color: '#92400E' }, Approved: { bg: 'rgba(34,197,94,0.1)', color: '#166534' }, Rejected: { bg: 'rgba(239,68,68,0.1)', color: '#991B1B' }, Complete: { bg: 'rgba(59,130,246,0.1)', color: '#1E40AF' } }
                                    const sc = SC[co.status] || SC.Pending
                                    return (
                                      <div key={co.id} style={{ padding: '11px 14px', borderBottom: idx < unitCOs.length - 1 ? '1px solid var(--border)' : 'none', opacity: co.status === 'Rejected' ? 0.5 : 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                          <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                              <span style={{ fontSize: 13, fontWeight: 500 }}>{co.title}</span>
                                              {co.amount !== 0 && <span style={{ fontSize: 13, fontWeight: 600, color: co.amount > 0 ? '#DC2626' : '#059669', marginLeft: 'auto' }}>{co.amount > 0 ? '+' : ''}{fmt(co.amount)}</span>}
                                            </div>
                                            {co.description && <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 4 }}>{co.description}</div>}
                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                              <span style={{ fontSize: 10, color: 'var(--gray)' }}>{new Date(co.date).toLocaleDateString()}</span>
                                              <select value={co.status} onChange={e => updateCOStatus(co.id, e.target.value)} style={{ fontSize: 10, padding: '2px 5px', border: '1px solid var(--border)', borderRadius: 5, background: sc.bg, color: sc.color, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                                                {['Pending', 'Approved', 'Rejected', 'Complete'].map(s => <option key={s}>{s}</option>)}
                                              </select>
                                            </div>
                                          </div>
                                          <button onClick={() => deleteCO(co.id)} style={{ fontSize: 11, padding: '2px 5px', border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: 'var(--gray)', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                              {activeCOs.length > 0 && (
                                <div style={{ background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)', padding: '14px 16px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 12 }}><span style={{ color: 'var(--gray)' }}>Total change orders</span><span style={{ fontWeight: 600 }}>{fmt(total)}</span></div>
                                  <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', letterSpacing: '0.07em', color: 'var(--gray)', marginBottom: 8 }}>PRICING TREATMENT</div>
                                  {activeCOs.map(co => (
                                    <div key={co.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                      <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, marginRight: 8 }}>{co.title.length > 28 ? co.title.slice(0, 28) + '…' : co.title} <span style={{ color: 'var(--gray)' }}>({fmt(co.amount)})</span></span>
                                      <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: 8, padding: 2, gap: 2, flexShrink: 0 }}>
                                        {[{ label: 'Included', val: true }, { label: 'Add-on', val: false }].map(opt => (
                                          <button key={opt.label} onClick={() => toggleCOIncluded(co.id, opt.val)} style={{ padding: '3px 9px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: co.included_in_price === opt.val ? (opt.val ? '#059669' : '#CC2222') : 'transparent', color: co.included_in_price === opt.val ? '#fff' : 'var(--gray)', transition: 'all 0.15s' }}>{opt.label}</button>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                  {basePrice > 0 && (
                                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--gray)', marginBottom: 4 }}><span>Base price</span><span>{fmt(basePrice)}</span></div>
                                      {includedTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--gray)', marginBottom: 4 }}><span>Included in price</span><span>—</span></div>}
                                      {addOnTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#DC2626', marginBottom: 4 }}><span>Add-ons</span><span>+ {fmt(addOnTotal)}</span></div>}
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, marginTop: 6, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                                        <span>Final price</span><span style={{ color: addOnTotal > 0 ? '#CC2222' : '#059669' }}>{fmt(finalPrice)}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* Lightbox */}
      {expandedImg && (
        <div onClick={() => setExpandedImg(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: '2rem' }}>
          <button onClick={() => setExpandedImg(null)} style={{ position: 'absolute', top: 20, right: 24, background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', lineHeight: 1 }}>×</button>
          <img src={expandedImg} onClick={e => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} />
        </div>
      )}

      {/* Send to GC modal */}
      {showEmailModal && (
        <div onClick={() => { if (!sendingEmail) setShowEmailModal(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '1.75rem', width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            {emailSent ? (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Playbook sent!</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Send Playbook to GC</div>
                    <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 3 }}>
                      {filtered.length} item{filtered.length !== 1 ? 's' : ''}{filterPhase ? ` · ${filterPhase}` : ''}{filterTrade ? ` · ${filterTrade}` : ''}
                    </div>
                  </div>
                  <button onClick={() => setShowEmailModal(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--gray)', lineHeight: 1 }}>×</button>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 5 }}>GC email address *</label>
                  <input
                    type="email"
                    value={emailTo}
                    onChange={e => setEmailTo(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendPlaybook()}
                    placeholder="gc@contractor.com"
                    autoFocus
                    style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 14, fontFamily: 'DM Sans, sans-serif', color: 'var(--text)', background: 'var(--bg)' }}
                  />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, color: 'var(--gray)', display: 'block', marginBottom: 5 }}>Personal note (optional)</label>
                  <textarea
                    value={emailNote}
                    onChange={e => setEmailNote(e.target.value)}
                    placeholder="e.g. Hey Mike, here's the Phase 2 punch list from the last walkthrough…"
                    rows={3}
                    style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: 'var(--text)', background: 'var(--bg)', resize: 'vertical' }}
                  />
                </div>

                <button
                  onClick={sendPlaybook}
                  disabled={sendingEmail || !emailTo.trim()}
                  style={{ width: '100%', padding: '10px', background: '#CC2222', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: !emailTo.trim() ? 0.5 : 1 }}
                >
                  {sendingEmail ? 'Sending…' : 'Send playbook'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
