import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

interface Certificate {
  id: number; certificate_id: string; recipient_name: string;
  recipient_email?: string; participant_id?: string; event_name: string;
  event_date: string; event_description?: string; status: string;
  issued_date: string; sha256_hash?: string; is_verified: boolean;
  blockchain_tx_hash?: string;
}

const CertificateWallet: React.FC = () => {
  const navigate = useNavigate();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [filter, setFilter]             = useState<'all' | 'active' | 'revoked'>('all');

  useEffect(() => { fetchCertificates(); }, []);

  const fetchCertificates = async () => {
    try {
      setLoading(true); setError('');
      const r = await api.get('/certificates/my-certificates');
      setCertificates(r.data);
    } catch (err: any) { setError(err.response?.data?.detail || 'Failed to load your certificates'); }
    finally { setLoading(false); }
  };

  const downloadCertificate = async (certId: string) => {
    try {
      setDownloadingId(certId);
      const r = await api.get(`/certificates/download/${certId}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a'); a.href = url;
      a.setAttribute('download', `certificate_${certId}.pdf`);
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) { setError(err.response?.data?.detail || 'Download failed'); }
    finally { setDownloadingId(null); }
  };

  const total   = certificates.length;
  const active  = certificates.filter(c => c.status?.toLowerCase() === 'active').length;
  const onChain = certificates.filter(c => c.blockchain_tx_hash).length;
  const displayed = filter === 'all' ? certificates : certificates.filter(c => c.status?.toLowerCase() === filter);

  const statusBadge = (s: string) => {
    const st = s?.toLowerCase();
    if (st === 'active')  return { bg:'rgba(16,185,129,0.12)', color:'#34d399', border:'rgba(16,185,129,0.3)', icon:'fa-circle-check', label:'Active' };
    if (st === 'revoked') return { bg:'rgba(239,68,68,0.12)',  color:'#f87171', border:'rgba(239,68,68,0.3)',  icon:'fa-ban',          label:'Revoked' };
    return                       { bg:'rgba(100,116,139,0.12)',color:'#94a3b8', border:'rgba(100,116,139,0.3)',icon:'fa-circle',       label: s?.toUpperCase() || 'Unknown' };
  };

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--grad-bg)' }}>
      <div style={{ textAlign:'center' }}>
        <span className="ds-spinner ds-spinner-lg" style={{ margin:'0 auto 16px' }} />
        <p style={{ color:'var(--c-text-3)', fontSize:'0.9rem' }}>Loading your wallet…</p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'var(--grad-bg)', padding:'32px 16px', fontFamily:'var(--font-body)' }}>
      <div style={{ maxWidth: 1100, margin:'0 auto' }}>

        {/* ── Hero ── */}
        <motion.div initial={{ opacity:0, y:-12 }} animate={{ opacity:1, y:0 }}
          style={{
            borderRadius: 24, padding:'28px 32px', marginBottom:28,
            background:'linear-gradient(135deg,rgba(99,102,241,0.18) 0%,rgba(167,139,250,0.12) 50%,rgba(6,182,212,0.1) 100%)',
            border:'1px solid rgba(99,102,241,0.25)',
            display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:20,
          }}>
          <div style={{ display:'flex', alignItems:'center', gap:18 }}>
            <div style={{ width:56,height:56,borderRadius:18,flexShrink:0,background:'linear-gradient(135deg,#6366f1,#a78bfa)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 8px 24px rgba(99,102,241,0.45)' }}>
              <i className="fas fa-wallet" style={{ color:'#fff', fontSize:'1.4rem' }} />
            </div>
            <div>
              <h1 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.5rem', color:'var(--c-text)', marginBottom:3 }}>
                My Certificate Wallet
              </h1>
              <p style={{ color:'var(--c-text-2)', fontSize:'0.875rem', margin:0 }}>
                All your verified credentials, secured on the blockchain
              </p>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display:'flex', gap:28 }}>
            {[
              { n: total,   label:'Total',    color:'var(--c-text)',    icon:'fa-layer-group' },
              { n: active,  label:'Active',   color:'var(--c-green)',   icon:'fa-circle-check' },
              { n: onChain, label:'On-Chain', color:'var(--c-violet)',  icon:'fa-link' },
            ].map(s => (
              <div key={s.label} style={{ textAlign:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'center', marginBottom:2 }}>
                  <i className={`fas ${s.icon}`} style={{ color: s.color, fontSize:'0.85rem' }} />
                  <span style={{ fontFamily:'var(--font-display)', fontSize:'1.6rem', fontWeight:800, color: s.color, lineHeight:1 }}>{s.n}</span>
                </div>
                <div style={{ fontSize:'0.72rem', color:'var(--c-text-3)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Error ── */}
        {error && (
          <div style={{ marginBottom:16, padding:'12px 16px', borderRadius:12, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', color:'#fca5a5', fontSize:'0.875rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span><i className="fas fa-triangle-exclamation" style={{ marginRight:8 }} />{error}</span>
            <button onClick={() => setError('')} style={{ background:'none',border:'none',color:'#f87171',cursor:'pointer' }}><i className="fas fa-xmark" /></button>
          </div>
        )}

        {/* ── Filter tabs ── */}
        {total > 0 && (
          <div style={{ display:'flex', gap:8, marginBottom:24 }}>
            {(['all','active','revoked'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{
                  padding:'8px 18px', borderRadius:100, border:'none', cursor:'pointer',
                  fontFamily:'var(--font-body)', fontSize:'0.82rem', fontWeight:700,
                  transition:'all 0.2s',
                  background: filter === f ? 'linear-gradient(135deg,#6366f1,#818cf8)' : 'rgba(255,255,255,0.05)',
                  color: filter === f ? '#fff' : 'var(--c-text-3)',
                  boxShadow: filter === f ? '0 4px 14px rgba(99,102,241,0.4)' : 'none',
                }}>
                {f === 'all' ? `All (${total})` : f === 'active' ? `Active (${active})` : `Revoked (${total - active})`}
              </button>
            ))}
          </div>
        )}

        {/* ── Empty state ── */}
        {displayed.length === 0 && !loading && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
            style={{ textAlign:'center', padding:'64px 24px', borderRadius:24, background:'rgba(15,12,42,0.6)', border:'1px solid var(--c-border)' }}>
            <i className="fas fa-inbox" style={{ fontSize:'3.5rem', color:'var(--c-text-3)', marginBottom:20, display:'block' }} />
            <h3 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.25rem', color:'var(--c-text)', marginBottom:8 }}>
              {filter === 'all' ? 'Your wallet is empty' : `No ${filter} certificates`}
            </h3>
            <p style={{ color:'var(--c-text-3)', fontSize:'0.875rem', marginBottom:24, maxWidth:380, margin:'0 auto 24px' }}>
              Certificates issued to your email appear here automatically. You can also verify and claim them from the dashboard.
            </p>
            <motion.button className="ds-btn ds-btn-primary" onClick={() => navigate('/dashboard')}
              whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}>
              <i className="fas fa-shield-check" /> Verify &amp; Claim Certificates
            </motion.button>
          </motion.div>
        )}

        {/* ── Certificate grid ── */}
        {displayed.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:18 }}>
            {displayed.map((cert, idx) => {
              const expanded = expandedId === cert.certificate_id;
              const badge = statusBadge(cert.status);
              const isRevoked = cert.status?.toLowerCase() === 'revoked';

              return (
                <motion.div
                  key={cert.id}
                  initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay: idx*0.05 }}
                  className="ds-card ds-card-lift"
                  style={{ overflow:'hidden', opacity: isRevoked ? 0.75 : 1 }}
                >
                  {/* Top colour stripe */}
                  <div style={{ height:3, background: isRevoked ? 'linear-gradient(90deg,#ef4444,#f87171)' : 'linear-gradient(90deg,#6366f1,#a78bfa,#06b6d4)' }} />

                  <div style={{ padding:20 }}>
                    {/* Header row */}
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
                      <div style={{ width:42,height:42,borderRadius:12,flexShrink:0,background:'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(167,139,250,0.15))',border:'1px solid rgba(99,102,241,0.25)',display:'flex',alignItems:'center',justifyContent:'center' }}>
                        <i className="fas fa-graduation-cap" style={{ color:'var(--c-indigo-lt)', fontSize:'1rem' }} />
                      </div>
                      <span style={{ display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:100,fontSize:'0.72rem',fontWeight:700,background:badge.bg,color:badge.color,border:`1px solid ${badge.border}` }}>
                        <i className={`fas ${badge.icon}`} style={{ fontSize:'0.65rem' }} />
                        {badge.label}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1rem', color:'var(--c-text)', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {cert.event_name}
                    </h3>
                    <p style={{ color:'#a5b4fc', fontSize:'0.875rem', fontWeight:600, marginBottom:10, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {cert.recipient_name}
                    </p>

                    {/* Meta chips */}
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
                      <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:'0.72rem', color:'var(--c-text-3)' }}>
                        <i className="fas fa-calendar-days" />
                        {new Date(cert.issued_date).toLocaleDateString()}
                      </span>
                      {cert.blockchain_tx_hash && (
                        <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:'0.72rem', color:'var(--c-violet)', fontWeight:700 }}>
                          <i className="fas fa-link" /> On-Chain
                        </span>
                      )}
                      {cert.is_verified && (
                        <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:'0.72rem', color:'var(--c-green)', fontWeight:700 }}>
                          <i className="fas fa-circle-check" /> Verified
                        </span>
                      )}
                    </div>

                    {/* ID code */}
                    <code style={{ display:'block', fontSize:'0.7rem', color:'rgba(165,180,252,0.65)', background:'rgba(0,0,0,0.3)', padding:'7px 10px', borderRadius:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:14 }}>
                      {cert.certificate_id}
                    </code>

                    {/* Expanded details */}
                    <AnimatePresence>
                      {expanded && (
                        <motion.div
                          initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }}
                          style={{ overflow:'hidden', borderTop:'1px solid var(--c-border)', paddingTop:12, marginBottom:12 }}
                        >
                          {[
                            { l:'Email',      v: cert.recipient_email },
                            { l:'Event Date', v: cert.event_date },
                            { l:'SHA-256',    v: cert.sha256_hash ? cert.sha256_hash.substring(0,24)+'…' : null },
                            { l:'TX Hash',    v: cert.blockchain_tx_hash ? cert.blockchain_tx_hash.substring(0,24)+'…' : null },
                          ].filter(r => r.v).map(({ l, v }) => (
                            <div key={l} className="ds-info-pair" style={{ paddingTop:6, paddingBottom:6 }}>
                              <span className="ds-info-key">{l}</span>
                              <code style={{ fontSize:'0.72rem', color:'#a5b4fc', maxWidth:'60%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v}</code>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Action buttons */}
                    <div style={{ display:'flex', gap:8 }}>
                      <motion.button
                        className="ds-btn ds-btn-primary ds-btn-sm" style={{ flex:1 }}
                        onClick={() => downloadCertificate(cert.certificate_id)}
                        disabled={downloadingId === cert.certificate_id || isRevoked}
                        whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}>
                        {downloadingId === cert.certificate_id
                          ? <><span className="ds-spinner" /> …</>
                          : <><i className="fas fa-download" /> Download</>}
                      </motion.button>
                      <button
                        onClick={() => setExpandedId(expanded ? null : cert.certificate_id)}
                        className="ds-btn ds-btn-ghost ds-btn-sm" style={{ padding:'7px 12px' }}>
                        <i className={`fas ${expanded ? 'fa-chevron-up' : 'fa-chevron-down'}`} />
                      </button>
                      <button
                        onClick={() => navigate(`/verify/${cert.certificate_id}`)}
                        className="ds-btn ds-btn-ghost ds-btn-sm" style={{ padding:'7px 12px' }}>
                        <i className="fas fa-eye" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:24 }}>
          <button className="ds-btn ds-btn-ghost ds-btn-sm" onClick={fetchCertificates}>
            <i className="fas fa-rotate-right" /> Refresh
          </button>
          <button className="ds-btn ds-btn-ghost ds-btn-sm" onClick={() => navigate('/dashboard')}>
            <i className="fas fa-shield-check" /> Verify More
          </button>
        </div>
      </div>
    </div>
  );
};

export default CertificateWallet;
