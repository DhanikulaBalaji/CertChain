/**
 * VerifyPage — unified /verify/:certificateId route.
 * Three views based on auth & role:
 *   1. Public   → full visual certificate + Valid/Invalid status (no sensitive data)
 *   2. User     → certificate visual + DID ownership verification
 *   3. Admin/SA → certificate visual (left) + full security audit panel (right)
 */
import { motion } from 'framer-motion';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../services/AuthContext';

/* ── types ─────────────────────────────────────────────────────────────────── */
interface CertData {
  certificate_id: string;
  recipient_name: string;
  recipient_email: string;
  event_name: string;
  event_description?: string;
  event_date?: string;
  event_creator?: string;
  issued_date?: string;
  status: string;
  sha256_hash?: string;
  blockchain_tx_hash?: string;
  is_verified?: boolean;
  certificate_image_url?: string;
  certificate_pdf_url?: string;
  participant_id?: string;
  verification_result?: {
    success: boolean;
    verification_score?: number;
    fraud_detected?: boolean;
    fraud_indicators?: string[];
    verification_details?: {
      metadata_integrity: boolean;
      hash_verification: boolean;
      database_match: boolean;
      blockchain_verification: boolean;
    };
    message?: string;
    ownership_pending?: boolean;
    challenge?: string;
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
   CERTIFICATE VISUAL — renders the actual certificate document in HTML/CSS
   Matches the navy/gold PDF design from certificate_generator.py
   ══════════════════════════════════════════════════════════════════════════════ */
const CertificateVisual: React.FC<{ cert: CertData; isValid?: boolean }> = ({ cert, isValid = false }) => {
  const isRevoked = cert.status?.toLowerCase() === 'revoked';

  return (
    <div style={{
      width: '100%',
      aspectRatio: '1.414 / 1',   /* A4 landscape ratio */
      background: 'linear-gradient(135deg, #0d2137 0%, #1a3a5c 50%, #0d2137 100%)',
      borderRadius: 12,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: "'Georgia', 'Times New Roman', serif",
      boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      minHeight: 280,
    }}>

      {/* Outer gold border */}
      <div style={{
        position: 'absolute', inset: 10,
        border: '2px solid #C9A843',
        borderRadius: 8, pointerEvents: 'none', zIndex: 2,
      }} />
      {/* Inner gold border */}
      <div style={{
        position: 'absolute', inset: 15,
        border: '1px solid rgba(201,168,67,0.4)',
        borderRadius: 6, pointerEvents: 'none', zIndex: 2,
      }} />

      {/* Corner accents */}
      {[
        { top: 8, left: 8 },
        { top: 8, right: 8 },
        { bottom: 8, left: 8 },
        { bottom: 8, right: 8 },
      ].map((pos, i) => (
        <div key={i} style={{
          position: 'absolute', ...pos,
          width: 28, height: 28, zIndex: 3, pointerEvents: 'none',
        }}>
          <svg viewBox="0 0 28 28" width="28" height="28">
            <path
              d={
                i === 0 ? 'M2 14 L2 2 L14 2' :
                i === 1 ? 'M14 2 L26 2 L26 14' :
                i === 2 ? 'M2 14 L2 26 L14 26' :
                'M14 26 L26 26 L26 14'
              }
              fill="none" stroke="#C9A843" strokeWidth="2.5" strokeLinecap="round"
            />
          </svg>
        </div>
      ))}

      {/* Watermark background seal */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '45%', height: '45%', maxWidth: 200,
        opacity: 0.04,
        background: 'radial-gradient(circle, #C9A843 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none', zIndex: 1,
      }} />

      {/* Main content */}
      <div style={{
        position: 'relative', zIndex: 4,
        height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '6% 8%', boxSizing: 'border-box', textAlign: 'center',
      }}>

        {/* Header bar */}
        <div style={{
          position: 'absolute', top: 20, left: 20, right: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid rgba(201,168,67,0.3)', paddingBottom: 8,
        }}>
          <span style={{ color: 'rgba(201,168,67,0.7)', fontSize: '0.55em', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            CertChain Verification System
          </span>
          <span style={{
            fontSize: '0.48em', padding: '2px 8px', borderRadius: 100,
            background: isRevoked ? 'rgba(239,68,68,0.25)' : isValid ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.25)',
            color: isRevoked ? '#fca5a5' : isValid ? '#6ee7b7' : '#fca5a5',
            border: `1px solid ${isRevoked ? 'rgba(239,68,68,0.5)' : isValid ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.5)'}`,
            letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'sans-serif',
          }}>
            {isRevoked ? '✗ Revoked' : isValid ? '✓ Verified' : '✗ Invalid'}
          </span>
        </div>

        {/* Certificate of Completion */}
        <div style={{ color: 'rgba(201,168,67,0.55)', fontSize: '0.52em', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '2%' }}>
          Certificate
        </div>
        <div style={{ color: '#E8D07A', fontSize: '0.75em', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '3%' }}>
          of Completion
        </div>

        {/* Gold divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '4%', width: '60%' }}>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #C9A843, transparent)' }} />
          <div style={{ width: 6, height: 6, background: '#C9A843', transform: 'rotate(45deg)' }} />
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #C9A843, transparent)' }} />
        </div>

        {/* "This is to certify that" */}
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.5em', letterSpacing: '0.08em', marginBottom: '2%' }}>
          This is to certify that
        </div>

        {/* Recipient name */}
        <div style={{
          color: '#FEFCF3',
          fontSize: 'clamp(0.9em, 3.5vw, 1.3em)',
          fontWeight: 700,
          letterSpacing: '0.04em',
          marginBottom: '2%',
          textShadow: '0 2px 12px rgba(201,168,67,0.3)',
          maxWidth: '80%', wordBreak: 'break-word',
        }}>
          {cert.recipient_name || '—'}
        </div>

        {/* "has successfully completed" */}
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.48em', letterSpacing: '0.06em', marginBottom: '2%' }}>
          has successfully completed
        </div>

        {/* Event name */}
        <div style={{
          color: '#E8D07A',
          fontSize: 'clamp(0.65em, 2.5vw, 0.9em)',
          fontWeight: 700,
          letterSpacing: '0.05em',
          textAlign: 'center',
          maxWidth: '75%', wordBreak: 'break-word',
          marginBottom: '3%',
        }}>
          {cert.event_name || '—'}
        </div>

        {/* Gold divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '3%', width: '50%' }}>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(201,168,67,0.4), transparent)' }} />
          <div style={{ width: 4, height: 4, background: 'rgba(201,168,67,0.6)', transform: 'rotate(45deg)' }} />
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(201,168,67,0.4), transparent)' }} />
        </div>

        {/* Issued by + date row */}
        <div style={{ display: 'flex', gap: '8%', alignItems: 'flex-start', justifyContent: 'center' }}>
          {cert.event_creator && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#FEFCF3', fontSize: '0.5em', fontWeight: 600 }}>{cert.event_creator}</div>
              <div style={{ color: 'rgba(201,168,67,0.6)', fontSize: '0.42em', letterSpacing: '0.08em', marginTop: 3 }}>ISSUING AUTHORITY</div>
            </div>
          )}
          {cert.issued_date && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#FEFCF3', fontSize: '0.5em', fontWeight: 600 }}>{cert.issued_date}</div>
              <div style={{ color: 'rgba(201,168,67,0.6)', fontSize: '0.42em', letterSpacing: '0.08em', marginTop: 3 }}>DATE OF ISSUE</div>
            </div>
          )}
        </div>

        {/* Footer bar */}
        <div style={{
          position: 'absolute', bottom: 18, left: 24, right: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderTop: '1px solid rgba(201,168,67,0.25)', paddingTop: 8,
        }}>
          <code style={{ color: 'rgba(201,168,67,0.45)', fontSize: '0.38em', letterSpacing: '0.04em' }}>
            ID: {cert.certificate_id}
          </code>
          {cert.blockchain_tx_hash && (
            <span style={{ color: 'rgba(16,185,129,0.7)', fontSize: '0.38em', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              Blockchain Anchored
            </span>
          )}
        </div>
      </div>

      {/* Revoked overlay */}
      {isRevoked && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)',
          borderRadius: 12,
        }}>
          <div style={{
            border: '4px solid #ef4444', borderRadius: 8,
            padding: '10px 28px', transform: 'rotate(-15deg)',
            color: '#ef4444', fontFamily: 'sans-serif', fontWeight: 900,
            fontSize: '1.5em', letterSpacing: '0.15em', textTransform: 'uppercase',
          }}>
            REVOKED
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Score ring ─────────────────────────────────────────────────────────────── */
const ScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const r = 44, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  const label = score >= 80 ? 'Trusted' : score >= 50 ? 'Partial' : 'Suspicious';
  return (
    <div style={{ position:'relative', display:'inline-flex', alignItems:'center', justifyContent:'center', width:110, height:110 }}>
      <svg width="110" height="110" viewBox="0 0 110 110" style={{ transform:'rotate(-90deg)' }}>
        <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="9" />
        <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          style={{ transition:'stroke-dasharray 1.2s ease' }} />
      </svg>
      <div style={{ position:'absolute', textAlign:'center' }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:'1.4rem', fontWeight:800, color, lineHeight:1 }}>{score}</div>
        <div style={{ fontSize:'0.62rem', color:'var(--c-text-3)', marginTop:2 }}>{label}</div>
      </div>
    </div>
  );
};

