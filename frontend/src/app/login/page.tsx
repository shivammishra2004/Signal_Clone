"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/AuthContext';
import { useToast } from '@/ToastContext';
import { api, ApiError, saveToken } from '@/api';

export default function LoginPage() {
  const [step, setStep] = useState<'IDENTIFIER' | 'OTP'>('IDENTIFIER');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { checkAuth } = useAuth();
  const toast = useToast();

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      toast.error('Please enter a username or phone number.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/register', { identifier, display_name: identifier });
      if (res?.demo_otp) setDemoOtp(res.demo_otp);
      setStep('OTP');
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 400 && err.data?.detail === "Identifier already registered") {
        // User exists — go to OTP step (re-register to get a fresh OTP)
        try {
          const res2 = await api.post('/auth/register', { identifier, display_name: identifier });
          if (res2?.demo_otp) setDemoOtp(res2.demo_otp);
        } catch { /* ignore duplicate error */ }
        setStep('OTP');
      } else {
        toast.error(err.message || 'Failed to send OTP.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) { toast.error('Please enter the OTP.'); return; }
    setLoading(true);
    try {
      const res = await api.post('/auth/verify', { identifier, otp });
      if (res?.access_token) saveToken(res.access_token);
      await checkAuth();
      toast.success('Welcome back! Loading your messages...');
      router.push('/app');
    } catch (err: any) {
      toast.error(err.message || 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container flex-center" style={{
      background: 'radial-gradient(ellipse 80% 80% at 10% 20%, rgba(79,128,255,0.08) 0%, transparent 60%), radial-gradient(ellipse 60% 60% at 90% 80%, rgba(160,96,255,0.06) 0%, transparent 60%), var(--bg-primary)'
    }}>
      {/* Decorative orbs */}
      <div style={{ position: 'fixed', top: '-15%', left: '-10%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,128,255,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-15%', right: '-10%', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(160,96,255,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div className="animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '1rem' }}>
        {/* Logo area */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '22px',
            background: 'linear-gradient(135deg, var(--accent-primary), #6B7FFF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2rem', margin: '0 auto 1.25rem',
            boxShadow: '0 8px 32px rgba(79,128,255,0.35)'
          }}>
            💬
          </div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 700, background: 'linear-gradient(135deg, var(--text-primary), var(--text-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.4rem' }}>
            Signal Clone
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Private, real-time encrypted messaging</p>
        </div>

        <div className="glass-panel modal-content-pad" style={{}}>
          {/* Step indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.75rem' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)' }} />
            <div style={{ height: '1px', flex: 1, background: step === 'OTP' ? 'var(--accent-primary)' : 'var(--border-color)', transition: 'background 0.4s' }} />
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: step === 'OTP' ? 'var(--accent-primary)' : 'var(--border-color)', transition: 'background 0.4s' }} />
          </div>

          {step === 'IDENTIFIER' ? (
            <form onSubmit={handleSendOtp} className="animate-fade-in">
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1.25rem', fontWeight: 600 }}>
                Step 1 — Identify yourself
              </p>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Username or Phone Number
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. alice or +1-555-0100"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  disabled={loading}
                  autoFocus
                  autoComplete="username"
                />
              </div>
              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '0.9rem' }} disabled={loading}>
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                    Sending...
                  </span>
                ) : 'Continue →'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="animate-fade-in">
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1.25rem', fontWeight: 600 }}>
                Step 2 — Verify your identity
              </p>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Verification Code
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Enter 123456"
                  value={otp}
                  onChange={e => setOtp(e.target.value)}
                  disabled={loading}
                  autoFocus
                  maxLength={6}
                  style={{ letterSpacing: '0.3em', fontSize: '1.2rem', textAlign: 'center' }}
                />
                <div style={{ marginTop: '0.6rem', padding: '0.6rem 0.8rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem' }}>🔒</span>
                  {demoOtp ? (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Your demo OTP is: <strong style={{ color: 'var(--accent-primary)', letterSpacing: '0.1em' }}>{demoOtp}</strong></span>
                  ) : (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Check the OTP sent to your device</span>
                  )}
                </div>
              </div>
              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '0.9rem' }} disabled={loading}>
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                    Verifying...
                  </span>
                ) : '🔓 Verify & Sign In'}
              </button>
              <button
                type="button"
                onClick={() => { setStep('IDENTIFIER'); setOtp(''); }}
                className="btn-ghost"
                style={{ width: '100%', marginTop: '0.75rem', textAlign: 'center', color: 'var(--text-muted)' }}
              >
                ← Back to identifier
              </button>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Signed in as <strong style={{ color: 'var(--text-secondary)' }}>{identifier || '...'}</strong>
        </p>
      </div>
    </div>
  );
}
