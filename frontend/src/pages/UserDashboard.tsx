import { AnimatePresence, motion } from 'framer-motion';
import React, { useRef, useState } from 'react';
import QRScannerEmbedded from '../components/QRScannerEmbedded';
import api from '../services/api';
import { useAuth } from '../services/AuthContext';

interface CertificateVerification {
  certificate_id: string; recipient_name: string; event_name: string;
  event_id: string; event_creator?: string; event_date?: string;
  issued_date: string; issued_at: string; status: string;
  is_verified?: boolean; sha256_hash?: string; blockchain_tx_hash?: string;
  verification_score: number;
}
interface VerificationResult {
  success: boolean; certificate?: CertificateVerification;
  message: string; fraud_indicators?: string[]; fraud_detected?: boolean;
  verification_details?: { metadata_integrity: boolean; hash_verification: boolean; database_match: boolean; blockchain_verification: boolean; };
  verification_status?: string; ownership_pending?: boolean; ownership_verified?: boolean;
  challenge?: string; claimed_to_wallet?: boolean;
}

/* ── tiny primitives ─────────────────────────────────────────────────────── */
const CheckRow: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <div className="ds-check-row">
    <span>{label}</span>
    <span className={ok ? 'ds-check-pass' : 'ds-check-fail'}>
      <span className={`ds-check-icon ${ok ? 'ds-check-icon-pass' : 'ds-check-icon-fail'}`}>{ok ? '✓' : '✗'}</span>
      {ok ? 'Pass' : 'Fail'}
    </span>
  </div>
);

