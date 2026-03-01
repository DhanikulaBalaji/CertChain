import { AnimatePresence, motion } from 'framer-motion';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';

const TRUST = [
  { icon: 'fa-link',         label: 'Blockchain Anchored' },
  { icon: 'fa-fingerprint',  label: 'DID Identity Layer' },
  { icon: 'fa-shield-check', label: 'Tamper-Proof Certs' },
  { icon: 'fa-qrcode',       label: 'QR Instant Verify' },
];

const Login: React.FC = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [showPw, setShowPw]     = useState(false);

  const { login } = useAuth();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(formData.email, formData.password);
      // Navigation is handled by PublicRoute re-render once auth state updates
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (detail === 'Account is pending approval') {
        setError('Your account is pending approval. Please wait for an admin to approve it before logging in.');
      } else if (detail === 'Account is inactive') {
        setError('Your account has been deactivated. Please contact an administrator.');
      } else if (detail) {
        setError(detail);
      } else {
        setError('Incorrect email or password. Please try again.');
      }
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', background: 'var(--grad-bg)',
      fontFamily: 'var(--font-body)', overflow: 'hidden', position: 'relative',
    }}>
      {/* Background orbs */}
      <div style={{ position:'absolute',width:600,height:600,borderRadius:'50%',background:'radial-gradient(circle,rgba(99,102,241,0.12) 0%,transparent 70%)',top:-200,left:-200,pointerEvents:'none' }} />
      <div style={{ position:'absolute',width:400,height:400,borderRadius:'50%',background:'radial-gradient(circle,rgba(6,182,212,0.1) 0%,transparent 70%)',bottom:-100,right:-100,pointerEvents:'none' }} />

      {/* ── LEFT PANEL ─── */}
      <motion.div
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        style={{
          flex: '0 0 48%', display: 'flex', flexDirection: 'column',
          justifyContent: 'center', padding: '60px 64px',
          borderRight: '1px solid rgba(255,255,255,0.05)',
          background: 'linear-gradient(160deg,rgba(99,102,241,0.08) 0%,rgba(167,139,250,0.04) 50%,rgba(6,182,212,0.04) 100%)',
        }}
        className="d-none d-lg-flex"
      >
        {/* Brand */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ display:'flex', alignItems:'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: 'linear-gradient(135deg,#6366f1,#a78bfa)',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 8px 24px rgba(99,102,241,0.45)',
            }}>
              <i className="fas fa-certificate" style={{ color:'#fff', fontSize: '1.2rem' }} />
            </div>
            <span style={{ fontFamily:'var(--font-display)', fontSize:'1.4rem', fontWeight:800, color:'var(--c-text)' }}>
              Cert<span style={{ color:'var(--c-indigo)' }}>Chain</span>
            </span>
          </div>

          <h1 className="ds-h1" style={{ marginBottom: 16 }}>
            Verify Once,<br />
            <span className="ds-grad-text">Trust Forever.</span>
          </h1>
          <p className="ds-lead" style={{ maxWidth: 380, marginBottom: 0 }}>
            A blockchain-backed academic credential platform. Every certificate is cryptographically sealed and publicly verifiable.
          </p>
        </div>

        {/* Trust badges */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 12, marginBottom: 48 }}>
          {TRUST.map((t, i) => (
            <motion.div
              key={t.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.08 }}
              style={{
                display:'flex', alignItems:'center', gap: 10,
                padding:'12px 16px', borderRadius:12,
                background:'rgba(255,255,255,0.04)',
                border:'1px solid rgba(255,255,255,0.07)',
              }}
            >
              <i className={`fas ${t.icon}`} style={{ color:'var(--c-indigo-lt)', fontSize:'1rem', width:18, textAlign:'center' }} />
              <span style={{ fontSize:'0.82rem', fontWeight:500, color:'var(--c-text-2)' }}>{t.label}</span>
            </motion.div>
          ))}
        </div>

        {/* Stats strip */}
        <div style={{ display:'flex', gap: 32 }}>
          {[['10K+','Certificates Issued'],['100%','Blockchain Verified'],['3-Layer','Security Stack']].map(([n,l]) => (
            <div key={l}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:'1.5rem', fontWeight:800, color:'var(--c-text)' }}>{n}</div>
              <div style={{ fontSize:'0.75rem', color:'var(--c-text-3)', marginTop:2 }}>{l}</div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── RIGHT PANEL — FORM ─── */}
      <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 24px' }}>
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          style={{ width: '100%', maxWidth: 440 }}
        >
          {/* Mobile brand */}
          <div className="d-lg-none" style={{ textAlign:'center', marginBottom: 32 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 16,
              background: 'linear-gradient(135deg,#6366f1,#a78bfa)',
              display:'inline-flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 8px 24px rgba(99,102,241,0.4)', marginBottom: 12,
            }}>
              <i className="fas fa-certificate" style={{ color:'#fff', fontSize:'1.3rem' }} />
            </div>
            <h2 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.5rem', color:'var(--c-text)', marginBottom:0 }}>
              Cert<span style={{ color:'var(--c-indigo)' }}>Chain</span>
            </h2>
          </div>

          <div style={{ marginBottom: 32 }}>
            <h2 className="ds-h2" style={{ marginBottom: 8 }}>Sign in to your account</h2>
            <p style={{ color:'var(--c-text-2)', fontSize:'0.9rem', margin:0 }}>
              Don't have an account?{' '}
              <Link to="/register" style={{ color:'var(--c-indigo-lt)', fontWeight:600, textDecoration:'none' }}>
                Create one free
              </Link>
            </p>
          </div>

          {/* Form card */}
          <div className="ds-card" style={{ padding: 32 }}>
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity:0, height:0 }}
                  animate={{ opacity:1, height:'auto' }}
                  exit={{ opacity:0, height:0 }}
                  style={{
                    background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)',
                    borderRadius: 10, padding:'12px 16px', marginBottom: 20,
                    display:'flex', alignItems:'flex-start', gap: 10,
                    color:'#fca5a5', fontSize:'0.875rem', lineHeight: 1.5,
                  }}
                >
                  <i className="fas fa-circle-xmark" style={{ flexShrink:0, marginTop: 2 }} />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 20 }}>
                <label className="ds-label">Email address</label>
                <div className="ds-input-wrap has-icon">
                  <i className="fas fa-envelope ds-input-icon" />
                  <input
                    className="ds-input"
                    type="email" name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="you@university.edu"
                    autoComplete="email" required
                  />
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 7 }}>
                  <label className="ds-label" style={{ margin:0 }}>Password</label>
                  <Link to="/forgot-password" style={{ fontSize:'0.78rem', color:'var(--c-indigo-lt)', textDecoration:'none', fontWeight:500 }}>
                    Forgot password?
                  </Link>
                </div>
                <div className="ds-input-wrap has-icon" style={{ position:'relative' }}>
                  <i className="fas fa-lock ds-input-icon" />
                  <input
                    className="ds-input"
                    type={showPw ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    style={{ paddingRight: 46 }}
                    autoComplete="current-password" required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(p => !p)}
                    style={{
                      position:'absolute', right:14, top:'50%', transform:'translateY(-50%)',
                      background:'none', border:'none', color:'var(--c-text-3)',
                      cursor:'pointer', fontSize:'0.9rem', padding:4,
                    }}
                  >
                    <i className={`fas ${showPw ? 'fa-eye-slash' : 'fa-eye'}`} />
                  </button>
                </div>
              </div>

              <motion.button
                type="submit"
                className="ds-btn ds-btn-primary ds-btn-lg"
                style={{ width:'100%' }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={loading}
              >
                {loading ? (
                  <><span className="ds-spinner" /> Signing in…</>
                ) : (
                  <><i className="fas fa-arrow-right-to-bracket" /> Sign In</>
                )}
              </motion.button>
            </form>
          </div>

          <p style={{ textAlign:'center', fontSize:'0.78rem', color:'var(--c-text-3)', marginTop: 20 }}>
            <i className="fas fa-shield-halved" style={{ color:'var(--c-green)', marginRight: 6 }} />
            Protected by blockchain cryptography &amp; DID verification
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
