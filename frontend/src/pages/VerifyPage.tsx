/**
 * VerifyPage — unified /verify/:certificateId route.
 * Shows animated step-by-step verification: Layer 1 (blockchain) auto-runs on load,
 * Layer 2 (DID ownership) auto-triggers after Layer 1 completes for authenticated users.
 */
import { motion, AnimatePresence } from 'framer-motion';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { API_BASE_URL } from '../services/api';
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
  certificate_pdf_url?: string;
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
    did_info?: {
      did_registered: boolean;
      did_id?: string;
      algorithm?: string;
      curve?: string;
      hash_function?: string;
      key_type?: string;
    };
  };
}

interface StepState {
  status: 'waiting' | 'checking' | 'pass' | 'fail' | 'skip';
  detail?: string;
}

interface DIDResult {
  success: boolean;
  verification_status: string;
  message: string;
  did_id?: string;
  algorithm?: string;
  hash_function?: string;
  steps?: Array<{ step: string; status: 'pass' | 'fail'; detail: string }>;
}

/* ══════════════════════════════════════════════════════════════════════════════
   ACTUAL PDF VIEWER
   Shows the real generated certificate PDF inside an iframe.
   Falls back to CertificateVisual if no PDF URL is available.
   ══════════════════════════════════════════════════════════════════════════════ */