/* ── Check row ──────────────────────────────────────────────────────────────── */
const CheckRow: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <div className="ds-check-row">
    <span>{label}</span>
    <span className={ok ? 'ds-check-pass' : 'ds-check-fail'}>
      <span className={`ds-check-icon ${ok ? 'ds-check-icon-pass' : 'ds-check-icon-fail'}`}>{ok?'✓':'✗'}</span>
      {ok ? 'Pass' : 'Fail'}
    </span>
  </div>
);

/* ── Info row ───────────────────────────────────────────────────────────────── */
const InfoRow: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => (
  <div style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'10px 14px', borderRadius:10, background:'rgba(255,255,255,0.03)' }}>
    <i className={`fas ${icon}`} style={{ color:'var(--c-indigo-lt)', fontSize:'0.9rem', marginTop:3, width:16, textAlign:'center', flexShrink:0 }} />
    <div>
      <div style={{ fontSize:'0.68rem', fontWeight:700, color:'var(--c-text-3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--c-text)' }}>{value}</div>
    </div>
  </div>
);

/* ── DID ownership panel ────────────────────────────────────────────────────── */
const DIDPanel: React.FC<{
  ownershipPending?: boolean; challenge?: string;
  didResult: any; didLoading: boolean;
  onDIDVerify: () => Promise<void>; isAdmin?: boolean
}> = ({ ownershipPending, challenge, didResult, didLoading, onDIDVerify, isAdmin }) => (
  <div style={{ padding:20, borderRadius:16, background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.25)' }}>
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
      <i className="fas fa-fingerprint" style={{ color:'var(--c-indigo-lt)', fontSize:'1.2rem' }} />
      <span style={{ fontFamily:'var(--font-display)', fontWeight:700, color:'var(--c-text)', fontSize:'0.95rem' }}>DID Ownership</span>
      <span className="ds-badge ds-badge-indigo" style={{ marginLeft:'auto', fontSize:'0.65rem' }}>Layer 2</span>
    </div>
    {ownershipPending && challenge ? (
      <>
        <p style={{ color:'var(--c-text-3)', fontSize:'0.8rem', lineHeight:1.55, marginBottom:14 }}>
          {isAdmin
            ? 'Certificate recipient has a registered DID. Trigger challenge-response to verify ownership.'
            : 'Cryptographically prove you are the rightful owner using your Decentralized Identity.'}
        </p>
        {didResult ? (
          <div style={{
            padding:'14px', borderRadius:12, textAlign:'center',
            fontWeight:700, fontSize:'0.875rem',
            background: didResult.success ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            border: `1px solid ${didResult.success ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)'}`,
            color: didResult.success ? '#34d399' : '#f87171',
          }}>
            <i className={`fas ${didResult.success ? 'fa-circle-check' : 'fa-circle-xmark'}`} style={{ marginRight:8 }} />
            {didResult.verification_status || (didResult.success ? 'Ownership Verified' : 'Failed')}
            {didResult.message && <div style={{ fontSize:'0.75rem', fontWeight:400, marginTop:5, opacity:0.8 }}>{didResult.message}</div>}
          </div>
        ) : (
          <motion.button className="ds-btn ds-btn-primary" style={{ width:'100%' }}
            onClick={onDIDVerify} disabled={didLoading}
            whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}>
            {didLoading ? <><span className="ds-spinner" /> Verifying…</> : <><i className="fas fa-key" /> {isAdmin ? 'Trigger DID Ownership Check' : 'Verify DID Ownership'}</>}
          </motion.button>
        )}
      </>
    ) : (
      <p style={{ color:'var(--c-text-3)', fontSize:'0.8rem', lineHeight:1.5 }}>
        Recipient has no registered DID (seed account or DID not configured). DID layer skipped.
      </p>
    )}
  </div>
);

