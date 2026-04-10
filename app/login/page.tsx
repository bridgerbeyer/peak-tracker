'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'reset' | 'set-password'>('login')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('set-password')
      if (event === 'SIGNED_IN' && mode !== 'set-password') window.location.href = '/'
    })
  }, [])

  async function handleLogin() {
    if (!email.trim() || !password.trim()) { setError('Please enter your email and password.'); return }
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(error.message)
    else window.location.href = '/'
    setLoading(false)
  }

  async function handleReset() {
    if (!email.trim()) { setError('Please enter your email address.'); return }
    setLoading(true); setError(''); setMessage('')
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/login`
    })
    if (error) setError(error.message)
    else setMessage('Check your email for a password reset link.')
    setLoading(false)
  }

  async function handleSetPassword() {
    if (!newPassword.trim()) { setError('Please enter a password.'); return }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return }
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) { setError(error.message); setLoading(false); return }
    window.location.href = '/'
  }

  const inp: React.CSSProperties = {
    width: '100%', border: '1px solid #2E2E2E', borderRadius: 8,
    padding: '11px 14px', fontSize: 14, fontFamily: 'DM Sans, sans-serif',
    color: '#F5F5F5', background: '#1A1A1A', outline: 'none', boxSizing: 'border-box'
  }

  return (
    <div style={{ minHeight: '100vh', background: '#111111', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <img src="/logo.png" alt="Peak Condo Storage" style={{ height: 52, width: 'auto', marginBottom: 20 }} />
          <div style={{ fontSize: 18, fontWeight: 600, color: '#F5F5F5', marginBottom: 6 }}>
            {mode === 'login' ? 'Sign in' : mode === 'reset' ? 'Reset password' : 'Set your password'}
          </div>
          <div style={{ fontSize: 13, color: '#8A8A8A' }}>
            {mode === 'login' ? 'Construction Knowledge Base' : mode === 'reset' ? 'Enter your email to receive a reset link' : 'Choose a password to complete setup'}
          </div>
        </div>

        <div style={{ background: '#1A1A1A', borderRadius: 14, border: '1px solid #2E2E2E', padding: '2rem' }}>
          {mode === 'login' && (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: '#8A8A8A', display: 'block', marginBottom: 6, letterSpacing: '0.02em' }}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="you@example.com" autoFocus style={inp} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, color: '#8A8A8A', display: 'block', marginBottom: 6, letterSpacing: '0.02em' }}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="••••••••" style={inp} />
              </div>
              {error && <div style={{ background: 'rgba(204,34,34,0.12)', border: '1px solid rgba(204,34,34,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#E03030', marginBottom: 14 }}>{error}</div>}
              <button onClick={handleLogin} disabled={loading} style={{ width: '100%', padding: '12px', background: loading ? '#661111' : '#CC2222', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.02em' }}>
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button onClick={() => { setMode('reset'); setError(''); setMessage('') }} style={{ fontSize: 13, color: '#8A8A8A', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Forgot password?</button>
              </div>
            </>
          )}

          {mode === 'reset' && (
            <>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, color: '#8A8A8A', display: 'block', marginBottom: 6 }}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleReset()} placeholder="you@example.com" autoFocus style={inp} />
              </div>
              {error && <div style={{ background: 'rgba(204,34,34,0.12)', border: '1px solid rgba(204,34,34,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#E03030', marginBottom: 14 }}>{error}</div>}
              {message && <div style={{ background: 'rgba(34,170,102,0.1)', border: '1px solid rgba(34,170,102,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#22AA66', marginBottom: 14 }}>{message}</div>}
              <button onClick={handleReset} disabled={loading} style={{ width: '100%', padding: '12px', background: '#CC2222', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button onClick={() => { setMode('login'); setError(''); setMessage('') }} style={{ fontSize: 13, color: '#8A8A8A', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Back to sign in</button>
              </div>
            </>
          )}

          {mode === 'set-password' && (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: '#8A8A8A', display: 'block', marginBottom: 6 }}>New password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 8 characters" autoFocus style={inp} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, color: '#8A8A8A', display: 'block', marginBottom: 6 }}>Confirm password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSetPassword()} placeholder="Re-enter password" style={inp} />
              </div>
              {error && <div style={{ background: 'rgba(204,34,34,0.12)', border: '1px solid rgba(204,34,34,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#E03030', marginBottom: 14 }}>{error}</div>}
              <button onClick={handleSetPassword} disabled={loading} style={{ width: '100%', padding: '12px', background: '#CC2222', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {loading ? 'Setting password...' : 'Set password and sign in'}
              </button>
            </>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#555555' }}>
          Access is by invitation only · Peak Condo Storage
        </div>
      </div>
    </div>
  )
}
