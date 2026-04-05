import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import api from '../services/api';
import jsQR from 'jsqr';
import './CertificateValidation.css';

/* ─────────────────────────────────────────────
   Type helpers
───────────────────────────────────────────── */
interface FileVerifyResult {
  certificate_id?: string;
  status: string;
  message?: string;
  details?: {
    recipient_name?: string;
    event_name?: string;
    issue_date?: string;
    issued_at?: string;
    blockchain_verified?: boolean;
    hash_match?: boolean;
    checks?: Record<string, boolean>;
    revocation_reason?: string;
    status?: string;
    message?: string;
  };
}

/* ─────────────────────────────────────────────
   Component
───────────────────────────────────────────── */
const CertificateValidation: React.FC = () => {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [method, setMethod] = useState<'id' | 'qr' | 'file'>('id');

  // Certificate ID state
  const [certId, setCertId]     = useState('');
  const [idError, setIdError]   = useState('');

  // QR state
  const [qrActive, setQrActive] = useState(false);
  const [qrError, setQrError]   = useState('');

  // File upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileResult, setFileResult]     = useState<FileVerifyResult | null>(null);
  const [fileLoading, setFileLoading]   = useState(false);
  const [fileError, setFileError]       = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);

  /* ── Certificate ID: navigate directly to VerifyPage ── */
  const handleIdVerify = () => {
    const id = certId.trim();
    if (!id) { setIdError('Please enter a Certificate ID'); return; }
    setIdError('');
    navigate(`/verify/${id}`);
  };

  /* ── QR Scanner ── */
  const startQR = useCallback(async () => {
    setQrError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setQrActive(true);
      }
    } catch { setQrError('Camera access denied or not available'); }
  }, []);

  const stopQR = useCallback(() => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setQrActive(false);
  }, []);

  const scanQR = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    const ctx    = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code) {
      stopQR();
      let foundId = '';
      try {
        const parsed = JSON.parse(code.data);
        foundId = parsed.certificate_id || parsed.id || '';
      } catch {
        const urlMatch = code.data.match(/\/verify\/([A-Z0-9-]+)/i);
        if (urlMatch)              foundId = urlMatch[1];
        else if (code.data.startsWith('CERT-')) foundId = code.data;
      }
      if (foundId) navigate(`/verify/${foundId}`);
      else         setQrError('QR code does not contain a valid certificate ID');
    }
  }, [stopQR, navigate]);

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (qrActive) interval = setInterval(scanQR, 400);
    return () => { if (interval) clearInterval(interval); };
  }, [qrActive, scanQR]);

  /* ── File Upload: navigate to VerifyPage if cert found ── */
  const validateFile = async (file: File) => {
    setFileError('');
    setFileResult(null);
    setFileLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await api.post('/certificates/verify-file-public', formData, {
        headers: { 'Content-Type': 'multipart/form-data', ...(token && { Authorization: `Bearer ${token}` }) }
      });
      const raw = response.data;

      // Backend nests certificate_id inside a "certificate" object — extract it.
      const certId: string | undefined =
        raw.certificate_id || raw.certificate?.certificate_id;

      const hasFraud     = raw.fraud_detected === true || (raw.fraud_indicators?.length ?? 0) >= 2;
      const hashOk       = raw.verification_details?.hash_verification !== false;
      const blockchainOk = raw.verification_details?.blockchain_verification === true;

      // Derive a flat status string the statusInfo() helper understands.
      let derivedStatus: string;
      if (!certId)           derivedStatus = 'not_found';
      else if (!raw.success) derivedStatus = hasFraud ? 'tampered' : 'suspicious';
      else                   derivedStatus = 'valid';

      const normalised: FileVerifyResult = {
        certificate_id: certId,
        status:         raw.status || derivedStatus,
        message:        raw.message,
        details: {
          recipient_name:     raw.certificate?.recipient_name,
          event_name:         raw.certificate?.event_name,
          issue_date:         raw.certificate?.issued_at || raw.certificate?.issued_date,
          hash_match:         hashOk,
          blockchain_verified: blockchainOk,
          checks: raw.fraud_indicators?.length
            ? Object.fromEntries(
                (raw.fraud_indicators as string[]).map((ind: string) => [ind, false])
              )
            : undefined,
          revocation_reason: raw.certificate?.revocation_reason,
        },
      };

      // Valid certificate found → open full VerifyPage with complete audit view.
      if (raw.success && certId) {
        navigate(`/verify/${certId}`);
        return;
      }

      // Tampered / not-found / suspicious → show result card here.
      setFileResult(normalised);
    } catch (err: any) {
      setFileError(err.response?.data?.detail || 'File verification failed');
    } finally {
      setFileLoading(false);
    }
  };

  /* ── Status helpers ── */
  const normalize = (s: string) => (s || '').toLowerCase().replace(/^certificatestatus\./i, '');

  const statusInfo = (status: string) => {
    const s = normalize(status);
    if (s === 'valid')       return { icon: '✅', label: 'Valid',      color: '#10b981', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)' };
    if (s === 'tampered')    return { icon: '⚠️', label: 'Tampered',   color: '#ef4444', bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.4)' };
    if (s === 'suspicious')  return { icon: '🔍', label: 'Suspicious', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)' };
    if (s === 'not_found')   return { icon: '❓', label: 'Not Found',  color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.3)' };
    return                          { icon: '❌', label: status,       color: '#ef4444', bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.4)' };
  };

  /* ──────────────────────────────────────────────────────────
     Render
  ────────────────────────────────────────────────────────── */
  return (
    <div className="cv-page">
      <div className="cv-hero">
        <div className="cv-hero-icon">🔐</div>
        <div>
          <h1 className="cv-hero-title">Certificate Verification</h1>
          <p className="cv-hero-sub">Verify authenticity, blockchain integrity, and DID ownership of any certificate</p>
        </div>
      </div>

      <div className="cv-container">
        <div className="cv-card">
          <h2 className="cv-card-title">Select Verification Method</h2>

          {/* Method tabs */}
          <div className="cv-method-tabs">
            {([
              { id: 'id',   icon: '🪪', label: 'Certificate ID' },
              { id: 'qr',   icon: '📱', label: 'QR Code Scan'   },
              { id: 'file', icon: '📄', label: 'Upload PDF'      },
            ] as const).map(m => (
              <button
                key={m.id}
                className={`cv-method-tab ${method === m.id ? 'cv-tab-active' : ''}`}
                onClick={() => { setMethod(m.id); if (qrActive) stopQR(); setFileResult(null); setFileError(''); setIdError(''); }}
              >
                <span className="cv-tab-icon">{m.icon}</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          {/* ── Certificate ID ── */}
          {method === 'id' && (
            <div className="cv-input-section">
              <label className="cv-label">Certificate ID</label>
              <div className="cv-input-row">
                <input
                  className="cv-input"
                  type="text"
                  value={certId}
                  autoFocus
                  onChange={e => setCertId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleIdVerify()}
                  placeholder="Enter Certificate ID  (e.g. CERT-ABC123456789)"
                />
                <button
                  className="cv-btn cv-btn-primary"
                  onClick={handleIdVerify}
                  disabled={!certId.trim()}
                >
                  🔍 Verify
                </button>
              </div>
              {idError && <p className="cv-field-error">{idError}</p>}
              <p className="cv-hint">
                Type the certificate ID and press <kbd>Enter</kbd> or click <strong>Verify</strong> — the full verification report opens instantly.
              </p>
            </div>
          )}

          {/* ── QR Code ── */}
          {method === 'qr' && (
            <div className="cv-input-section">
              <div className="cv-qr-wrapper">
                <video
                  ref={videoRef}
                  className="cv-qr-video"
                  style={{ display: qrActive ? 'block' : 'none' }}
                  playsInline muted
                />
                {!qrActive && (
                  <div className="cv-qr-placeholder">
                    <span className="cv-qr-icon">📷</span>
                    <p>Camera activates when you click Start Camera</p>
                  </div>
                )}
                {qrActive && <div className="cv-qr-overlay" />}
                <canvas ref={canvasRef} style={{ display: 'none' }} />
              </div>
              <div className="cv-qr-actions">
                {!qrActive
                  ? <button className="cv-btn cv-btn-success" onClick={startQR}>📷 Start Camera</button>
                  : <button className="cv-btn cv-btn-danger"  onClick={stopQR}>⏹ Stop Camera</button>}
              </div>
              {qrError && <div className="cv-error">{qrError}<button onClick={() => setQrError('')}>×</button></div>}
              <div className="cv-info-box">
                📌 Point camera at the QR code on the certificate. Scanning is automatic — the full verification report opens immediately.
              </div>
            </div>
          )}

          {/* ── File Upload ── */}
          {method === 'file' && (
            <div className="cv-input-section">
              {/* Show result card only when tampered/not-found (if cert found, we redirect) */}
              {fileResult ? (
                <div>
                  {(() => {
                    const si = statusInfo(fileResult.status);
                    const d  = fileResult.details || {};
                    return (
                      <div className="cv-result-card" style={{ background: si.bg, borderColor: si.border, marginBottom: 16 }}>
                        <div className="cv-result-header">
                          <span className="cv-result-icon">{si.icon}</span>
                          <div>
                            <h2 className="cv-result-title" style={{ color: si.color }}>Certificate {si.label}</h2>
                            <p className="cv-result-message">{fileResult.message || d.message}</p>
                          </div>
                        </div>

                        {(d.recipient_name || d.event_name) && (
                          <div className="cv-detail-mini">
                            {d.recipient_name && <div className="cv-detail-row"><span>Recipient</span><strong>{d.recipient_name}</strong></div>}
                            {d.event_name     && <div className="cv-detail-row"><span>Event</span><strong>{d.event_name}</strong></div>}
                            {(d.issue_date || d.issued_at) && (
                              <div className="cv-detail-row">
                                <span>Issued</span>
                                <strong>{new Date(d.issue_date || d.issued_at || '').toLocaleDateString()}</strong>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Verification checks */}
                        <div className="cv-checks" style={{ marginTop: 12 }}>
                          <div className={`cv-check ${d.hash_match !== false ? 'check-pass' : 'check-fail'}`}>
                            <span>{d.hash_match !== false ? '✓' : '✗'}</span> Hash Integrity
                          </div>
                          <div className={`cv-check ${d.blockchain_verified ? 'check-pass' : 'check-warn'}`}>
                            <span>{d.blockchain_verified ? '✓' : '○'}</span> Blockchain Verified
                          </div>
                          {d.checks && Object.entries(d.checks).map(([k, v]) => (
                            <div key={k} className={`cv-check ${v ? 'check-pass' : 'check-fail'}`}>
                              <span>{v ? '✓' : '✗'}</span> {k.replace(/_/g, ' ')}
                            </div>
                          ))}
                        </div>

                        {d.revocation_reason && (
                          <div className="cv-revoke-reason"><strong>Reason:</strong> {d.revocation_reason}</div>
                        )}

                        <button
                          className="cv-btn cv-btn-ghost"
                          style={{ marginTop: 16 }}
                          onClick={() => { setFileResult(null); setUploadedFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                        >
                          ← Upload Another
                        </button>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <>
                  <div
                    className="cv-dropzone"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault();
                      const f = e.dataTransfer.files[0];
                      if (f) { setUploadedFile(f); validateFile(f); }
                    }}
                  >
                    <span className="cv-dropzone-icon">{fileLoading ? '⏳' : '📤'}</span>
                    <p className="cv-dropzone-title">
                      {fileLoading ? 'Analyzing certificate…' : uploadedFile ? uploadedFile.name : 'Drop PDF certificate here'}
                    </p>
                    <p className="cv-dropzone-sub">or click to browse — supports PDF, JPG, PNG</p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      style={{ display: 'none' }}
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) { setUploadedFile(f); validateFile(f); }
                      }}
                    />
                  </div>
                  {fileLoading && <div className="cv-processing"><span className="cv-spinner" /> Extracting and verifying certificate data…</div>}
                  {fileError  && <div className="cv-error">{fileError}<button onClick={() => setFileError('')}>×</button></div>}
                  <div className="cv-info-box" style={{ marginTop: 12 }}>
                    📌 Upload the PDF certificate. If found in the blockchain, the full verification report opens automatically.
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CertificateValidation;
