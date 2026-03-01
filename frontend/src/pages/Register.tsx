import { AnimatePresence, motion } from 'framer-motion';
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

const ROLES = [
  {
    value: 'user',
    label: 'Student',
    icon: 'fa-user-graduate',
    color: '#06b6d4',
    bg: 'rgba(6,182,212,0.12)',
    border: 'rgba(6,182,212,0.35)',
    desc: 'Register to access your certificates and wallet',
    approval: 'Needs Admin approval',
  },
  {
    value: 'admin',
    label: 'Admin',
    icon: 'fa-shield-halved',
    color: '#6366f1',
    bg: 'rgba(99,102,241,0.12)',
    border: 'rgba(99,102,241,0.35)',
    desc: 'Manage events, issue & verify certificates',
    approval: 'Needs Super Admin approval',
  },
  {
    value: 'super_admin',
    label: 'Super Admin',
    icon: 'fa-crown',
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.12)',
    border: 'rgba(167,139,250,0.35)',
    desc: 'Full system access — manage users, admins & certs',
    approval: 'Auto-approved, login immediately',
  },
];

const Register: React.FC = () => {
  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm_password: '', role: 'user' });
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw]   = useState(false);
  const navigate = useNavigate();

  const selectedRole = ROLES.find(r => r.value === form.role)!;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (form.password !== form.confirm_password) { setError('Passwords do not match'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const res = await api.post('/auth/register', {
        full_name: form.full_name,
        email:     form.email,
        password:  form.password,
        role:      form.role,
      });
      const msg = res.data?.message || 'Account created successfully!';
      setSuccess(msg);
      if (form.role === 'super_admin') {
        setTimeout(() => navigate('/login'), 2000);
      } else {
        setTimeout(() => navigate('/login'), 3000);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed. Please try again.');
    } finally { setLoading(false); }
  };

  const strength = (() => {
    const p = form.password;
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8)          s++;
    if (/[A-Z]/.test(p))        s++;
    if (/[0-9]/.test(p))        s++;
    if (/[^a-zA-Z0-9]/.test(p)) s++;
    return s;
  })();
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength];
  const strengthColor = ['', '#ef4444', '#f59e0b', '#06b6d4', '#10b981'][strength];

  return (
    <div style={{
      minHeight:'100vh', display:'flex', background:'var(--grad-bg)',
      fontFamily:'var(--font-body)', overflow:'hidden', position:'relative',
    }}>
      {/* Background orbs */}
      <div style={{ position:'absolute',width:500,height:500,borderRadius:'50%',background:'radial-gradient(circle,rgba(167,139,250,0.1) 0%,transparent 70%)',top:-150,right:-150,pointerEvents:'none' }} />
      <div style={{ position:'absolute',width:350,height:350,borderRadius:'50%',background:'radial-gradient(circle,rgba(6,182,212,0.08) 0%,transparent 70%)',bottom:-80,left:-80,pointerEvents:'none' }} />

      {/* ── FORM ── */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 24px' }}>
        <motion.div
          initial={{ opacity:0, y:28 }}
          animate={{ opacity:1, y:0 }}
          transition={{ duration:0.55 }}
          style={{ width:'100%', maxWidth:500 }}
        >
          {/* Mobile brand */}
          <div className="d-lg-none" style={{ textAlign:'center', marginBottom:28 }}>
            <div style={{ width:52,height:52,borderRadius:16,background:'linear-gradient(135deg,#6366f1,#a78bfa)',display:'inline-flex',alignItems:'center',justifyContent:'center',boxShadow:'0 8px 24px rgba(99,102,241,0.4)',marginBottom:12 }}>
              <i className="fas fa-certificate" style={{ color:'#fff', fontSize:'1.3rem' }} />
            </div>
            <h2 style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:'1.5rem',color:'var(--c-text)',marginBottom:0 }}>
              Cert<span style={{ color:'var(--c-indigo)' }}>Chain</span>
            </h2>
          </div>

          <div style={{ marginBottom:28 }}>
            <h2 className="ds-h2" style={{ marginBottom:8 }}>Create your account</h2>
            <p style={{ color:'var(--c-text-2)', fontSize:'0.9rem', margin:0 }}>
              Already registered?{' '}
              <Link to="/login" style={{ color:'var(--c-indigo-lt)', fontWeight:600, textDecoration:'none' }}>Sign in</Link>
            </p>
          </div>

          {/* Alerts */}
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity:0,height:0 }} animate={{ opacity:1,height:'auto' }} exit={{ opacity:0,height:0 }}
                style={{ background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:10,padding:'12px 16px',marginBottom:20,display:'flex',alignItems:'flex-start',gap:10,color:'#fca5a5',fontSize:'0.875rem',lineHeight:1.5 }}>
                <i className="fas fa-circle-xmark" style={{ flexShrink:0, marginTop:2 }} /> <span>{error}</span>
              </motion.div>
            )}
            {success && (
              <motion.div initial={{ opacity:0,height:0 }} animate={{ opacity:1,height:'auto' }} exit={{ opacity:0,height:0 }}
                style={{ background:'rgba(16,185,129,0.1)',border:'1px solid rgba(16,185,129,0.3)',borderRadius:10,padding:'12px 16px',marginBottom:20,display:'flex',alignItems:'flex-start',gap:10,color:'#6ee7b7',fontSize:'0.875rem',lineHeight:1.5 }}>
                <i className="fas fa-circle-check" style={{ flexShrink:0, marginTop:2 }} /> <span>{success}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="ds-card" style={{ padding:32 }}>
            <form onSubmit={handleSubmit}>

              {/* Role selector */}
              <div style={{ marginBottom:22 }}>
                <label className="ds-label">I am registering as</label>
                <div style={{ display:'flex', gap:8 }}>
                  {ROLES.map(r => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setForm(p => ({ ...p, role: r.value }))}
                      style={{
                        flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6,
                        padding:'12px 8px', borderRadius:12, cursor:'pointer',
                        background: form.role === r.value ? r.bg : 'rgba(255,255,255,0.03)',
                        border: form.role === r.value ? `1.5px solid ${r.border}` : '1.5px solid rgba(255,255,255,0.07)',
                        transition:'all 0.2s',
                      }}
                    >
                      <div style={{
                        width:32, height:32, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center',
                        background: form.role === r.value ? r.bg : 'rgba(255,255,255,0.05)',
                        border: form.role === r.value ? `1px solid ${r.border}` : '1px solid rgba(255,255,255,0.08)',
                      }}>
                        <i className={`fas ${r.icon}`} style={{ color: form.role === r.value ? r.color : 'var(--c-text-3)', fontSize:'0.85rem' }} />
                      </div>
                      <span style={{ fontSize:'0.78rem', fontWeight:700, color: form.role === r.value ? r.color : 'var(--c-text-3)' }}>{r.label}</span>
                    </button>
                  ))}
                </div>
                {/* Role description */}
                <div style={{
                  marginTop:10, padding:'10px 14px', borderRadius:8,
                  background: selectedRole.bg, border: `1px solid ${selectedRole.border}`,
                  display:'flex', justifyContent:'space-between', alignItems:'center', gap:8,
                }}>
                  <span style={{ fontSize:'0.78rem', color:'var(--c-text-2)' }}>{selectedRole.desc}</span>
                  <span style={{
                    fontSize:'0.7rem', fontWeight:700, whiteSpace:'nowrap',
                    color: selectedRole.value === 'super_admin' ? '#34d399' : '#fbbf24',
                    background: selectedRole.value === 'super_admin' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                    border: selectedRole.value === 'super_admin' ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(245,158,11,0.3)',
                    padding:'3px 8px', borderRadius:6,
                  }}>
                    {selectedRole.approval}
                  </span>
                </div>
              </div>

              {/* Full name */}
              <div style={{ marginBottom:16 }}>
                <label className="ds-label">Full name</label>
                <div className="ds-input-wrap has-icon">
                  <i className="fas fa-user ds-input-icon" />
                  <input className="ds-input" type="text" name="full_name"
                    value={form.full_name} onChange={handleChange}
                    placeholder="Jane Smith" required />
                </div>
              </div>

              {/* Email */}
              <div style={{ marginBottom:16 }}>
                <label className="ds-label">Email address</label>
                <div className="ds-input-wrap has-icon">
                  <i className="fas fa-envelope ds-input-icon" />
                  <input className="ds-input" type="email" name="email"
                    value={form.email} onChange={handleChange}
                    placeholder="you@university.edu" required />
                </div>
              </div>

              {/* Password */}
              <div style={{ marginBottom:16 }}>
                <label className="ds-label">Password</label>
                <div className="ds-input-wrap has-icon" style={{ position:'relative' }}>
                  <i className="fas fa-lock ds-input-icon" />
                  <input className="ds-input" type={showPw ? 'text':'password'} name="password"
                    value={form.password} onChange={handleChange}
                    placeholder="Min 8 characters" style={{ paddingRight:44 }} required />
                  <button type="button" onClick={() => setShowPw(p => !p)}
                    style={{ position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'var(--c-text-3)',cursor:'pointer',fontSize:'0.9rem' }}>
                    <i className={`fas ${showPw ? 'fa-eye-slash':'fa-eye'}`} />
                  </button>
                </div>
                {form.password && (
                  <div style={{ marginTop:8 }}>
                    <div style={{ display:'flex', gap:4, marginBottom:4 }}>
                      {[1,2,3,4].map(i => (
                        <div key={i} style={{ flex:1, height:3, borderRadius:2, background: i <= strength ? strengthColor : 'rgba(255,255,255,0.1)', transition:'background 0.3s' }} />
                      ))}
                    </div>
                    <span style={{ fontSize:'0.72rem', color: strengthColor, fontWeight:600 }}>{strengthLabel}</span>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div style={{ marginBottom:24 }}>
                <label className="ds-label">Confirm password</label>
                <div className="ds-input-wrap has-icon">
                  <i className="fas fa-lock-keyhole ds-input-icon" />
                  <input className="ds-input" type="password" name="confirm_password"
                    value={form.confirm_password} onChange={handleChange}
                    placeholder="Repeat your password" required />
                </div>
              </div>

              <motion.button type="submit" className="ds-btn ds-btn-primary ds-btn-lg"
                style={{ width:'100%' }} whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }} disabled={loading}>
                {loading ? (<><span className="ds-spinner" /> Creating account…</>) : (<><i className="fas fa-user-plus" /> Create Account</>)}
              </motion.button>
            </form>

            {/* DID note */}
            <div style={{ marginTop:20, padding:'12px 14px', borderRadius:10, background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.2)', display:'flex', alignItems:'flex-start', gap:10 }}>
              <i className="fas fa-fingerprint" style={{ color:'var(--c-indigo-lt)', fontSize:'1rem', marginTop:2, flexShrink:0 }} />
              <div>
                <div style={{ fontSize:'0.78rem', fontWeight:700, color:'#a5b4fc', marginBottom:2 }}>DID Identity Generated Automatically</div>
                <div style={{ fontSize:'0.75rem', color:'var(--c-text-3)', lineHeight:1.5 }}>
                  A unique cryptographic identity (Decentralized ID) is created for you on registration. This proves you are the rightful owner of any certificate issued to your email.
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <motion.div
        initial={{ opacity:0, x:40 }}
        animate={{ opacity:1, x:0 }}
        transition={{ duration:0.7 }}
        className="d-none d-lg-flex"
        style={{
          flex:'0 0 42%', flexDirection:'column', justifyContent:'center', padding:'60px 56px',
          borderLeft:'1px solid rgba(255,255,255,0.05)',
          background:'linear-gradient(160deg,rgba(99,102,241,0.06) 0%,rgba(6,182,212,0.04) 100%)',
        }}
      >
        <div style={{ marginBottom:40 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
            <div style={{ width:44,height:44,borderRadius:14,background:'linear-gradient(135deg,#6366f1,#a78bfa)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 8px 24px rgba(99,102,241,0.45)' }}>
              <i className="fas fa-certificate" style={{ color:'#fff', fontSize:'1.1rem' }} />
            </div>
            <span style={{ fontFamily:'var(--font-display)',fontSize:'1.3rem',fontWeight:800,color:'var(--c-text)' }}>
              Cert<span style={{ color:'var(--c-indigo)' }}>Chain</span>
            </span>
          </div>
          <h2 className="ds-h2" style={{ marginBottom:12 }}>
            Choose your role,<br />
            <span className="ds-grad-text">start verifying.</span>
          </h2>
          <p className="ds-lead" style={{ fontSize:'1rem' }}>
            Each role gives you the right tools. Students hold their credentials, Admins manage them, Super Admins govern the system.
          </p>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {ROLES.map((r, i) => (
            <motion.div key={r.value}
              initial={{ opacity:0, x:24 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.2+i*0.1 }}
              style={{ display:'flex', alignItems:'flex-start', gap:14, padding:'14px 18px', borderRadius:14, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)' }}
            >
              <div style={{ width:36,height:36,borderRadius:10,flexShrink:0, background:r.bg, display:'flex',alignItems:'center',justifyContent:'center', border:`1px solid ${r.border}` }}>
                <i className={`fas ${r.icon}`} style={{ color: r.color, fontSize:'0.9rem' }} />
              </div>
              <div>
                <div style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.95rem',color:'var(--c-text)',marginBottom:3 }}>{r.label}</div>
                <div style={{ fontSize:'0.8rem',color:'var(--c-text-3)',lineHeight:1.5 }}>{r.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default Register;
