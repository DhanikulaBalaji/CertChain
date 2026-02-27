import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import api from '../services/api';
import jsQR from 'jsqr';
import './CertificateValidation.css';

interface ValidationDetails {
  recipient_name?: string;
  event_name?: string;
  issue_date?: string;
  issued_at?: string;
  blockchain_verified?: boolean;
  hash_match?: boolean;
  checks?: Record<string, boolean>;
  status?: string;
  message?: string;
  revocation_reason?: string;
}

interface ValidationResult {
  certificate_id?: string;
  status: 'VALID' | 'TAMPERED' | 'SUSPICIOUS' | 'NOT_FOUND' | 'valid' | 'tampered' | 'suspicious' | 'not_found';
  message?: string;
  details?: ValidationDetails;
  validation_timestamp?: string;
  timestamp?: string;
}

const CertificateValidation: React.FC = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [method, setMethod] = useState<'id' | 'qr' | 'file'>('id');
  const [certId, setCertId] = useState('');
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrActive, setQrActive] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const normalize = (s: string) => (s || '').toLowerCase();

  const validate = async (id: string) => {
    if (!id.trim()) { setError('Please enter a certificate ID'); return; }
    setError(null); setLoading(true);
    try {
      const response = await api.post('/certificates/validate', { certificate_id: id.trim() }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setResult(response.data);
      setStep(3);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Validation failed');
    } finally { setLoading(false); }
  };

  const validateFile = async (file: File) => {
    setError(null); setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await api.post('/certificates/verify-file-public', formData, {
        headers: { 'Content-Type': 'multipart/form-data', ...(token && { Authorization: `Bearer ${token}` }) }
      });
      setResult(response.data);
      setStep(3);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'File validation failed');
    } finally { setLoading(false); }
  };

  const startQR = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setQrActive(true);
        setError(null);
      }
    } catch { setError('Camera access denied or not available'); }
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
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = video.videoWidth;
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
        if (code.data.startsWith('CERT-')) foundId = code.data;
      }
      if (foundId) {
        setCertId(foundId);
        validate(foundId);
      } else {
        setError('QR code does not contain a valid certificate ID');
      }
    }
  }, [stopQR]);

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (qrActive) interval = setInterval(scanQR, 400);
    return () => { if (interval) clearInterval(interval); };
  }, [qrActive, scanQR]);

  const getStatusInfo = (status: string) => {
    const s = normalize(status);
    if (s === 'valid') return { icon: '✅', label: 'Valid', color: '#10b981', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)' };
    if (s === 'tampered') return { icon: '⚠️', label: 'Tampered', color: '#ef4444', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)' };
    if (s === 'suspicious') return { icon: '🔍', label: 'Suspicious', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)' };
    if (s === 'not_found') return { icon: '❓', label: 'Not Found', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.3)' };
    return { icon: '❓', label: status, color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.3)' };
  };

  return (
    <div className="cv-page">
      <div className="cv-hero">
        <div className="cv-hero-icon">🔐</div>
        <div>
          <h1 className="cv-hero-title">Certificate Validation</h1>
          <p className="cv-hero-sub">Verify authenticity, integrity, and blockchain status of any certificate</p>
        </div>
      </div>

      <div className="cv-container">
        {/* Progress Steps */}
        <div className="cv-steps">
          {[
            { n: 1, label: 'Choose Method' },
            { n: 2, label: 'Enter Details' },
            { n: 3, label: 'View Results' },
          ].map(s => (
            <div key={s.n} className={`cv-step ${step >= s.n ? 'cv-step-active' : ''} ${step === s.n ? 'cv-step-current' : ''}`}>
              <div className="cv-step-circle">{step > s.n ? '✓' : s.n}</div>
              <span className="cv-step-label">{s.label}</span>
            </div>
          ))}
          <div className="cv-step-line" />
        </div>

        {error && (
          <div className="cv-error">
            ⚠️ {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        {/* Step 1 & 2: Method Selection + Input */}
        {step < 3 && (
          <div className="cv-card">
            <h2 className="cv-card-title">Select Validation Method</h2>

            <div className="cv-method-tabs">
              {[
                { id: 'id', icon: '🪪', label: 'Certificate ID' },
                { id: 'qr', icon: '📱', label: 'QR Code Scan' },
                { id: 'file', icon: '📄', label: 'Upload PDF' },
              ].map(m => (
                <button
                  key={m.id}
                  className={`cv-method-tab ${method === m.id ? 'cv-tab-active' : ''}`}
                  onClick={() => { setMethod(m.id as any); setStep(2); if (qrActive) stopQR(); }}
                >
                  <span className="cv-tab-icon">{m.icon}</span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>

            {/* Manual ID */}
            {method === 'id' && (
              <div className="cv-input-section">
                <label className="cv-label">Certificate ID</label>
                <div className="cv-input-row">
                  <input
                    className="cv-input"
                    type="text"
                    value={certId}
                    onChange={e => setCertId(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && validate(certId)}
                    placeholder="Enter Certificate ID (e.g. CERT-ABC123456789)"
                  />
                  <button
                    className="cv-btn cv-btn-primary"
                    onClick={() => { setStep(2); validate(certId); }}
                    disabled={loading || !certId.trim()}
                  >
                    {loading ? <><span className="cv-spinner" /> Validating...</> : '🔍 Validate'}
                  </button>
                </div>
                <p className="cv-hint">Enter the unique certificate ID printed on the certificate</p>
              </div>
            )}

            {/* QR Scanner */}
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
                      <p>Camera will activate when you start scanning</p>
                    </div>
                  )}
                  {qrActive && <div className="cv-qr-overlay" />}
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                </div>
                <div className="cv-qr-actions">
                  {!qrActive ? (
                    <button className="cv-btn cv-btn-success" onClick={startQR}>📷 Start Camera</button>
                  ) : (
                    <button className="cv-btn cv-btn-danger" onClick={stopQR}>⏹ Stop Camera</button>
                  )}
                </div>
                <div className="cv-info-box">
                  📌 Point your camera at the QR code on the certificate. Scanning happens automatically.
                </div>
                {loading && <div className="cv-loading-bar"><div className="cv-loading-fill" /></div>}
              </div>
            )}

            {/* File Upload */}
            {method === 'file' && (
              <div className="cv-input-section">
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
                  <span className="cv-dropzone-icon">📤</span>
                  <p className="cv-dropzone-title">{uploadedFile ? uploadedFile.name : 'Drop PDF certificate here'}</p>
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
                {loading && (
                  <div className="cv-processing">
                    <span className="cv-spinner" /> Analyzing certificate...
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Results */}
        {step === 3 && result && (() => {
          const si = getStatusInfo(result.status);
          const details = result.details || {};
          const ts = result.validation_timestamp || result.timestamp;
          return (
            <div className="cv-result-wrapper">
              {/* Status Card */}
              <div className="cv-result-card" style={{ background: si.bg, borderColor: si.border }}>
                <div className="cv-result-header">
                  <span className="cv-result-icon">{si.icon}</span>
                  <div>
                    <h2 className="cv-result-title" style={{ color: si.color }}>
                      Certificate {si.label}
                    </h2>
                    <p className="cv-result-message">{result.message || details.message}</p>
                  </div>
                  <div className="cv-result-id">
                    <span>Certificate ID</span>
                    <code>{result.certificate_id}</code>
                  </div>
                </div>
                {ts && (
                  <p className="cv-result-time">
                    🕐 Validated: {new Date(ts).toLocaleString()}
                  </p>
                )}
              </div>

              {/* Details Grid */}
              {details && Object.keys(details).length > 0 && (
                <div className="cv-details-grid">
                  {/* Certificate Info */}
                  {(details.recipient_name || details.event_name) && (
                    <div className="cv-detail-section">
                      <h3 className="cv-detail-title">📋 Certificate Details</h3>
                      {details.recipient_name && (
                        <div className="cv-detail-row">
                          <span>Recipient</span>
                          <strong>{details.recipient_name}</strong>
                        </div>
                      )}
                      {details.event_name && (
                        <div className="cv-detail-row">
                          <span>Event</span>
                          <strong>{details.event_name}</strong>
                        </div>
                      )}
                      {(details.issue_date || details.issued_at) && (
                        <div className="cv-detail-row">
                          <span>Issue Date</span>
                          <strong>{new Date(details.issue_date || details.issued_at || '').toLocaleDateString()}</strong>
                        </div>
                      )}
                      {details.status && (
                        <div className="cv-detail-row">
                          <span>Status</span>
                          <strong style={{ textTransform: 'capitalize' }}>{details.status}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Verification Checks */}
                  <div className="cv-detail-section">
                    <h3 className="cv-detail-title">🔍 Verification Checks</h3>
                    <div className="cv-checks">
                      <div className={`cv-check ${details.blockchain_verified ? 'check-pass' : 'check-warn'}`}>
                        <span>{details.blockchain_verified ? '✓' : '○'}</span>
                        Blockchain Verified
                      </div>
                      <div className={`cv-check ${details.hash_match !== false ? 'check-pass' : 'check-fail'}`}>
                        <span>{details.hash_match !== false ? '✓' : '✗'}</span>
                        Hash Integrity
                      </div>
                      {details.checks && Object.entries(details.checks).map(([k, v]) => (
                        <div key={k} className={`cv-check ${v ? 'check-pass' : 'check-fail'}`}>
                          <span>{v ? '✓' : '✗'}</span>
                          {k.replace(/_/g, ' ')}
                        </div>
                      ))}
                    </div>

                    {details.revocation_reason && (
                      <div className="cv-revoke-reason">
                        <strong>Revocation Reason:</strong> {details.revocation_reason}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="cv-result-actions">
                <button className="cv-btn cv-btn-ghost" onClick={() => { setStep(1); setResult(null); setCertId(''); setUploadedFile(null); setError(null); }}>
                  ← Validate Another
                </button>
                {normalize(result.status) === 'valid' && result.certificate_id && (
                  <button className="cv-btn cv-btn-primary" onClick={() => navigate(`/certificate/${result.certificate_id}`)}>
                    📋 View Full Details
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default CertificateValidation;