const CertPDFViewer: React.FC<{ cert: CertData; isValid?: boolean }> = ({ cert, isValid = false }) => {
  const [iframeError, setIframeError] = useState(false);
  const isRevoked = cert.status?.toLowerCase() === 'revoked';

  const pdfSrc = cert.certificate_pdf_url
    ? (cert.certificate_pdf_url.startsWith('http')
        ? cert.certificate_pdf_url
        : `${API_BASE_URL}${cert.certificate_pdf_url}`)
    : null;

  if (!pdfSrc || iframeError) {
    return <CertificateVisual cert={cert} isValid={isValid} />;
  }

  const statusBg  = isRevoked ? 'rgba(239,68,68,0.9)' : isValid ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.9)';
  const statusTxt = isRevoked ? '✗ Revoked' : isValid ? '✓ Verified' : '✗ Invalid';

  return (
    <div style={{ width: '100%', position: 'relative', borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
      <div style={{
        position: 'absolute', top: 10, right: 10, zIndex: 5,
        padding: '4px 14px', borderRadius: 100, fontSize: '0.7rem', fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        background: statusBg, color: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      }}>
        {statusTxt}
      </div>
      <iframe
        src={pdfSrc}
        title={`Certificate – ${cert.recipient_name}`}
        onError={() => setIframeError(true)}
        style={{ width: '100%', height: 440, border: 'none', display: 'block', background: '#fff' }}
      />
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   CERTIFICATE VISUAL  (HTML fallback — used only when no PDF file exists)
   ══════════════════════════════════════════════════════════════════════════════ */
const CertificateVisual: React.FC<{ cert: CertData; isValid?: boolean }> = ({ cert, isValid = false }) => {
  const isRevoked = cert.status?.toLowerCase() === 'revoked';
  return (
    <div style={{
      width:'100%', aspectRatio:'1.414/1',
      background:'linear-gradient(135deg,#0d2137 0%,#1a3a5c 50%,#0d2137 100%)',
      borderRadius:12, position:'relative', overflow:'hidden',
      fontFamily:"'Georgia','Times New Roman',serif",
      boxShadow:'0 20px 60px rgba(0,0,0,0.6)', minHeight:220,
    }}>
      <div style={{ position:'absolute', inset:10, border:'2px solid #C9A843', borderRadius:8, pointerEvents:'none', zIndex:2 }} />
      <div style={{ position:'absolute', inset:15, border:'1px solid rgba(201,168,67,0.4)', borderRadius:6, pointerEvents:'none', zIndex:2 }} />
      {[{top:8,left:8},{top:8,right:8},{bottom:8,left:8},{bottom:8,right:8}].map((pos,i)=>(
        <div key={i} style={{ position:'absolute',...pos, width:28, height:28, zIndex:3, pointerEvents:'none' }}>
          <svg viewBox="0 0 28 28" width="28" height="28">
            <path d={i===0?'M2 14L2 2L14 2':i===1?'M14 2L26 2L26 14':i===2?'M2 14L2 26L14 26':'M14 26L26 26L26 14'}
              fill="none" stroke="#C9A843" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </div>
      ))}
      <div style={{ position:'relative', zIndex:4, height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'8% 10%', boxSizing:'border-box', textAlign:'center' }}>
        <div style={{ position:'absolute', top:16, left:20, right:20, display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid rgba(201,168,67,0.3)', paddingBottom:6 }}>
          <span style={{ color:'rgba(201,168,67,0.7)', fontSize:'0.5em', letterSpacing:'0.15em', textTransform:'uppercase' }}>CertChain Verification System</span>
          <span style={{ fontSize:'0.44em', padding:'2px 8px', borderRadius:100,
            background: isRevoked?'rgba(239,68,68,0.25)':isValid?'rgba(16,185,129,0.2)':'rgba(239,68,68,0.25)',
            color: isRevoked?'#fca5a5':isValid?'#6ee7b7':'#fca5a5',
            border:`1px solid ${isRevoked?'rgba(239,68,68,0.5)':isValid?'rgba(16,185,129,0.4)':'rgba(239,68,68,0.5)'}`,
            letterSpacing:'0.1em', textTransform:'uppercase', fontFamily:'sans-serif' }}>
            {isRevoked?'✗ Revoked':isValid?'✓ Verified':'✗ Invalid'}
          </span>
        </div>
        <div style={{ color:'rgba(201,168,67,0.55)', fontSize:'0.5em', letterSpacing:'0.3em', textTransform:'uppercase', marginBottom:'2%' }}>Certificate</div>
        <div style={{ color:'#E8D07A', fontSize:'0.7em', letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:'3%' }}>of Completion</div>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:'4%', width:'60%' }}>
          <div style={{ flex:1, height:1, background:'linear-gradient(90deg,transparent,#C9A843,transparent)' }} />
          <div style={{ width:5, height:5, background:'#C9A843', transform:'rotate(45deg)' }} />
          <div style={{ flex:1, height:1, background:'linear-gradient(90deg,transparent,#C9A843,transparent)' }} />
        </div>
        <div style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.46em', marginBottom:'2%' }}>This is to certify that</div>
        <div style={{ color:'#FEFCF3', fontSize:'clamp(0.8em,3vw,1.2em)', fontWeight:700, marginBottom:'2%', textShadow:'0 2px 12px rgba(201,168,67,0.3)', maxWidth:'80%', wordBreak:'break-word' }}>
          {cert.recipient_name || '—'}
        </div>
        <div style={{ color:'rgba(255,255,255,0.45)', fontSize:'0.44em', marginBottom:'2%' }}>has successfully completed</div>
        <div style={{ color:'#E8D07A', fontSize:'clamp(0.6em,2.2vw,0.85em)', fontWeight:700, maxWidth:'75%', wordBreak:'break-word', marginBottom:'3%' }}>
          {cert.event_name || '—'}
        </div>
        <div style={{ display:'flex', gap:'8%', alignItems:'flex-start', justifyContent:'center' }}>
          {cert.event_creator && <div style={{ textAlign:'center' }}>
            <div style={{ color:'#FEFCF3', fontSize:'0.46em', fontWeight:600 }}>{cert.event_creator}</div>
            <div style={{ color:'rgba(201,168,67,0.6)', fontSize:'0.38em', letterSpacing:'0.08em', marginTop:2 }}>ISSUING AUTHORITY</div>
          </div>}
          {cert.issued_date && <div style={{ textAlign:'center' }}>
            <div style={{ color:'#FEFCF3', fontSize:'0.46em', fontWeight:600 }}>{cert.issued_date}</div>
            <div style={{ color:'rgba(201,168,67,0.6)', fontSize:'0.38em', letterSpacing:'0.08em', marginTop:2 }}>DATE OF ISSUE</div>
          </div>}
        </div>
        <div style={{ position:'absolute', bottom:14, left:22, right:22, display:'flex', alignItems:'center', justifyContent:'space-between', borderTop:'1px solid rgba(201,168,67,0.25)', paddingTop:6 }}>
          <code style={{ color:'rgba(201,168,67,0.45)', fontSize:'0.35em' }}>ID: {cert.certificate_id}</code>
          {cert.blockchain_tx_hash && <span style={{ color:'rgba(16,185,129,0.7)', fontSize:'0.35em', display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ width:4, height:4, borderRadius:'50%', background:'#10b981', display:'inline-block' }} />Blockchain Anchored
          </span>}
        </div>
      </div>
      {isRevoked && (
        <div style={{ position:'absolute', inset:0, zIndex:10, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.55)', borderRadius:12 }}>
          <div style={{ border:'4px solid #ef4444', borderRadius:8, padding:'8px 24px', transform:'rotate(-15deg)', color:'#ef4444', fontFamily:'sans-serif', fontWeight:900, fontSize:'1.4em', letterSpacing:'0.15em', textTransform:'uppercase' }}>REVOKED</div>
        </div>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   VERIFICATION STEP ROW
   ══════════════════════════════════════════════════════════════════════════════ */
const Step: React.FC<{
  index: number; title: string; description: string; technical?: string;
  state: StepState; layer: 1 | 2;
}> = ({ index, title, description, technical, state, layer }) => {
  const color = layer === 1 ? '#6366f1' : '#8b5cf6';
  const statusColor = state.status === 'pass' ? '#10b981' : state.status === 'fail' ? '#ef4444' : state.status === 'skip' ? '#94a3b8' : '#f59e0b';

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35 }}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 14,
        padding: '12px 16px', borderRadius: 12,
        background: state.status === 'pass' ? 'rgba(16,185,129,0.05)' :
                    state.status === 'fail' ? 'rgba(239,68,68,0.05)' :
                    state.status === 'checking' ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${
          state.status === 'pass' ? 'rgba(16,185,129,0.2)' :
          state.status === 'fail' ? 'rgba(239,68,68,0.2)' :
          state.status === 'checking' ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)'}`,
        transition: 'all 0.4s ease',
      }}>
      {/* Step number / status icon */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: state.status === 'pass' ? 'rgba(16,185,129,0.18)' :
                    state.status === 'fail' ? 'rgba(239,68,68,0.18)' :
                    state.status === 'checking' ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.06)',
        border: `2px solid ${
          state.status === 'pass' ? '#10b981' :
          state.status === 'fail' ? '#ef4444' :
          state.status === 'checking' ? '#f59e0b' : 'rgba(255,255,255,0.1)'}`,
        fontSize: '0.8rem', fontWeight: 700, color: statusColor,
      }}>
        {state.status === 'pass' ? '✓' :
         state.status === 'fail' ? '✗' :
         state.status === 'checking' ? <span className="ds-spinner" style={{ width:14, height:14 }} /> :
         state.status === 'skip' ? '—' : index + 1}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--c-text)' }}>{title}</span>
          <span style={{
            fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '2px 8px', borderRadius: 100, flexShrink: 0,
            background: state.status === 'pass' ? 'rgba(16,185,129,0.15)' :
                        state.status === 'fail' ? 'rgba(239,68,68,0.15)' :
                        state.status === 'checking' ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)',
            color: statusColor,
          }}>
            {state.status === 'checking' ? 'Checking…' :
             state.status === 'pass' ? 'PASS' :
             state.status === 'fail' ? 'FAIL' :
             state.status === 'skip' ? 'N/A' : 'Pending'}
          </span>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--c-text-3)', marginBottom: state.detail || technical ? 5 : 0 }}>{description}</div>
        {(state.detail || technical) && (
          <code style={{
            display: 'block', fontSize: '0.68rem', padding: '5px 10px', borderRadius: 7,
            background: 'rgba(0,0,0,0.3)', color: '#a5b4fc',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}>
            {state.detail || technical}
          </code>
        )}
      </div>
    </motion.div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   VERIFICATION TIMELINE — the main component
   ══════════════════════════════════════════════════════════════════════════════ */
const VerificationTimeline: React.FC<{
  cert: CertData;
  isAdmin?: boolean;
  onComplete?: (overallPass: boolean) => void;
}> = ({ cert, isAdmin = false, onComplete }) => {
  const { isAuthenticated } = useAuth();
  const vr = cert.verification_result;
  const details = vr?.verification_details;
  const didInfo = vr?.did_info;

  /* Layer 1 steps */
  const L1_STEPS = [
    {
      title: 'Certificate Lookup',
      description: 'Certificate ID located in the secure database',
      technical: `ID: ${cert.certificate_id}`,
      pass: !!details?.database_match ?? true,
      detail: details?.database_match ? `Found: ${cert.certificate_id}` : 'Not found in database',
    },
    {
      title: 'Metadata Integrity',
      description: 'Recipient name, event name, and issue date are intact',
      technical: `Recipient: ${cert.recipient_name} | Event: ${cert.event_name}`,
      pass: !!details?.metadata_integrity ?? true,
      detail: details?.metadata_integrity ? `Metadata verified — ${cert.recipient_name}, ${cert.event_name}` : 'Metadata mismatch detected',
    },
    {
      title: 'SHA-256 Hash Verification',
      description: 'Cryptographic fingerprint matches the original issued certificate',
      pass: !!details?.hash_verification,
      detail: cert.sha256_hash ? `Hash: ${cert.sha256_hash.substring(0, 32)}…` : details?.hash_verification ? 'Hash verified' : 'Hash mismatch — certificate may be tampered',
    },
    {
      title: 'Blockchain Anchor',
      description: 'Certificate hash recorded on the Ethereum blockchain',
      pass: !!details?.blockchain_verification,
      detail: cert.blockchain_tx_hash ? `Tx: ${cert.blockchain_tx_hash.substring(0, 32)}…` : details?.blockchain_verification ? 'On-chain record confirmed' : 'No blockchain record (local verification only)',
    },
    {
      title: 'Revocation Status',
      description: 'Certificate has not been revoked by the issuing authority',
      pass: cert.status?.toLowerCase() !== 'revoked',
      detail: cert.status?.toLowerCase() === 'revoked' ? 'Certificate has been REVOKED' : `Status: ${cert.status || 'active'}`,
    },
  ];

  /* Layer 2 DID steps (shown once Layer 1 done) */
  const L2_STEPS = [
    {
      title: 'DID Identity Check',
      description: 'Recipient has a registered Decentralised Identity (DID)',
      technical: didInfo?.did_id ? `DID: ${didInfo.did_id.substring(0, 30)}…` : undefined,
    },
    {
      title: 'Challenge Issuance',
      description: 'Server generates a one-time cryptographic challenge (UUID nonce)',
      technical: vr?.challenge ? `Challenge: ${vr.challenge.substring(0, 16)}…` : undefined,
    },
    {
      title: 'Cryptographic Signing',
      description: `Holder's private key signs the challenge via ${didInfo?.algorithm || 'ECDSA'} (${didInfo?.curve || 'P-256'})`,
    },
    {
      title: 'Ownership Confirmation',
      description: `Signature verified against holder's public key using ${didInfo?.hash_function || 'SHA-256'}`,
    },
  ];

  const TOTAL = L1_STEPS.length + L2_STEPS.length;

  const initStates = (): StepState[] => Array(TOTAL).fill({ status: 'waiting' } as StepState);
  const [steps, setSteps]     = useState<StepState[]>(initStates);
  const [phase, setPhase]     = useState<'idle' | 'layer1' | 'layer2' | 'done'>('idle');
  const [didResult, setDidResult] = useState<DIDResult | null>(null);
  const [l1Pass, setL1Pass]   = useState(false);
  const ran = useRef(false);

  const setStep = useCallback((i: number, s: StepState) => {
    setSteps(prev => { const n = [...prev]; n[i] = s; return n; });
  }, []);

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  /* ── Run Layer 1 ── */
  const runLayer1 = useCallback(async () => {
    setPhase('layer1');
    let allPass = true;
    for (let i = 0; i < L1_STEPS.length; i++) {
      setStep(i, { status: 'checking' });
      await delay(520 + Math.random() * 180);
      const ok = L1_STEPS[i].pass;
      if (!ok) allPass = false;
      setStep(i, { status: ok ? 'pass' : 'fail', detail: L1_STEPS[i].detail });
    }
    setL1Pass(allPass);
    return allPass;
  }, []); // eslint-disable-line

  /* ── Run Layer 2 DID ── */
  const runLayer2 = useCallback(async () => {
    /* Admins are auditing — they are not the recipient, so ownership
       challenge-response makes no sense and the endpoint returns 403.
       Show informative N/A steps instead. */
    if (isAdmin) {
      setPhase('layer2');
      for (let i = 0; i < L2_STEPS.length; i++) {
        setStep(L1_STEPS.length + i, { status: 'checking' });
        await delay(350);
        setStep(L1_STEPS.length + i, {
          status: 'skip',
          detail: 'Admin audit mode — DID ownership must be verified by the recipient',
        });
      }
      return;
    }

    if (!vr?.ownership_pending || !vr?.challenge || !isAuthenticated) {
      /* No DID for this cert — mark all L2 as N/A */
      for (let i = 0; i < L2_STEPS.length; i++) {
        setStep(L1_STEPS.length + i, { status: 'skip', detail: 'Recipient has no registered DID' });
        await delay(150);
      }
      return;
    }
    setPhase('layer2');
    const base = L1_STEPS.length;

    /* Step 6 – DID registered */
    setStep(base + 0, { status: 'checking' });
    await delay(500);
    const hasDid = !!didInfo?.did_registered;
    setStep(base + 0, { status: hasDid ? 'pass' : 'fail', detail: hasDid ? (didInfo?.did_id ? `${didInfo.did_id.substring(0, 28)}…` : 'DID registered') : 'No DID found' });

    /* Step 7 – Challenge */
    setStep(base + 1, { status: 'checking' });
    await delay(450);
    setStep(base + 1, { status: 'pass', detail: `Nonce: ${vr.challenge.substring(0, 16)}… (one-time, 5-min TTL)` });

    /* Step 8 – Signing */
    setStep(base + 2, { status: 'checking' });
    await delay(700);

    /* Actually call the API */
    let result: DIDResult | null = null;
    try {
      const res = await api.post('/certificates/complete-ownership-verification', {
        certificate_id: cert.certificate_id,
        challenge: vr.challenge,
      });
      result = res.data as DIDResult;
    } catch (err: any) {
      result = {
        success: false,
        verification_status: 'Ownership Verification Failed',
        message: err.response?.data?.detail || 'Error during DID verification',
        steps: [
          { step: 'DID Identity Check',    status: 'pass', detail: 'DID registered' },
          { step: 'Challenge Issuance',    status: 'pass', detail: 'Challenge issued' },
          { step: 'Cryptographic Signing', status: 'fail', detail: err.response?.data?.detail || 'Signing failed' },
          { step: 'Ownership Confirmed',   status: 'fail', detail: 'Could not verify ownership' },
        ],
      };
    }

    setDidResult(result);

    /* Populate step 8 & 9 from result.steps if present */
    const rSteps = result?.steps || [];
    const sigStep = rSteps.find(s => s.step === 'Cryptographic Signing');
    const ownStep = rSteps.find(s => s.step === 'Ownership Confirmed');

    setStep(base + 2, { status: sigStep?.status || (result?.success ? 'pass' : 'fail'), detail: sigStep?.detail || `ECDSA P-256 / SHA-256` });
    await delay(500);
    setStep(base + 3, { status: 'checking' });
    await delay(500);
    setStep(base + 3, { status: ownStep?.status || (result?.success ? 'pass' : 'fail'), detail: ownStep?.detail || result?.message });
  }, [vr, didInfo, isAuthenticated, isAdmin, cert.certificate_id]); // eslint-disable-line

  /* ── Orchestrate on mount ── */
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      await delay(400);
      const pass = await runLayer1();
      await delay(300);
      await runLayer2();
      setPhase('done');
      onComplete?.(pass);
    })();
  }, []); // eslint-disable-line

  const doneCount = steps.filter(s => s.status === 'pass' || s.status === 'fail' || s.status === 'skip').length;
  const failCount = steps.filter(s => s.status === 'fail').length;
  const overall   = phase === 'done' ? (failCount === 0 ? 'pass' : failCount <= 1 ? 'warn' : 'fail') : 'running';

  const overallColor = overall === 'pass' ? '#10b981' : overall === 'warn' ? '#f59e0b' : overall === 'fail' ? '#ef4444' : '#a5b4fc';
  const overallLabel = overall === 'pass' ? 'All Checks Passed' : overall === 'warn' ? 'Verified with Notes' : overall === 'fail' ? 'Verification Failed' : 'Verifying…';
  const overallIcon  = overall === 'pass' ? 'fa-shield-check' : overall === 'warn' ? 'fa-triangle-exclamation' : overall === 'fail' ? 'fa-circle-xmark' : 'fa-spinner fa-spin';

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

      {/* Overall status bar */}
      <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }}
        style={{
          padding:'14px 20px', borderRadius:14, display:'flex', alignItems:'center', gap:14,
          background: overall==='running' ? 'rgba(99,102,241,0.1)' : overall==='pass' ? 'rgba(16,185,129,0.1)' : overall==='warn' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
          border:`1.5px solid ${overall==='running'?'rgba(99,102,241,0.3)':overall==='pass'?'rgba(16,185,129,0.35)':overall==='warn'?'rgba(245,158,11,0.35)':'rgba(239,68,68,0.35)'}`,
        }}>
        <i className={`fas ${overallIcon}`} style={{ fontSize:'1.4rem', color:overallColor }} />
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1rem', color:overallColor }}>{overallLabel}</div>
          <div style={{ fontSize:'0.75rem', color:'var(--c-text-3)', marginTop:2 }}>
            {phase==='done' ? `${doneCount} checks completed · ${failCount} failed` : `Running check ${doneCount + 1} of ${TOTAL}…`}
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ width:80, height:6, borderRadius:100, background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
          <motion.div animate={{ width:`${(doneCount/TOTAL)*100}%` }} transition={{ duration:0.4 }}
            style={{ height:'100%', borderRadius:100, background:overallColor }} />
        </div>
      </motion.div>

      {/* Layer 1 */}
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, padding:'0 4px' }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'#6366f1' }} />
          <span style={{ fontSize:'0.65rem', fontWeight:800, color:'#a5b4fc', textTransform:'uppercase', letterSpacing:'0.1em' }}>
            Layer 1 — Blockchain &amp; Certificate Authenticity
          </span>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
          <AnimatePresence>
            {L1_STEPS.map((s, i) => (
              steps[i].status !== 'waiting' && (
                <Step key={i} index={i} title={s.title} description={s.description} technical={s.technical} state={steps[i]} layer={1} />
              )
            ))}
          </AnimatePresence>
          {steps.filter((s,i)=>i<L1_STEPS.length && s.status==='waiting').length > 0 && (
            <div style={{ padding:'10px 16px', borderRadius:10, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', color:'var(--c-text-3)', fontSize:'0.78rem' }}>
              <span className="ds-spinner" style={{ width:12, height:12, marginRight:8, verticalAlign:'middle' }} />
              Preparing checks…
            </div>
          )}
        </div>
      </div>

      {/* Layer 2 DID */}
      {(phase === 'layer2' || phase === 'done' || steps.slice(L1_STEPS.length).some(s => s.status !== 'waiting')) && (
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, padding:'0 4px', marginTop:8 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#8b5cf6' }} />
            <span style={{ fontSize:'0.65rem', fontWeight:800, color:'#c4b5fd', textTransform:'uppercase', letterSpacing:'0.1em' }}>
              Layer 2 — DID Ownership Verification
            </span>
            <span style={{ fontSize:'0.6rem', color:'var(--c-text-3)', marginLeft:4 }}>ECDSA / SECP256R1</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
            <AnimatePresence>
              {L2_STEPS.map((s, i) => (
                steps[L1_STEPS.length + i].status !== 'waiting' && (
                  <Step key={`l2-${i}`} index={i} title={s.title} description={s.description} technical={s.technical} state={steps[L1_STEPS.length + i]} layer={2} />
                )
              ))}
            </AnimatePresence>
          </div>

          {/* DID result summary */}
          {didResult && phase === 'done' && (
            <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.3 }}
              style={{
                marginTop:12, padding:'14px 18px', borderRadius:14,
                background: didResult.success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                border:`1px solid ${didResult.success ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)'}`,
              }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <i className={`fas ${didResult.success ? 'fa-fingerprint' : 'fa-circle-xmark'}`}
                  style={{ color: didResult.success ? '#34d399' : '#f87171', fontSize:'1.2rem' }} />
                <span style={{ fontFamily:'var(--font-display)', fontWeight:800, color: didResult.success ? '#34d399' : '#f87171', fontSize:'0.95rem' }}>
                  {didResult.verification_status}
                </span>
              </div>
              <p style={{ color:'var(--c-text-3)', fontSize:'0.8rem', margin:0, lineHeight:1.5 }}>{didResult.message}</p>
              {didResult.did_id && (
                <div style={{ marginTop:10 }}>
                  <div style={{ fontSize:'0.65rem', color:'var(--c-text-3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Verified DID</div>
                  <code style={{ fontSize:'0.7rem', color:'#a5b4fc', background:'rgba(0,0,0,0.3)', padding:'5px 10px', borderRadius:7, display:'block', wordBreak:'break-all' }}>
                    {didResult.did_id}
                  </code>
                </div>
              )}
              {(didResult.algorithm || didResult.hash_function) && (
                <div style={{ marginTop:10, display:'flex', gap:8, flexWrap:'wrap' }}>
                  {didResult.algorithm && <span style={{ fontSize:'0.65rem', padding:'3px 10px', borderRadius:100, background:'rgba(139,92,246,0.15)', border:'1px solid rgba(139,92,246,0.3)', color:'#c4b5fd' }}>
                    {didResult.algorithm}
                  </span>}
                  {didResult.hash_function && <span style={{ fontSize:'0.65rem', padding:'3px 10px', borderRadius:100, background:'rgba(99,102,241,0.15)', border:'1px solid rgba(99,102,241,0.3)', color:'#a5b4fc' }}>
                    {didResult.hash_function}
                  </span>}
                  <span style={{ fontSize:'0.65rem', padding:'3px 10px', borderRadius:100, background:'rgba(99,102,241,0.15)', border:'1px solid rgba(99,102,241,0.3)', color:'#a5b4fc' }}>
                    Challenge-Response Protocol
                  </span>
                </div>
              )}
            </motion.div>
          )}

          {/* No DID notice */}
          {phase === 'done' && !vr?.ownership_pending && (
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.2 }}
              style={{ marginTop:8, padding:'10px 16px', borderRadius:10, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ color:'var(--c-text-3)', fontSize:'0.78rem', margin:0 }}>
                <i className="fas fa-info-circle" style={{ marginRight:6, color:'#a5b4fc' }} />
                No DID registered for this certificate's recipient. Layer 2 verification skipped.
              </p>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   PUBLIC VIEW
   ══════════════════════════════════════════════════════════════════════════════ */
const PublicView: React.FC<{ cert: CertData }> = ({ cert }) => {
  const vr = cert.verification_result;
  const isValid = (vr?.success ?? cert.is_verified) && cert.status?.toLowerCase() === 'active';
  const isRevoked = cert.status?.toLowerCase() === 'revoked';
  const rawPdf  = cert.certificate_pdf_url;
  const pdfUrl  = rawPdf ? (rawPdf.startsWith('http') ? rawPdf : `${API_BASE_URL}${rawPdf}`) : null;
  const [overallPass, setOverallPass] = useState<boolean | null>(null);

  return (
    <div style={{ minHeight:'100vh', background:'var(--grad-bg)', display:'flex', flexDirection:'column', alignItems:'center', padding:'40px 16px', fontFamily:'var(--font-body)' }}>
      <div style={{ position:'absolute',width:700,height:700,borderRadius:'50%',background:`radial-gradient(circle,${isValid?'rgba(16,185,129,0.07)':'rgba(239,68,68,0.07)'} 0%,transparent 70%)`,top:-300,left:'50%',transform:'translateX(-50%)',pointerEvents:'none' }} />

      {/* Brand */}
      <motion.div initial={{ opacity:0, y:-16 }} animate={{ opacity:1, y:0 }} style={{ marginBottom:32, textAlign:'center' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:10, marginBottom:6 }}>
          <div style={{ width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#6366f1,#a78bfa)',display:'flex',alignItems:'center',justifyContent:'center' }}>
            <i className="fas fa-certificate" style={{ color:'#fff', fontSize:'0.9rem' }} />
          </div>
          <span style={{ fontFamily:'var(--font-display)', fontSize:'1.2rem', fontWeight:800, color:'var(--c-text)' }}>
            Cert<span style={{ color:'var(--c-indigo-lt)' }}>Chain</span>
          </span>
        </div>
        <p style={{ color:'var(--c-text-3)', fontSize:'0.8rem', margin:0 }}>Blockchain Certificate Verification</p>
      </motion.div>

      <div style={{ width:'100%', maxWidth:680, display:'flex', flexDirection:'column', gap:20 }}>
        {/* Actual certificate PDF */}
        <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}>
          <CertPDFViewer cert={cert} isValid={isValid} />
        </motion.div>

        {/* Verification timeline (Layer 1 only for public) */}
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.2 }}>
          <VerificationTimeline cert={cert} onComplete={setOverallPass} />
        </motion.div>

        {/* Download */}
        {pdfUrl && overallPass && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.3 }}>
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
              className="ds-btn ds-btn-primary" style={{ textDecoration:'none', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              <i className="fas fa-download" /> Download Certificate PDF
            </a>
          </motion.div>
        )}

        <p style={{ color:'var(--c-text-3)', fontSize:'0.7rem', textAlign:'center' }}>
          Certificate ID: <code style={{ color:'rgba(165,180,252,0.5)' }}>{cert.certificate_id}</code>
        </p>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   USER VIEW
   ══════════════════════════════════════════════════════════════════════════════ */
const UserView: React.FC<{ cert: CertData }> = ({ cert }) => {
  const vr = cert.verification_result;
  const isValid = (vr?.success ?? cert.is_verified) && cert.status?.toLowerCase() === 'active';
  const rawPdf  = cert.certificate_pdf_url;
  const pdfUrl  = rawPdf ? (rawPdf.startsWith('http') ? rawPdf : `${API_BASE_URL}${rawPdf}`) : null;

  return (
    <div style={{ minHeight:'100vh', background:'var(--grad-bg)', padding:'32px 16px', fontFamily:'var(--font-body)' }}>
      <div style={{ maxWidth:800, margin:'0 auto', display:'flex', flexDirection:'column', gap:20 }}>
        <motion.div initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }}>
          <h1 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.5rem', color:'var(--c-text)', marginBottom:4 }}>Certificate Verification</h1>
          <p style={{ color:'var(--c-text-2)', fontSize:'0.875rem', margin:0 }}>Blockchain authentication + DID ownership proof</p>
        </motion.div>

        <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}>
          <CertPDFViewer cert={cert} isValid={isValid} />
        </motion.div>

        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.15 }}>
          <VerificationTimeline cert={cert} />
        </motion.div>

        {pdfUrl && (
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
            className="ds-btn ds-btn-primary" style={{ textDecoration:'none', display:'flex', alignItems:'center', justifyContent:'center', gap:8, width:'fit-content' }}>
            <i className="fas fa-download" /> Download Certificate PDF
          </a>
        )}
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   ADMIN VIEW — certificate (left) + full verification timeline (right)
   ══════════════════════════════════════════════════════════════════════════════ */
const AdminView: React.FC<{ cert: CertData }> = ({ cert }) => {
  const vr = cert.verification_result;
  const isValid = (vr?.success ?? cert.is_verified) && cert.status?.toLowerCase() === 'active';
  const isRevoked = cert.status?.toLowerCase() === 'revoked';
  const rawPdf  = cert.certificate_pdf_url;
  const pdfUrl  = rawPdf ? (rawPdf.startsWith('http') ? rawPdf : `${API_BASE_URL}${rawPdf}`) : null;

  return (
    <div style={{ minHeight:'100vh', background:'var(--grad-bg)', padding:'32px 16px', fontFamily:'var(--font-body)' }}>
      <div style={{ maxWidth:1200, margin:'0 auto' }}>

        {/* Header */}
        <motion.div initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }} style={{ marginBottom:28, display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--c-indigo)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:4 }}>
              <i className="fas fa-shield-halved" style={{ marginRight:6 }} />Admin Security Audit Dashboard
            </div>
            <h1 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.5rem', color:'var(--c-text)', marginBottom:4 }}>Certificate Verification Report</h1>
            <p style={{ color:'var(--c-text-2)', fontSize:'0.875rem', margin:0 }}>
              ID: <code style={{ color:'#a5b4fc' }}>{cert.certificate_id}</code>
            </p>
          </div>
          {isRevoked && <span className="ds-badge ds-badge-danger" style={{ padding:'8px 16px', fontSize:'0.85rem' }}><i className="fas fa-ban" /> REVOKED</span>}
        </motion.div>

        <div style={{ display:'grid', gridTemplateColumns:'minmax(300px,1fr) minmax(340px,1.1fr)', gap:24, alignItems:'start' }}>

          {/* LEFT: Certificate visual + metadata */}
          <motion.div initial={{ opacity:0, x:-24 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.1 }}
            style={{ display:'flex', flexDirection:'column', gap:14 }}>

            <CertPDFViewer cert={cert} isValid={isValid} />

            {pdfUrl && (
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                className="ds-btn ds-btn-primary" style={{ textDecoration:'none', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                <i className="fas fa-download" /> Download Certificate PDF
              </a>
            )}

            <div className="ds-card" style={{ padding:16 }}>
              <div style={{ fontSize:'0.65rem', fontWeight:800, color:'var(--c-indigo-lt)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Certificate Details</div>
              {[
                { icon:'fa-graduation-cap', label:'Event / Course', val: cert.event_name },
                { icon:'fa-user',           label:'Recipient',      val: cert.recipient_name },
                { icon:'fa-envelope',       label:'Email',          val: cert.recipient_email },
                { icon:'fa-building-columns',label:'Issued By',     val: cert.event_creator||'—' },
                { icon:'fa-calendar-days',  label:'Event Date',     val: cert.event_date||'—' },
                { icon:'fa-calendar-check', label:'Date Issued',    val: cert.issued_date||'—' },
              ].map(({icon,label,val})=>(
                <div key={label} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'8px 10px', borderRadius:8, background:'rgba(255,255,255,0.03)', marginBottom:5 }}>
                  <i className={`fas ${icon}`} style={{ color:'var(--c-indigo-lt)', fontSize:'0.85rem', marginTop:3, width:14, textAlign:'center', flexShrink:0 }} />
                  <div>
                    <div style={{ fontSize:'0.63rem', fontWeight:700, color:'var(--c-text-3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>{label}</div>
                    <div style={{ fontSize:'0.85rem', fontWeight:600, color:'var(--c-text)' }}>{val}</div>
                  </div>
                </div>
              ))}

              {/* Blockchain hash */}
              {cert.sha256_hash && (
                <div style={{ marginTop:8, padding:'8px 10px', borderRadius:8, background:'rgba(0,0,0,0.25)' }}>
                  <div style={{ fontSize:'0.63rem', fontWeight:700, color:'var(--c-text-3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>SHA-256 Hash</div>
                  <code style={{ fontSize:'0.65rem', color:'#a5b4fc', wordBreak:'break-all' }}>{cert.sha256_hash}</code>
                </div>
              )}
              {cert.blockchain_tx_hash && (
                <div style={{ marginTop:6, padding:'8px 10px', borderRadius:8, background:'rgba(0,0,0,0.25)' }}>
                  <div style={{ fontSize:'0.63rem', fontWeight:700, color:'var(--c-text-3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Blockchain Tx Hash</div>
                  <code style={{ fontSize:'0.65rem', color:'#a5b4fc', wordBreak:'break-all' }}>{cert.blockchain_tx_hash}</code>
                </div>
              )}
            </div>
          </motion.div>

          {/* RIGHT: Full verification timeline */}
          <motion.div initial={{ opacity:0, x:24 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.2 }}>
            <div className="ds-card" style={{ padding:20 }}>
              <div style={{ fontSize:'0.65rem', fontWeight:800, color:'var(--c-indigo-lt)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:16, display:'flex', alignItems:'center', gap:6 }}>
                <i className="fas fa-list-check" /> Verification Audit Trail
              </div>
              <VerificationTimeline cert={cert} isAdmin />
            </div>
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
  const navigate = useNavigate();

  const [cert, setCert]   = useState<CertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    const certId = parseCertId(certificateId || '');
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
          certificate_id:    certId,
          recipient_name:    c.recipient_name  || '—',
          recipient_email:   c.recipient_email || '—',
          event_name:        c.event_name      || '—',
          event_date:        c.event_date      ? new Date(c.event_date).toLocaleDateString() : '—',
          event_creator:     c.event_creator   || '—',
          issued_date:       c.issued_at       ? new Date(c.issued_at).toLocaleDateString()  : '—',
          status:            c.status          || 'unknown',
          sha256_hash:       c.sha256_hash,
          blockchain_tx_hash: c.blockchain_tx_hash,
          is_verified:       vr.success,
          verification_result: vr,
          certificate_pdf_url: c.certificate_pdf_url || `/static/certificates/cert_${certId}.pdf`,
        });
      } else {
        const res = await api.get(`/certificates/public/${certId}`);
        const d = res.data;
        setCert({
          certificate_id:    d.certificate_id,
          recipient_name:    d.recipient_name  || '—',
          recipient_email:   d.recipient_email || '—',
          event_name:        d.event_name      || '—',
          event_description: d.event_description,
          event_date:        d.event_date ? new Date(d.event_date).toLocaleDateString() : '—',
          event_creator:     d.event_creator   || '—',
          issued_date:       d.issued_date ? new Date(d.issued_date).toLocaleDateString() : '—',
          status:            d.status          || 'unknown',
          sha256_hash:       d.sha256_hash,
          blockchain_tx_hash: d.blockchain_tx_hash,
          is_verified:       d.is_verified,
          certificate_pdf_url: d.certificate_pdf_url,
          verification_result: d.verification_result,
        });
      }
    } catch (err: any) {
      if (err.response?.status === 404) setError('Certificate not found.');
      else setError(err.response?.data?.detail || 'Failed to load certificate.');
    } finally { setLoading(false); }
  };

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'var(--grad-bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <span className="ds-spinner ds-spinner-lg" style={{ margin:'0 auto 16px' }} />
        <p style={{ color:'var(--c-text-3)', fontSize:'0.9rem' }}>Loading certificate…</p>
      </div>
    </div>
  );

  if (error || !cert) return (
    <div style={{ minHeight:'100vh', background:'var(--grad-bg)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <motion.div initial={{ scale:0.85, opacity:0 }} animate={{ scale:1, opacity:1 }}
        style={{ maxWidth:440, width:'100%', padding:40, borderRadius:24, textAlign:'center', background:'rgba(15,12,42,0.9)', border:'1px solid rgba(239,68,68,0.3)' }}>
        <i className="fas fa-circle-xmark" style={{ fontSize:'3.5rem', color:'var(--c-red)', marginBottom:16, display:'block' }} />
        <h2 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.25rem', color:'#f87171', marginBottom:8 }}>Certificate Not Found</h2>
        <p style={{ color:'var(--c-text-3)', fontSize:'0.875rem', lineHeight:1.6 }}>{error || 'This certificate does not exist.'}</p>
        <button className="ds-btn ds-btn-primary" style={{ marginTop:16, width:'100%' }} onClick={() => navigate(-1)}>← Go Back</button>
      </motion.div>
    </div>
  );

  if (!isAuthenticated) return <PublicView cert={cert} />;
  const role = user?.role;
  if (role === 'admin' || role === 'super_admin') return <AdminView cert={cert} />;
  return <UserView cert={cert} />;
};

export default VerifyPage;
