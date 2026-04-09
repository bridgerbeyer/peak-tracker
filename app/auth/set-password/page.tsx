'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

export default function SetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSetPassword() {
    if (!password.trim()) { setError('Please enter a password.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }
    window.location.href = '/'
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F3EE', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.14em', color: '#7A756E', marginBottom: 10 }}>PEAK CONDO STORAGE</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#1A1814', marginBottom: 6 }}>Set your password</div>
          <div style={{ fontSize: 14, color: '#7A756E' }}>Choose a password to complete your account setup</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2DDD6', padding: '2rem' }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, color: '#7A756E', display: 'block', marginBottom: 6 }}>New password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" autoFocus style={{ width: '100%', border: '1px solid #E2DDD6', borderRadius: 8, padding: '10px 14px', fontSize: 14, fontFamily: 'DM Sans, sans-serif', color: '#1A1814', background: '#fff', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, color: '#7A756E', display: 'block', marginBottom: 6 }}>Confirm password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSetPassword()} placeholder="Re-enter password" style={{ width: '100%', border: '1px solid #E2DDD6', borderRadius: 8, padding: '10px 14px', fontSize: 14, fontFamily: 'DM Sans, sans-serif', color: '#1A1814', background: '#fff', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {error && <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#991B1B', marginBottom: 14 }}>{error}</div>}
          <button onClick={handleSetPassword} disabled={loading} style={{ width: '100%', padding: '11px', background: loading ? '#A3B8B0' : '#2B4D3F', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: loading ? 'default' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            {loading ? 'Setting password...' : 'Set password and sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