/* ══════════════════════════════════════════════════════════════════════════════
   PUBLIC VIEW — certificate visual + validity status (no sensitive data)
   ══════════════════════════════════════════════════════════════════════════════ */
const PublicView: React.FC<{ cert: CertData }> = ({ cert }) => {
  const vr = cert.verification_result;
  const isValid = (vr?.success ?? cert.is_verified) && cert.status?.toLowerCase() === 'active';
  const isRevoked = cert.status?.toLowerCase() === 'revoked';
  const pdfUrl = cert.certificate_pdf_url ? `http://localhost:8001${cert.certificate_pdf_url}` : null;

  return (
    <div style={{ minHeight:'100vh', background:'var(--grad-bg)', display:'flex', flexDirection:'column', alignItems:'center', padding:'40px 16px', fontFamily:'var(--font-body)', position:'relative', overflow:'hidden' }}>

      {/* Background glow */}
      <div style={{ position:'absolute',width:700,height:700,borderRadius:'50%',background:`radial-gradient(circle,${isValid?'rgba(16,185,129,0.07)':'rgba(239,68,68,0.07)'} 0%,transparent 70%)`,top:-300,left:'50%',transform:'translateX(-50%)',pointerEvents:'none' }} />

      {/* Brand */}
      <motion.div initial={{ opacity:0, y:-16 }} animate={{ opacity:1, y:0 }} style={{ marginBottom:32, textAlign:'center' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:10, marginBottom:6 }}>
          <div style={{ width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#6366f1,#a78bfa)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 16px rgba(99,102,241,0.45)' }}>
            <i className="fas fa-certificate" style={{ color:'#fff', fontSize:'0.9rem' }} />
          </div>
          <span style={{ fontFamily:'var(--font-display)', fontSize:'1.2rem', fontWeight:800, color:'var(--c-text)' }}>
            Cert<span style={{ color:'var(--c-indigo-lt)' }}>Chain</span>
          </span>
        </div>
        <p style={{ color:'var(--c-text-3)', fontSize:'0.8rem', margin:0 }}>Blockchain Certificate Verification</p>
      </motion.div>

      {/* Status badge */}
      <motion.div
        initial={{ scale:0.85, opacity:0 }} animate={{ scale:1, opacity:1 }} transition={{ delay:0.1, type:'spring', stiffness:150 }}
        style={{
          display:'inline-flex', alignItems:'center', gap:14, padding:'16px 28px',
          borderRadius:16, marginBottom:32,
          background: isValid ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
          border: `2px solid ${isValid ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
        }}>
        <i className={`fas ${isValid ? 'fa-shield-check' : 'fa-triangle-exclamation'}`}
          style={{ fontSize:'1.8rem', color: isValid ? 'var(--c-green)' : 'var(--c-red)' }} />
        <div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:'1.25rem', fontWeight:800, color: isValid ? '#34d399' : '#f87171' }}>
            {isValid ? 'Certificate Valid' : isRevoked ? 'Certificate Revoked' : 'Certificate Invalid'}
          </div>
          <div style={{ fontSize:'0.78rem', color:'var(--c-text-3)', marginTop:2 }}>
            {isValid ? 'Cryptographically verified on the blockchain' : 'This certificate failed verification checks'}
          </div>
        </div>
      </motion.div>

      {/* ── THE CERTIFICATE ── */}
      <motion.div initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.2 }}
        style={{ width:'100%', maxWidth:680, marginBottom:24 }}>
        <CertificateVisual cert={cert} isValid={isValid} />
      </motion.div>

      {/* Download PDF link (if valid) */}
      {isValid && pdfUrl && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.35 }}>
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
            className="ds-btn ds-btn-primary" style={{ textDecoration:'none', marginBottom:24, display:'inline-flex', alignItems:'center', gap:8 }}>
            <i className="fas fa-download" /> Download Certificate PDF
          </a>
        </motion.div>
      )}

      {/* Blockchain anchor strip */}
      {isValid && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.4 }}
          style={{ width:'100%', maxWidth:680, padding:'12px 18px', borderRadius:12, background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.2)', display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
          <span className="ds-dot-live" />
          <span style={{ fontSize:'0.8rem', color:'var(--c-indigo-lt)', fontWeight:600 }}>Anchored on Ethereum Blockchain</span>
          {cert.blockchain_tx_hash && <span className="ds-badge ds-badge-indigo" style={{ marginLeft:'auto', fontSize:'0.65rem' }}>On-Chain</span>}
        </motion.div>
      )}

      <p style={{ color:'var(--c-text-3)', fontSize:'0.7rem', marginTop:8 }}>
        Certificate ID: <code style={{ color:'rgba(165,180,252,0.5)', fontFamily:'monospace' }}>{cert.certificate_id}</code>
      </p>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   USER VIEW — certificate visual + DID ownership
   ══════════════════════════════════════════════════════════════════════════════ */
const UserView: React.FC<{
  cert: CertData; onDIDVerify: () => Promise<void>; didResult: any; didLoading: boolean
}> = ({ cert, onDIDVerify, didResult, didLoading }) => {
  const vr = cert.verification_result;
  const isValid = (vr?.success ?? cert.is_verified) && cert.status?.toLowerCase() === 'active';
  const pdfUrl = cert.certificate_pdf_url ? `http://localhost:8001${cert.certificate_pdf_url}` : null;

  return (
    <div style={{ minHeight:'100vh', background:'var(--grad-bg)', padding:'32px 16px', fontFamily:'var(--font-body)' }}>
      <div style={{ maxWidth:820, margin:'0 auto' }}>

        <motion.div initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }} style={{ marginBottom:24 }}>
          <h1 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.5rem', color:'var(--c-text)', marginBottom:4 }}>Your Certificate</h1>
          <p style={{ color:'var(--c-text-2)', fontSize:'0.875rem', margin:0 }}>Verify authenticity and prove DID ownership</p>
        </motion.div>

        {/* Status pill */}
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.05 }}
          style={{ display:'inline-flex', alignItems:'center', gap:10, padding:'10px 20px', borderRadius:12, marginBottom:24,
            background: isValid ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${isValid ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)'}` }}>
          <i className={`fas ${isValid ? 'fa-shield-check' : 'fa-triangle-exclamation'}`} style={{ color: isValid ? '#34d399' : '#f87171' }} />
          <span style={{ fontWeight:700, color: isValid ? '#34d399' : '#f87171', fontSize:'0.9rem' }}>
            {isValid ? 'Certificate Authentic' : 'Certificate Invalid'}
          </span>
        </motion.div>

        {/* Certificate visual */}
        <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }} style={{ marginBottom:20 }}>
          <CertificateVisual cert={cert} isValid={isValid} />
        </motion.div>

        {/* Download + DID */}
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.2 }}
          style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
              className="ds-btn ds-btn-primary" style={{ textDecoration:'none', display:'inline-flex', alignItems:'center', gap:8, width:'fit-content' }}>
              <i className="fas fa-download" /> Download Certificate PDF
            </a>
          )}
          {isValid && (
            <DIDPanel
              ownershipPending={vr?.ownership_pending} challenge={vr?.challenge}
              didResult={didResult} didLoading={didLoading} onDIDVerify={onDIDVerify}
            />
          )}
        </motion.div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   ADMIN VIEW — certificate visual (left) + full security panel (right)
   ══════════════════════════════════════════════════════════════════════════════ */
