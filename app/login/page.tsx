'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'reset'>('login')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const supabase = createClient()

  async function handleLogin() {
    if (!email.trim() || !password.trim()) { setError('Please enter your email and password.'); return }
    setLoading(true); setError(''); setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(error.message)
    else window.location.href = '/'
    setLoading(false)
  }

  async function handleReset() {
    if (!email.trim()) { setError('Please enter your email address.'); return }
    setLoading(true); setError(''); setMessage('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback`
    })
    if (error) setError(error.message)
    else setMessage('Check your email for a password reset link.')
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F3EE', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.14em', color: '#7A756E', marginBottom: 10 }}>PEAK CONDO STORAGE</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#1A1814', marginBottom: 6 }}>{mode === 'login' ? 'Sign in' : 'Reset password'}</div>
          <div style={{ fontSize: 14, color: '#7A756E' }}>{mode === 'login' ? 'Construction Knowledge Base' : 'We will send a reset link to your email'}</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2DDD6', padding: '2rem' }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, color: '#7A756E', display: 'block', marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleReset())} placeholder="you@example.com" autoFocus style={{ width: '100%', border: '1px solid #E2DDD6', borderRadius: 8, padding: '10px 14px', fontSize: 14, fontFamily: 'DM Sans, sans-serif', color: '#1A1814', background: '#fff', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {mode === 'login' && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, color: '#7A756E', display: 'block', marginBottom: 6 }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="••••••••" style={{ width: '100%', border: '1px solid #E2DDD6', borderRadius: 8, padding: '10px 14px', fontSize: 14, fontFamily: 'DM Sans, sans-serif', color: '#1A1814', background: '#fff', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          )}
          {error && <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#991B1B', marginBottom: 14 }}>{error}</div>}
          {message && <div style={{ background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#065F46', marginBottom: 14 }}>{message}</div>}
          <button onClick={mode === 'login' ? handleLogin : handleReset} disabled={loading} style={{ width: '100%', padding: '11px', background: loading ? '#A3B8B0' : '#2B4D3F', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: loading ? 'default' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Send reset link'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            {mode === 'login' ? (
              <button onClick={() => { setMode('reset'); setError(''); setMessage('') }} style={{ fontSize: 13, color: '#7A756E', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Forgot password?</button>
            ) : (
              <button onClick={() => { setMode('login'); setError(''); setMessage('') }} style={{ fontSize: 13, color: '#7A756E', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Back to sign in</button>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: '#7A756E' }}>Access is by invitation only.</div>
      </div>
    </div>
  )
}