/* ── modal overlay ───────────────────────────────────────────────────────── */
const Modal: React.FC<{ show: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }> = ({ show, onClose, title, children, wide }) => (
  <AnimatePresence>
    {show && (
      <motion.div className="ds-overlay-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.div
          className="ds-overlay"
          style={{ maxWidth: wide ? 780 : 480 }}
          initial={{ scale: 0.93, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93, y: 16 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="ds-overlay-header">
            <span className="ds-overlay-title">{title}</span>
            <button className="ds-overlay-close" onClick={onClose}><i className="fas fa-xmark" /></button>
          </div>
          <div className="ds-overlay-body">{children}</div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

/* ══════════════════════════════════════════════════════════════════════════ */
const UserDashboard: React.FC = () => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [certificateId, setCertificateId]           = useState('');
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading]                       = useState(false);
  const [error, setError]                           = useState('');
  const [success, setSuccess]                       = useState('');
  const [showQRScanner, setShowQRScanner]           = useState(false);
  const [showModal, setShowModal]                   = useState(false);
  const [uploadedFile, setUploadedFile]             = useState<File | null>(null);
  const [activeMethod, setActiveMethod]             = useState<'id' | 'qr' | 'upload'>('id');
  const [completingOwnership, setCompletingOwnership] = useState(false);
  const [ownershipResult, setOwnershipResult]       = useState<{ success: boolean; verification_status?: string; message?: string } | null>(null);
  const [claimingWallet, setClaimingWallet]         = useState(false);
  const [claimedToWallet, setClaimedToWallet]       = useState(false);

  /* ── handlers ──────────────────────────────────────────────────────────── */
  const handleCertificateVerification = async () => {
    if (!certificateId.trim()) { setError('Please enter a certificate ID'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const r = await api.post('/certificates/verify-public', { certificate_id: certificateId.trim(), verification_type: 'id_lookup' });
      setVerificationResult(r.data); setOwnershipResult(null);
      setClaimedToWallet(!!r.data.claimed_to_wallet); setShowModal(true);
      if (r.data.fraud_detected) await notifySuperAdminFraud(r.data);
    } catch (err: any) { setError(err.response?.data?.detail || 'Certificate verification failed'); }
    finally { setLoading(false); }
  };

  const handleQRScan = (result: string) => {
    setShowQRScanner(false); setActiveMethod('qr');
    try {
      const d = JSON.parse(result);
      if (d.certificate_id) { setCertificateId(d.certificate_id); verifyQRData(d); }
      else setError('QR code does not contain a valid certificate ID');
    } catch {
      if (result.startsWith('CERT-') || result.match(/^CERT-[A-Z0-9]+$/i)) { setCertificateId(result); verifyCertificateById(result); }
      else { const m = result.match(/\/verify\/([A-Z0-9-]+)/i); if (m) { setCertificateId(m[1]); verifyCertificateById(m[1]); } else setError('Invalid QR code format'); }
    }
  };

  const verifyQRData = async (qrData: any) => {
    setLoading(true);
    try {
      const r = await api.post('/certificates/verify-public', { certificate_id: qrData.certificate_id, qr_metadata: qrData, verification_type: 'qr_scan' });
      setVerificationResult(r.data); setOwnershipResult(null); setClaimedToWallet(!!r.data.claimed_to_wallet); setShowModal(true);
      if (r.data.fraud_detected) await notifySuperAdminFraud(r.data);
    } catch { setError('QR code verification failed'); } finally { setLoading(false); }
  };

  const verifyCertificateById = async (id: string) => {
    setLoading(true);
    try {
      const r = await api.post('/certificates/verify-public', { certificate_id: id, verification_type: 'id_lookup' });
      setVerificationResult(r.data); setOwnershipResult(null); setClaimedToWallet(!!r.data.claimed_to_wallet); setShowModal(true);
    } catch { setError('Certificate verification failed'); } finally { setLoading(false); }
  };

  const handleClaimCertificate = async () => {
    if (!verificationResult?.certificate?.certificate_id) return;
    setClaimingWallet(true);
    try {
      await api.post('/certificates/claim', { certificate_id: verificationResult.certificate.certificate_id });
      setClaimedToWallet(true); setSuccess('Certificate added to your wallet!');
    } catch (err: any) { setError(err.response?.data?.detail || 'Could not add to wallet.'); } finally { setClaimingWallet(false); }
  };

  const handleCompleteOwnershipVerification = async () => {
    if (!verificationResult?.certificate?.certificate_id || !verificationResult.challenge) return;
    setCompletingOwnership(true); setOwnershipResult(null);
    try {
      const r = await api.post('/certificates/complete-ownership-verification', { certificate_id: verificationResult.certificate.certificate_id, challenge: verificationResult.challenge });
      setOwnershipResult({ success: r.data.success, verification_status: r.data.verification_status, message: r.data.message });
    } catch (err: any) { setOwnershipResult({ success: false, message: err.response?.data?.detail || 'Failed' }); }
    finally { setCompletingOwnership(false); }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!['application/pdf','image/jpeg','image/jpg','image/png'].includes(file.type)) { setError('Please upload a PDF, JPG, or PNG file'); return; }
    setUploadedFile(file); setActiveMethod('upload'); setLoading(true); setError('');
    const fd = new FormData(); fd.append('file', file); fd.append('verification_type', 'file_upload');
    try {
      const r = await api.post('/certificates/verify-file-public', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setVerificationResult(r.data); setOwnershipResult(null); setClaimedToWallet(!!r.data.claimed_to_wallet); setShowModal(true);
      if (r.data.fraud_detected) await notifySuperAdminFraud(r.data);
    } catch (err: any) { setError('File verification failed: ' + (err.response?.data?.detail || 'Unknown error')); }
    finally { setLoading(false); }
  };

  const handleDownloadCertificate = async (certId: string) => {
    try {
      setLoading(true);
      const r = await api.get(`/certificates/download/${certId}`, { responseType: 'blob', timeout: 30000 });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a'); a.href = url; a.setAttribute('download', `certificate_${certId}.pdf`);
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
      setSuccess('Certificate downloaded successfully');
    } catch (err: any) { setError('Download failed: ' + (err.response?.data?.detail || err.message)); }
    finally { setLoading(false); }
  };

  const notifySuperAdminFraud = async (fd: VerificationResult) => {
    try { await api.post('/admin/fraud-alert', { certificate_id: fd.certificate?.certificate_id, fraud_indicators: fd.fraud_indicators, detection_method: activeMethod, detected_by: user?.email }); }
    catch { /* silent */ }
  };

  const resetForm = () => { setCertificateId(''); setVerificationResult(null); setUploadedFile(null); setError(''); setSuccess(''); if (fileInputRef.current) fileInputRef.current.value = ''; };
  const score = verificationResult?.certificate?.verification_score ?? 0;
  const scoreColor = score >= 80 ? 'var(--c-green)' : score >= 60 ? 'var(--c-amber)' : 'var(--c-red)';

  const METHODS = [
    { id: 'id' as const,     icon: 'fa-id-card',         label: 'Certificate ID',    desc: 'Enter ID for instant lookup' },
    { id: 'qr' as const,     icon: 'fa-qrcode',          label: 'QR Scan',           desc: 'Scan the QR on the certificate' },
    { id: 'upload' as const, icon: 'fa-file-arrow-up',   label: 'Upload File',       desc: 'PDF or image OCR + hash check' },
  ];

  /* ── render ─────────────────────────────────────────────────────────────── */
  return (
    <div style={{ minHeight:'100vh', background:'var(--grad-bg)', padding:'32px 16px', fontFamily:'var(--font-body)' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>

        {/* ── Hero strip ── */}
        <motion.div
          initial={{ opacity:0, y:-12 }} animate={{ opacity:1, y:0 }}
          style={{
            borderRadius: 20, padding: '24px 28px', marginBottom: 28,
            background: 'linear-gradient(135deg,rgba(99,102,241,0.18) 0%,rgba(167,139,250,0.12) 50%,rgba(6,182,212,0.1) 100%)',
            border: '1px solid rgba(99,102,241,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
          }}
        >
          <div style={{ display:'flex', alignItems:'center', gap: 16 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 16, flexShrink: 0,
              background: 'linear-gradient(135deg,#6366f1,#a78bfa)',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow: '0 8px 24px rgba(99,102,241,0.45)',
            }}>
              <i className="fas fa-shield-halved" style={{ color:'#fff', fontSize:'1.3rem' }} />
            </div>
            <div>
              <h1 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.4rem', color:'var(--c-text)', marginBottom:2 }}>
                Certificate Verification
              </h1>
              <p style={{ color:'var(--c-text-2)', fontSize:'0.875rem', margin:0 }}>
                Welcome back, <span style={{ color:'#a5b4fc', fontWeight:700 }}>{user?.full_name || user?.email}</span>
              </p>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap: 8, padding:'8px 16px', borderRadius:100, background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.3)' }}>
            <span className="ds-dot-live" />
            <span style={{ fontSize:'0.8rem', fontWeight:700, color:'#34d399' }}>Blockchain Secured</span>
          </div>
        </motion.div>

        {/* ── Alerts ── */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
              style={{ marginBottom:16, padding:'12px 16px', borderRadius:12, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', color:'#fca5a5', fontSize:'0.875rem', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
              <span><i className="fas fa-triangle-exclamation" style={{ marginRight:8 }} />{error}</span>
              <button onClick={() => setError('')} style={{ background:'none',border:'none',color:'#f87171',cursor:'pointer',fontSize:'1rem' }}><i className="fas fa-xmark" /></button>
            </motion.div>
          )}
          {success && (
            <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
              style={{ marginBottom:16, padding:'12px 16px', borderRadius:12, background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.3)', color:'#6ee7b7', fontSize:'0.875rem', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
              <span><i className="fas fa-circle-check" style={{ marginRight:8 }} />{success}</span>
              <button onClick={() => setSuccess('')} style={{ background:'none',border:'none',color:'#34d399',cursor:'pointer',fontSize:'1rem' }}><i className="fas fa-xmark" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Method tabs ── */}
        <div className="ds-method-tabs" style={{ marginBottom: 16 }}>
          {METHODS.map(m => (
            <button key={m.id}
              className={`ds-method-tab${activeMethod === m.id ? ' active' : ''}`}
              onClick={() => { setActiveMethod(m.id); if (m.id === 'qr') setShowQRScanner(true); }}
            >
              <i className={`fas ${m.icon}`} />
              <span className="d-none d-sm-inline">{m.label}</span>
            </button>
          ))}
        </div>

        {/* ── Method panel ── */}
        <motion.div
          key={activeMethod}
          initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.22 }}
          className="ds-card" style={{ padding: 28, marginBottom: 16 }}
        >
          {activeMethod === 'id' && (
            <>
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.1rem', color:'var(--c-text)', marginBottom:4, display:'flex', alignItems:'center', gap:10 }}>
                  <i className="fas fa-id-card" style={{ color:'var(--c-indigo-lt)' }} /> Certificate ID Lookup
                </h2>
                <p style={{ color:'var(--c-text-3)', fontSize:'0.85rem', margin:0 }}>Enter the certificate ID printed on the document (e.g. CERT-ABC123456789)</p>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <input className="ds-input" type="text" value={certificateId}
                  onChange={e => setCertificateId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCertificateVerification()}
                  placeholder="CERT-ABC123456789" style={{ flex:1 }}
                />
                <motion.button className="ds-btn ds-btn-primary" style={{ flexShrink:0 }}
                  onClick={handleCertificateVerification} disabled={loading || !certificateId.trim()}
                  whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}>
                  {loading ? <><span className="ds-spinner" /> Verifying…</> : <><i className="fas fa-magnifying-glass" /> Verify</>}
                </motion.button>
              </div>
            </>
          )}

          {activeMethod === 'qr' && (
            <>
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.1rem', color:'var(--c-text)', marginBottom:4, display:'flex', alignItems:'center', gap:10 }}>
                  <i className="fas fa-qrcode" style={{ color:'#34d399' }} /> QR Code Scanner
                </h2>
                <p style={{ color:'var(--c-text-3)', fontSize:'0.85rem', margin:0 }}>Scan the QR code printed on the certificate to verify it instantly</p>
              </div>
              <motion.button className="ds-btn ds-btn-success" onClick={() => setShowQRScanner(true)}
                whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}>
                <i className="fas fa-camera" /> Open Camera Scanner
              </motion.button>
              {loading && (
                <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:16, color:'var(--c-text-2)', fontSize:'0.875rem' }}>
                  <span className="ds-spinner" /> Verifying certificate…
                </div>
              )}
            </>
          )}

          {activeMethod === 'upload' && (
            <>
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.1rem', color:'var(--c-text)', marginBottom:4, display:'flex', alignItems:'center', gap:10 }}>
                  <i className="fas fa-file-arrow-up" style={{ color:'var(--c-violet)' }} /> Upload Certificate File
                </h2>
                <p style={{ color:'var(--c-text-3)', fontSize:'0.85rem', margin:0 }}>Upload a PDF or image — data is extracted via OCR and the hash is verified</p>
              </div>
              <label style={{ cursor:'pointer', display:'block' }}>
                <input type="file" ref={fileInputRef} accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileUpload} disabled={loading} style={{ display:'none' }} />
                <div style={{
                  border: '2px dashed rgba(99,102,241,0.3)', borderRadius: 16, padding:'32px 20px',
                  textAlign:'center', cursor:'pointer', transition:'border-color 0.2s',
                  background: uploadedFile ? 'rgba(99,102,241,0.06)' : 'transparent',
                }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor='rgba(99,102,241,0.6)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor='rgba(99,102,241,0.3)')}
                >
                  <i className="fas fa-cloud-arrow-up" style={{ fontSize:'2rem', color:'var(--c-indigo-lt)', marginBottom:10, display:'block' }} />
                  <p style={{ color:'var(--c-text)', fontWeight:600, margin:'0 0 4px' }}>Click to choose file</p>
                  <p style={{ color:'var(--c-text-3)', fontSize:'0.78rem', margin:0 }}>PDF, JPG, PNG supported</p>
                  {uploadedFile && (
                    <p style={{ color:'#a5b4fc', fontSize:'0.85rem', marginTop:10, fontWeight:600 }}>
                      <i className="fas fa-paperclip" style={{ marginRight:6 }} />{uploadedFile.name}
                    </p>
                  )}
                </div>
              </label>
              {loading && (
                <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:16, color:'var(--c-text-2)', fontSize:'0.875rem' }}>
                  <span className="ds-spinner" /> Analyzing certificate…
                </div>
              )}
            </>
          )}
        </motion.div>

        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button className="ds-btn ds-btn-ghost ds-btn-sm" onClick={resetForm}>
            <i className="fas fa-rotate-left" /> Reset
          </button>
        </div>
      </div>

      {/* ── QR Scanner modal ── */}
      <Modal show={showQRScanner} onClose={() => setShowQRScanner(false)} title="Scan Certificate QR Code">
        <QRScannerEmbedded onScan={handleQRScan} />
      </Modal>

      {/* ── Verification Results modal ── */}
      <Modal
        show={showModal}
        onClose={() => { setShowModal(false); setOwnershipResult(null); setClaimedToWallet(false); }}
        title={verificationResult?.success ? 'Certificate Verified' : 'Verification Results'}
        wide
      >
        {verificationResult && (
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

            {/* Status banner */}
            <div style={{
              display:'flex', alignItems:'flex-start', gap:16, padding:'20px',
              borderRadius:16,
              background: verificationResult.success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${verificationResult.success ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}>
              <div style={{
                width:48, height:48, borderRadius:14, flexShrink:0,
                display:'flex', alignItems:'center', justifyContent:'center',
                background: verificationResult.success ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
              }}>
                <i className={`fas ${verificationResult.success ? 'fa-shield-check' : 'fa-triangle-exclamation'}`}
                  style={{ color: verificationResult.success ? 'var(--c-green)' : 'var(--c-red)', fontSize:'1.3rem' }} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{
                  fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.1rem',
                  color: verificationResult.success ? '#34d399' : '#f87171', marginBottom:4,
                }}>
                  {verificationResult.success ? 'Certificate Authenticity Confirmed' : 'Verification Failed'}
                </div>
                <div style={{ color:'var(--c-text-2)', fontSize:'0.875rem' }}>{verificationResult.message}</div>
              </div>
              {verificationResult.certificate?.verification_score !== undefined && (
                <div style={{ textAlign:'center', flexShrink:0 }}>
                  <div style={{ fontFamily:'var(--font-display)', fontSize:'1.8rem', fontWeight:800, color: scoreColor, lineHeight:1 }}>
                    {verificationResult.certificate.verification_score}
                  </div>
                  <div style={{ fontSize:'0.7rem', color:'var(--c-text-3)', marginTop:2 }}>/ 100</div>
                </div>
              )}
            </div>

            {verificationResult.certificate && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                {/* Certificate info */}
                <div style={{ padding:16, borderRadius:14, background:'rgba(8,6,26,0.5)', border:'1px solid var(--c-border)' }}>
                  <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--c-indigo-lt)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
                    <i className="fas fa-file-certificate" /> Certificate Info
                  </div>
                  {[
                    { l:'ID',         v: verificationResult.certificate.certificate_id },
                    { l:'Recipient',  v: verificationResult.certificate.recipient_name },
                    { l:'Event',      v: verificationResult.certificate.event_name },
                    { l:'Event Date', v: verificationResult.certificate.event_date || '—' },
                    { l:'Issued',     v: verificationResult.certificate.issued_date ? new Date(verificationResult.certificate.issued_date).toLocaleDateString() : '—' },
                    { l:'Issued By',  v: verificationResult.certificate.event_creator || '—' },
                    { l:'Status',     v: verificationResult.certificate.status },
                  ].map(({ l, v }) => (
                    <div key={l} className="ds-info-pair">
                      <span className="ds-info-key">{l}</span>
                      <span className="ds-info-val" style={l === 'Status' ? { color: v === 'active' ? 'var(--c-green)' : 'var(--c-red)' } : undefined}>{v}</span>
                    </div>
                  ))}
                </div>

                {/* Security checks */}
                <div style={{ padding:16, borderRadius:14, background:'rgba(8,6,26,0.5)', border:'1px solid var(--c-border)' }}>
                  <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--c-indigo-lt)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
                    <i className="fas fa-shield-halved" /> Security Checks
                  </div>
                  {verificationResult.verification_details && (
                    <>
                      <CheckRow ok={verificationResult.verification_details.metadata_integrity}   label="Metadata Integrity" />
                      <CheckRow ok={verificationResult.verification_details.hash_verification}    label="Hash Verification" />
                      <CheckRow ok={verificationResult.verification_details.database_match}       label="Database Record" />
                      <CheckRow ok={verificationResult.verification_details.blockchain_verification} label="Blockchain Anchor" />
                    </>
                  )}
                  {verificationResult.certificate.blockchain_tx_hash && (
                    <div style={{ marginTop:12 }}>
                      <div style={{ fontSize:'0.72rem', color:'var(--c-text-3)', marginBottom:5 }}>Blockchain TX Hash</div>
                      <code style={{ fontSize:'0.7rem', color:'#a5b4fc', background:'rgba(0,0,0,0.4)', padding:'6px 10px', borderRadius:8, display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {verificationResult.certificate.blockchain_tx_hash}
                      </code>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* DID Ownership */}
            {verificationResult.success && verificationResult.certificate && (verificationResult.ownership_pending || ownershipResult) && (
              <div style={{
                padding:20, borderRadius:14,
                background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.25)',
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                  <i className="fas fa-fingerprint" style={{ color:'var(--c-indigo-lt)', fontSize:'1.2rem' }} />
                  <div style={{ fontFamily:'var(--font-display)', fontWeight:700, color:'var(--c-text)', fontSize:'0.95rem' }}>DID Ownership Verification</div>
                  <span className="ds-badge ds-badge-indigo" style={{ marginLeft:'auto' }}>Layer 2 Check</span>
                </div>
                <p style={{ color:'var(--c-text-3)', fontSize:'0.82rem', marginBottom:16, lineHeight:1.5 }}>
                  Cryptographically prove you are the rightful owner of this certificate using your Decentralized Identity (DID).
                </p>
                {ownershipResult ? (
                  <div style={{
                    padding:'14px', borderRadius:12, textAlign:'center',
                    fontWeight:700, fontSize:'0.9rem',
                    background: ownershipResult.success ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                    border: `1px solid ${ownershipResult.success ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)'}`,
                    color: ownershipResult.success ? '#34d399' : '#f87171',
                  }}>
                    <i className={`fas ${ownershipResult.success ? 'fa-circle-check' : 'fa-circle-xmark'}`} style={{ marginRight:8 }} />
                    {ownershipResult.verification_status || (ownershipResult.success ? 'Ownership Verified' : 'Failed')}
                    {ownershipResult.message && <p style={{ fontSize:'0.78rem', fontWeight:400, marginTop:6, opacity:0.8 }}>{ownershipResult.message}</p>}
                  </div>
                ) : verificationResult.ownership_pending && verificationResult.challenge ? (
                  <motion.button className="ds-btn ds-btn-primary" style={{ width:'100%' }}
                    onClick={handleCompleteOwnershipVerification} disabled={completingOwnership}
                    whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}>
                    {completingOwnership ? <><span className="ds-spinner" /> Verifying Ownership…</> : <><i className="fas fa-key" /> Verify DID Ownership</>}
                  </motion.button>
                ) : null}
              </div>
            )}

            {/* Fraud */}
            {verificationResult.fraud_detected && (
              <div style={{ padding:20, borderRadius:14, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.3)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <i className="fas fa-radiation" style={{ color:'var(--c-red)', fontSize:'1.1rem' }} />
                  <span style={{ fontFamily:'var(--font-display)', fontWeight:700, color:'#f87171' }}>Fraud Detected — SuperAdmin Notified</span>
                </div>
                {verificationResult.fraud_indicators?.map((fi, i) => (
                  <p key={i} style={{ color:'#fca5a5', fontSize:'0.85rem', margin:'4px 0', display:'flex', gap:8 }}>
                    <i className="fas fa-circle-dot" style={{ marginTop:3, flexShrink:0, color:'var(--c-red)' }} />{fi}
                  </p>
                ))}
              </div>
            )}

            {/* Footer actions */}
            <div className="ds-overlay-footer" style={{ padding:0, borderTop:'1px solid var(--c-border)', paddingTop:16 }}>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                {verificationResult.success && verificationResult.certificate && (
                  claimedToWallet ? (
                    <span className="ds-badge ds-badge-success" style={{ padding:'8px 14px', fontSize:'0.82rem' }}>
                      <i className="fas fa-check" /> In Your Wallet
                    </span>
                  ) : (
                    <motion.button className="ds-btn ds-btn-success ds-btn-sm"
                      onClick={handleClaimCertificate} disabled={claimingWallet}
                      whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}>
                      {claimingWallet ? <><span className="ds-spinner" /> Adding…</> : <><i className="fas fa-wallet" /> Add to Wallet</>}
                    </motion.button>
                  )
                )}
                {verificationResult.success && verificationResult.certificate && (
                  <motion.button className="ds-btn ds-btn-primary ds-btn-sm"
                    onClick={() => handleDownloadCertificate(verificationResult.certificate!.certificate_id)}
                    whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}>
                    <i className="fas fa-download" /> Download PDF
                  </motion.button>
                )}
              </div>
              <button className="ds-btn ds-btn-ghost ds-btn-sm"
                onClick={() => { setShowModal(false); setOwnershipResult(null); setClaimedToWallet(false); }}>
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default UserDashboard;