const AdminView: React.FC<{
  cert: CertData; onDIDVerify: () => Promise<void>; didResult: any; didLoading: boolean
}> = ({ cert, onDIDVerify, didResult, didLoading }) => {
  const vr = cert.verification_result;
  const details = vr?.verification_details;
  const score = vr?.verification_score ?? 0;
  const isValid = (vr?.success ?? cert.is_verified) && cert.status?.toLowerCase() === 'active';
  const isRevoked = cert.status?.toLowerCase() === 'revoked';
  const pdfUrl = cert.certificate_pdf_url ? `http://localhost:8001${cert.certificate_pdf_url}` : null;

  return (
    <div style={{ minHeight:'100vh', background:'var(--grad-bg)', padding:'32px 16px', fontFamily:'var(--font-body)' }}>
      <div style={{ maxWidth:1200, margin:'0 auto' }}>

        {/* Header */}
        <motion.div initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }} style={{ marginBottom:28, display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--c-indigo)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:4 }}>
              <i className="fas fa-shield-halved" style={{ marginRight:6 }} />Admin Verification Dashboard
            </div>
            <h1 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.5rem', color:'var(--c-text)', marginBottom:4 }}>Security Audit</h1>
            <p style={{ color:'var(--c-text-2)', fontSize:'0.875rem', margin:0 }}>
              Certificate ID: <code style={{ color:'#a5b4fc' }}>{cert.certificate_id}</code>
            </p>
          </div>
          {isRevoked && (
            <span className="ds-badge ds-badge-danger" style={{ padding:'8px 16px', fontSize:'0.85rem' }}>
              <i className="fas fa-ban" /> REVOKED
            </span>
          )}
        </motion.div>

        <div style={{ display:'grid', gridTemplateColumns:'minmax(320px,1fr) minmax(320px,1fr)', gap:24, alignItems:'start' }}>

          {/* ════ LEFT: Certificate visual ════ */}
          <motion.div initial={{ opacity:0, x:-24 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.1 }}
            style={{ display:'flex', flexDirection:'column', gap:16 }}>

            {/* Big visual certificate */}
            <CertificateVisual cert={cert} isValid={isValid} />

            {/* Download */}
            {pdfUrl && (
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                className="ds-btn ds-btn-primary" style={{ textDecoration:'none', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                <i className="fas fa-file-pdf" /> Open / Download Certificate PDF
              </a>
            )}

            {/* Certificate metadata card */}
            <div className="ds-card" style={{ padding:16, display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ fontSize:'0.68rem', fontWeight:700, color:'var(--c-indigo-lt)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>
                Certificate Details
              </div>
              <InfoRow icon="fa-graduation-cap" label="Event / Course" value={cert.event_name} />
              <InfoRow icon="fa-user" label="Recipient" value={cert.recipient_name} />
              <InfoRow icon="fa-envelope" label="Email" value={cert.recipient_email} />
              <InfoRow icon="fa-building-columns" label="Issued By" value={cert.event_creator || '—'} />
              <InfoRow icon="fa-calendar-days" label="Event Date" value={cert.event_date || '—'} />
              <InfoRow icon="fa-calendar-check" label="Date Issued" value={cert.issued_date || '—'} />
            </div>
          </motion.div>

          {/* ════ RIGHT: Security audit panel ════ */}
          <motion.div initial={{ opacity:0, x:24 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.2 }}
            style={{ display:'flex', flexDirection:'column', gap:16 }}>

            {/* Verification score */}
            <div className="ds-card" style={{ padding:22, display:'flex', alignItems:'center', gap:24 }}>
              <ScoreRing score={score} />
              <div>
                <div style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--c-text-3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>
                  Verification Score
                </div>
                <div style={{ fontFamily:'var(--font-display)', fontSize:'1.2rem', fontWeight:800, color: score>=80?'var(--c-green)':score>=50?'var(--c-amber)':'var(--c-red)' }}>
                  {score>=80 ? 'Highly Trusted' : score>=50 ? 'Partially Verified' : 'Suspicious'}
                </div>
                <div style={{ color:'var(--c-text-3)', fontSize:'0.8rem', marginTop:4 }}>{vr?.message || 'Verification complete'}</div>
              </div>
            </div>

            {/* Security checks */}
            <div className="ds-card" style={{ padding:20 }}>
              <div style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--c-indigo-lt)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14, display:'flex', alignItems:'center', gap:6 }}>
                <i className="fas fa-shield-halved" /> Security Checks
              </div>
              {details ? (
                <>
                  <CheckRow ok={!!details.metadata_integrity}      label="Metadata Integrity" />
                  <CheckRow ok={!!details.hash_verification}       label="Hash Verification" />
                  <CheckRow ok={!!details.database_match}          label="Database Record Match" />
                  <CheckRow ok={!!details.blockchain_verification} label="Blockchain Anchor" />
                  <CheckRow ok={!isRevoked}                        label="Revocation Status" />
                </>
              ) : (
                <p style={{ color:'var(--c-text-3)', fontSize:'0.85rem' }}>No verification details available.</p>
              )}
            </div>

            {/* Blockchain & cryptography */}
            <div className="ds-card" style={{ padding:20 }}>
              <div style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--c-indigo-lt)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14, display:'flex', alignItems:'center', gap:6 }}>
                <i className="fas fa-link" /> Blockchain &amp; Cryptography
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div>
                  <div style={{ fontSize:'0.68rem', color:'var(--c-text-3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Transaction Hash</div>
                  <code style={{ display:'block', fontSize:'0.72rem', color:'#a5b4fc', background:'rgba(0,0,0,0.35)', padding:'8px 12px', borderRadius:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {cert.blockchain_tx_hash || '— Not recorded on chain —'}
                  </code>
                </div>
                <div>
                  <div style={{ fontSize:'0.68rem', color:'var(--c-text-3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>SHA-256 Hash</div>
                  <code style={{ display:'block', fontSize:'0.68rem', color:'#a5b4fc', background:'rgba(0,0,0,0.35)', padding:'8px 12px', borderRadius:8, wordBreak:'break-all' }}>
                    {cert.sha256_hash || '—'}
                  </code>
                </div>
                {cert.blockchain_tx_hash && (
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span className="ds-dot-live" />
                    <span style={{ fontSize:'0.8rem', color:'#34d399', fontWeight:600 }}>Recorded on Ethereum Blockchain</span>
                  </div>
                )}
              </div>
            </div>

            {/* DID */}
            <DIDPanel
              ownershipPending={vr?.ownership_pending} challenge={vr?.challenge}
              didResult={didResult} didLoading={didLoading} onDIDVerify={onDIDVerify}
              isAdmin
            />

            {/* Fraud indicators */}
            {vr?.fraud_detected && vr.fraud_indicators && (
              <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
                style={{ padding:20, borderRadius:16, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.3)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                  <i className="fas fa-radiation" style={{ color:'var(--c-red)', fontSize:'1.1rem' }} />
                  <span style={{ fontFamily:'var(--font-display)', fontWeight:700, color:'#f87171' }}>Fraud Indicators Detected</span>
                </div>
                {vr.fraud_indicators.map((fi: string, i: number) => (
                  <p key={i} style={{ color:'#fca5a5', fontSize:'0.85rem', margin:'4px 0', display:'flex', gap:8, alignItems:'flex-start' }}>
                    <i className="fas fa-circle-dot" style={{ marginTop:3, flexShrink:0 }} />{fi}
                  </p>
                ))}
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN ORCHESTRATOR
   ══════════════════════════════════════════════════════════════════════════════ */
const VerifyPage: React.FC = () => {
  const { certificateId } = useParams<{ certificateId: string }>();
  const { isAuthenticated, user } = useAuth();

  const [cert, setCert]             = useState<CertData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [didResult, setDidResult]   = useState<any>(null);
  const [didLoading, setDidLoading] = useState(false);

  const parseCertId = (raw: string): string => {
    try {
      const p = JSON.parse(raw);
      if (p.certificate_id) return p.certificate_id;
      if (p.verify_url) { const m = p.verify_url.match(/\/verify\/([A-Z0-9-]+)/i); if (m) return m[1]; }
    } catch {
      const m = raw.match(/\/verify\/([A-Z0-9-]+)/i); if (m) return m[1];
    }
    return raw;
  };

  useEffect(() => {
    const rawId = certificateId || '';
    const certId = parseCertId(rawId);
    if (!certId) { setError('No certificate ID provided.'); setLoading(false); return; }
    fetchCert(certId);
  }, [certificateId, isAuthenticated]); // eslint-disable-line

  const fetchCert = async (certId: string) => {
    setLoading(true); setError('');
    try {
      if (isAuthenticated) {
        const res = await api.post('/certificates/verify-comprehensive', { certificate_id: certId, verification_type: 'id_lookup' });
        const vr = res.data; const c = vr.certificate || {};
        setCert({
          certificate_id: certId,
          recipient_name:  c.recipient_name  || '—',
          recipient_email: c.recipient_email || '—',
          event_name:      c.event_name      || '—',
          event_date:      c.event_date      ? new Date(c.event_date).toLocaleDateString() : '—',
          event_creator:   c.event_creator   || '—',
          issued_date:     c.issued_at       ? new Date(c.issued_at).toLocaleDateString()  : '—',
          status:          c.status          || 'unknown',
          sha256_hash:     c.sha256_hash,
          blockchain_tx_hash: c.blockchain_tx_hash,
          is_verified:     vr.success,
          verification_result: vr,
          certificate_pdf_url: c.certificate_pdf_url || `/static/certificates/cert_${certId}.pdf`,
        });
      } else {
        const res = await api.get(`/certificates/public/${certId}`);
        const d = res.data;
        setCert({
          certificate_id:   d.certificate_id,
          recipient_name:   d.recipient_name   || '—',
          recipient_email:  d.recipient_email  || '—',
          event_name:       d.event_name       || '—',
          event_description: d.event_description,
          event_date:       d.event_date ? new Date(d.event_date).toLocaleDateString() : '—',
          event_creator:    d.event_creator    || '—',
          issued_date:      d.issued_date ? new Date(d.issued_date).toLocaleDateString() : '—',
          status:           d.status           || 'unknown',
          sha256_hash:      d.sha256_hash,
          blockchain_tx_hash: d.blockchain_tx_hash,
          is_verified:      d.is_verified,
          certificate_image_url: d.certificate_image_url,
          certificate_pdf_url:   d.certificate_pdf_url,
          participant_id:   d.participant_id,
          verification_result: d.verification_result,
        });
      }
    } catch (err: any) {
      if (err.response?.status === 404) setError('Certificate not found. The ID may be incorrect or does not exist.');
      else setError(err.response?.data?.detail || 'Failed to load certificate.');
    } finally { setLoading(false); }
  };

  const handleDIDVerify = async () => {
    if (!cert || !cert.verification_result?.challenge) return;
    setDidLoading(true);
    try {
      const res = await api.post('/certificates/complete-ownership-verification', {
        certificate_id: cert.certificate_id,
        challenge: cert.verification_result.challenge,
      });
      setDidResult({ success: res.data.success, verification_status: res.data.verification_status, message: res.data.message });
    } catch (err: any) {
      setDidResult({ success: false, verification_status: 'Ownership Verification Failed', message: err.response?.data?.detail || 'Error' });
    } finally { setDidLoading(false); }
  };

  /* ── Loading ── */
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'var(--grad-bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <span className="ds-spinner ds-spinner-lg" style={{ margin:'0 auto 16px' }} />
        <p style={{ color:'var(--c-text-3)', fontSize:'0.9rem' }}>Verifying certificate…</p>
      </div>
    </div>
  );

  /* ── Error ── */
  if (error || !cert) return (
    <div style={{ minHeight:'100vh', background:'var(--grad-bg)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <motion.div initial={{ scale:0.85, opacity:0 }} animate={{ scale:1, opacity:1 }}
        style={{ maxWidth:440, width:'100%', padding:40, borderRadius:24, textAlign:'center', background:'rgba(15,12,42,0.9)', border:'1px solid rgba(239,68,68,0.3)', boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }}>
        <i className="fas fa-circle-xmark" style={{ fontSize:'3.5rem', color:'var(--c-red)', marginBottom:16, display:'block' }} />
        <h2 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.25rem', color:'#f87171', marginBottom:8 }}>Certificate Not Found</h2>
        <p style={{ color:'var(--c-text-3)', fontSize:'0.875rem', lineHeight:1.6, marginBottom:16 }}>{error || 'This certificate does not exist in the system.'}</p>
        <code style={{ display:'block', fontSize:'0.72rem', color:'rgba(165,180,252,0.5)', background:'rgba(0,0,0,0.3)', padding:'8px 14px', borderRadius:8 }}>{certificateId}</code>
      </motion.div>
    </div>
  );

  /* ── Route to view ── */
  if (!isAuthenticated) return <PublicView cert={cert} />;
  const role = user?.role;
  if (role === 'admin' || role === 'super_admin')
    return <AdminView cert={cert} onDIDVerify={handleDIDVerify} didResult={didResult} didLoading={didLoading} />;
  return <UserView cert={cert} onDIDVerify={handleDIDVerify} didResult={didResult} didLoading={didLoading} />;
};

export default VerifyPage;
