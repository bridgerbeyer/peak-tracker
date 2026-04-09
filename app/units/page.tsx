'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

type Unit = { id: number; name: string; phase: string; status: string; size?: string; notes?: string }
type Task = { id: number; unit_id: number; title: string; description?: string; completed: boolean; due_date?: string; images?: TaskImage[] }
type TaskImage = { id: number; task_id: number; image_data: string }

const PHASES = ['Phase 1', 'Phase 2', 'Phase 3']
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
  'Flooring complete', 'Final electrical', 'Final inspection'
]

export default function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [images, setImages] = useState<TaskImage[]>([])
  const [phase, setPhase] = useState('Phase 1')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null)
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')

  // Unit form
  const [showAddUnit, setShowAddUnit] = useState(false)
  const [newUnitName, setNewUnitName] = useState('')
  const [newUnitPhase, setNewUnitPhase] = useState('Phase 1')
  const [newUnitSize, setNewUnitSize] = useState('')

  // Task form
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [newTaskDue, setNewTaskDue] = useState('')
  const [addingTask, setAddingTask] = useState(false)

  // Image expand
  const [expandedImg, setExpandedImg] = useState<string | null>(null)

  const imgRefs = useRef<Record<number, HTMLInputElement | null>>({})

  useEffect(() => {
    const saved = localStorage.getItem('pcs_username')
    if (saved) setUserName(saved)
    fetchAll()
  }, [])

  async function fetchAll() {
    const [u, t, i] = await Promise.all([
      supabase.from('units').select('*').order('name'),
      supabase.from('tasks').select('*').order('created_at'),
      supabase.from('task_images').select('*').order('created_at'),
    ])
    if (u.data) setUnits(u.data as Unit[])
    if (t.data) setTasks(t.data as Task[])
    if (i.data) setImages(i.data as TaskImage[])
    setLoading(false)
  }

  const unitTasks = useCallback((unitId: number) =>
    tasks.filter(t => t.unit_id === unitId).map(t => ({
      ...t, images: images.filter(i => i.task_id === t.id)
    })), [tasks, images])

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

  async function toggleTask(taskId: number, completed: boolean) {
    await supabase.from('tasks').update({ completed }).eq('id', taskId)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed } : t))
  }

  async function addUnit() {
    if (!newUnitName.trim()) return
    const { data } = await supabase.from('units').insert({ name: newUnitName.trim().toUpperCase(), phase: newUnitPhase, status: 'Available', size: newUnitSize.trim() || null }).select().single()
    if (data) { setUnits(prev => [...prev, data as Unit].sort((a, b) => a.name.localeCompare(b.name))) }
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
    const inserts = toAdd.map(title => ({ unit_id: selectedUnit.id, title, completed: false }))
    const { data } = await supabase.from('tasks').insert(inserts).select()
    if (data) setTasks(prev => [...prev, ...(data as Task[])])
  }

  async function deleteTask(taskId: number) {
    await supabase.from('tasks').delete().eq('id', taskId)
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setImages(prev => prev.filter(i => i.task_id !== taskId))
  }

  async function uploadImage(taskId: number, file: File) {
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const imageData = ev.target?.result as string
      const { data } = await supabase.from('task_images').insert({ task_id: taskId, image_data: imageData }).select().single()
      if (data) setImages(prev => [...prev, data as TaskImage])
    }
    reader.readAsDataURL(file)
  }

  async function deleteImage(imageId: number) {
    await supabase.from('task_images').delete().eq('id', imageId)
    setImages(prev => prev.filter(i => i.id !== imageId))
  }

  const filteredUnits = units.filter(u =>
    u.phase === phase && (statusFilter === 'all' || u.status === statusFilter)
  )

  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = units.filter(u => u.phase === phase && u.status === s).length
    return acc
  }, {} as Record<string, number>)

  const S = {
    card: { background: '#fff', border: '1px solid #E2DDD6', borderRadius: 12, padding: '14px', cursor: 'pointer', transition: 'box-shadow 0.15s' } as React.CSSProperties,
    input: { width: '100%', border: '1px solid #E2DDD6', borderRadius: 8, padding: '8px 12px', fontSize: 14, fontFamily: 'DM Sans, sans-serif', color: '#1A1814', background: '#fff' } as React.CSSProperties,
    btn: { padding: '8px 16px', border: '1px solid #E2DDD6', borderRadius: 8, background: 'transparent', fontSize: 13, cursor: 'pointer', color: '#1A1814', fontFamily: 'DM Sans, sans-serif' } as React.CSSProperties,
    btnPrimary: { padding: '8px 18px', border: 'none', borderRadius: 8, background: '#2B4D3F', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' } as React.CSSProperties,
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F3EE', fontFamily: 'DM Sans, sans-serif' }}>
      {/* Header */}
      <header style={{ background: '#2B4D3F', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link href="/" style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>PEAK CONDO STORAGE</Link>
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
            <Link href="/" style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>Knowledge Base</Link>
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>Unit Status</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {userName && <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{userName}</span>}
            <button onClick={() => setShowAddUnit(true)} style={{ ...S.btnPrimary, background: 'rgba(255,255,255,0.15)', fontSize: 12, padding: '6px 14px' }}>+ Add unit</button>
          </div>
        </div>
      </header>

      {/* Phase tabs + filters */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2DDD6' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex' }}>
            {PHASES.map(p => (
              <button key={p} onClick={() => setPhase(p)} style={{ padding: '14px 18px', border: 'none', background: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: phase === p ? '#2B4D3F' : '#7A756E', borderBottom: phase === p ? '2px solid #2B4D3F' : '2px solid transparent' }}>{p}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, padding: '8px 0' }}>
            {['all', ...STATUSES].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{ padding: '5px 12px', borderRadius: 99, border: '1px solid', fontSize: 12, cursor: 'pointer', borderColor: statusFilter === s ? '#2B4D3F' : '#E2DDD6', background: statusFilter === s ? '#E8F0EC' : 'transparent', color: statusFilter === s ? '#2B4D3F' : '#7A756E', fontWeight: statusFilter === s ? 500 : 400 }}>
                {s === 'all' ? `All (${units.filter(u => u.phase === phase).length})` : `${s} (${counts[s] || 0})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>
        {/* Summary bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
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
          <div style={{ textAlign: 'center', padding: '3rem', color: '#7A756E' }}>Loading...</div>
        ) : filteredUnits.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#7A756E', fontSize: 14 }}>No units found. Add one with the button above.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            {filteredUnits.map(unit => {
              const pct = progress(unit.id)
              const st = STATUS_STYLE[unit.status]
              const utasks = tasks.filter(t => t.unit_id === unit.id)
              return (
                <div key={unit.id} onClick={() => setSelectedUnit(unit)} style={{ ...S.card, position: 'relative' }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 16, color: '#1A1814' }}>{unit.name}</div>
                    <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 99, background: st.bg, color: st.color, border: `1px solid ${st.border}`, whiteSpace: 'nowrap' }}>{unit.status === 'Under Contract' ? 'Contract' : unit.status}</span>
                  </div>
                  {unit.size && <div style={{ fontSize: 11, color: '#7A756E', marginBottom: 6 }}>{unit.size}</div>}
                  {utasks.length > 0 && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#7A756E', marginBottom: 3 }}>
                        <span>{pct}%</span>
                        <span>{utasks.filter(t => t.completed).length}/{utasks.length}</span>
                      </div>
                      <div style={{ background: '#F5F3EE', borderRadius: 99, height: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: pct === 100 ? '#059669' : '#2B4D3F', transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Unit Modal */}
      {showAddUnit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 400 }}>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Add unit</div>
            <div style={{ marginBottom: 10 }}><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 4 }}>Unit ID</label><input value={newUnitName} onChange={e => setNewUnitName(e.target.value)} placeholder="e.g. A13" style={S.input} autoFocus /></div>
            <div style={{ marginBottom: 10 }}><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 4 }}>Phase</label><select value={newUnitPhase} onChange={e => setNewUnitPhase(e.target.value)} style={S.input}>{PHASES.map(p => <option key={p}>{p}</option>)}</select></div>
            <div style={{ marginBottom: 16 }}><label style={{ fontSize: 12, color: '#7A756E', display: 'block', marginBottom: 4 }}>Size (optional)</label><input value={newUnitSize} onChange={e => setNewUnitSize(e.target.value)} placeholder="e.g. 10x20" style={S.input} /></div>
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
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: 540, height: '100%', overflowY: 'auto', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column' }}>
            {/* Drawer header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2DDD6', position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{selectedUnit.name}</div>
                  <span style={{ fontSize: 11, color: '#7A756E' }}>{selectedUnit.phase}</span>
                </div>
                <button onClick={() => setSelectedUnit(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#7A756E', lineHeight: 1 }}>×</button>
              </div>
              {/* Status selector */}
              <div style={{ display: 'flex', gap: 6 }}>
                {STATUSES.map(s => {
                  const st = STATUS_STYLE[s]
                  const active = selectedUnit.status === s
                  return (
                    <button key={s} onClick={() => updateStatus(selectedUnit.id, s)} style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${active ? st.border : '#E2DDD6'}`, background: active ? st.bg : 'transparent', color: active ? st.color : '#7A756E', fontSize: 12, fontWeight: active ? 500 : 400, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                      {s}
                    </button>
                  )
                })}
              </div>
              {/* Progress */}
              {tasks.filter(t => t.unit_id === selectedUnit.id).length > 0 && (() => {
                const pct = progress(selectedUnit.id)
                const ut = tasks.filter(t => t.unit_id === selectedUnit.id)
                return (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#7A756E', marginBottom: 4 }}>
                      <span>Construction progress</span>
                      <span>{ut.filter(t => t.completed).length}/{ut.length} tasks · {pct}%</span>
                    </div>
                    <div style={{ background: '#F5F3EE', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: pct === 100 ? '#059669' : '#2B4D3F', transition: 'width 0.4s' }} />
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Tasks */}
            <div style={{ padding: '1.25rem 1.5rem', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Tasks</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {tasks.filter(t => t.unit_id === selectedUnit.id).length === 0 && (
                    <button onClick={addDefaultTasks} style={{ ...S.btn, fontSize: 12, padding: '5px 10px', color: '#2B4D3F', borderColor: '#2B4D3F' }}>Use template</button>
                  )}
                  <button onClick={() => setShowAddTask(true)} style={{ ...S.btnPrimary, fontSize: 12, padding: '5px 12px' }}>+ Task</button>
                </div>
              </div>

              {/* Add task form */}
              {showAddTask && (
                <div style={{ background: '#F5F3EE', borderRadius: 10, padding: '12px', marginBottom: 12 }}>
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
                <div style={{ textAlign: 'center', padding: '2rem', color: '#7A756E', fontSize: 13 }}>
                  No tasks yet. Add one or use the template.
                </div>
              ) : (
                unitTasks(selectedUnit.id).map(task => (
                  <div key={task.id} style={{ borderBottom: '1px solid #F5F3EE', paddingBottom: 14, marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <input type="checkbox" checked={task.completed} onChange={e => toggleTask(task.id, e.target.checked)}
                        style={{ width: 18, height: 18, marginTop: 2, accentColor: '#2B4D3F', flexShrink: 0, cursor: 'pointer' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: task.completed ? '#7A756E' : '#1A1814', textDecoration: task.completed ? 'line-through' : 'none' }}>{task.title}</div>
                        {task.description && <div style={{ fontSize: 12, color: '#7A756E', marginTop: 2 }}>{task.description}</div>}
                        {task.due_date && <div style={{ fontSize: 11, color: '#7A756E', marginTop: 2 }}>Due {new Date(task.due_date).toLocaleDateString()}</div>}

                        {/* Images */}
                        {task.images && task.images.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            {task.images.map(img => (
                              <div key={img.id} style={{ position: 'relative' }}>
                                <img src={img.image_data} onClick={() => setExpandedImg(img.image_data)}
                                  style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #E2DDD6', cursor: 'pointer' }} />
                                <button onClick={() => deleteImage(img.id)} style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: '50%', background: '#991B1B', color: '#fff', border: 'none', fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>x</button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Upload photo */}
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button onClick={() => imgRefs.current[task.id]?.click()} style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #E2DDD6', borderRadius: 6, background: 'transparent', color: '#7A756E', cursor: 'pointer' }}>+ Photo</button>
                          <input ref={el => { imgRefs.current[task.id] = el }} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(task.id, f) }} />
                          <button onClick={() => deleteTask(task.id)} style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #E2DDD6', borderRadius: 6, background: 'transparent', color: '#7A756E', cursor: 'pointer' }}>Delete</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {expandedImg && (
        <div onClick={() => setExpandedImg(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, cursor: 'pointer', padding: '2rem' }}>
          <img src={expandedImg} style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }} />
        </div>
      )}
    </div>
  )
}
