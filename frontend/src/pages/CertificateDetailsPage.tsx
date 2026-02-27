import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import api from '../services/api';
import './CertificateDetailsPage.css';

interface CertificateDetails {
  id: number;
  certificate_id: string;
  recipient_name: string;
  recipient_email?: string;
  participant_id?: string;
  event_name: string;
  event_description?: string;
  event_date: string;
  event_creator?: string;
  issued_date: string;
  status: string;
  sha256_hash?: string;
  blockchain_tx_hash?: string;
  is_verified: boolean;
  verification_details?: {
    metadata_integrity: boolean;
    hash_verification: boolean;
    database_match: boolean;
    blockchain_verification: boolean;
  };
  verification_score?: number;
}

const CertificateDetailsPage: React.FC = () => {
  const { certificateId } = useParams<{ certificateId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [cert, setCert] = useState<CertificateDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (certificateId) fetchCertificate();
  }, [certificateId]);

  const fetchCertificate = async () => {
    setLoading(true);
    try {
      // Use the public endpoint - works without auth, returns full verification
      const response = await api.get(`/certificates/public/${certificateId}`);
      const data = response.data;
      // Map public endpoint response to our interface
      setCert({
        id: 0,
        certificate_id: data.certificate_id,
        recipient_name: data.recipient_name,
        recipient_email: data.recipient_email,
        participant_id: data.participant_id,
        event_name: data.event_name,
        event_description: data.event_description,
        event_date: data.event_date || '',
        event_creator: data.event_creator,
        issued_date: data.issued_date || '',
        status: data.status,
        sha256_hash: data.sha256_hash,
        blockchain_tx_hash: data.blockchain_tx_hash,
        is_verified: data.is_verified,
        verification_details: data.verification_result?.verification_details,
        verification_score: data.verification_result?.verification_score,
      });
    } catch (err: any) {
      // Fallback to authenticated endpoint
      try {
        const response2 = await api.get(`/certificates/${certificateId}`);
        const d = response2.data;
        setCert({
          ...d,
          event_name: d.event?.name || d.event_name || 'Unknown Event',
          event_date: d.event?.date || d.event_date || '',
          issued_date: d.issued_at || '',
        });
      } catch (err2: any) {
        setError(err2.response?.data?.detail || 'Certificate not found');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!certificateId) return;
    setDownloading(true);
    try {
      const response = await api.get(`/certificates/download/${certificateId}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `certificate_${certificateId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError('Failed to download certificate');
    } finally {
      setDownloading(false);
    }
  };

  const handleVerify = async () => {
    if (!certificateId) return;
    setVerifying(true);
    try {
      const response = await api.post('/certificates/verify-public', {
        certificate_id: certificateId,
        verification_type: 'id_lookup'
      });
      if (cert && response.data.verification_details) {
        setCert(prev => prev ? {
          ...prev,
          verification_details: response.data.verification_details,
          verification_score: response.data.certificate?.verification_score,
          is_verified: response.data.success,
        } : prev);
      }
    } catch { /* silent */ }
    finally { setVerifying(false); }
  };

  const getStatusStyle = (s: string) => {
    switch (s?.toLowerCase()) {
      case 'active': return { bg: 'rgba(16,185,129,0.2)', color: '#34d399', border: 'rgba(16,185,129,0.4)', label: '✓ Active' };
      case 'revoked': return { bg: 'rgba(239,68,68,0.2)', color: '#f87171', border: 'rgba(239,68,68,0.4)', label: '✗ Revoked' };
      default: return { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', border: 'rgba(148,163,184,0.3)', label: s };
    }
  };

  const Check = ({ val }: { val: boolean }) => (
    <span className={`cdp-check ${val ? 'cdp-check-pass' : 'cdp-check-fail'}`}>
      {val ? '✓' : '✗'} {val ? 'Pass' : 'Fail'}
    </span>
  );

  if (loading) {
    return (
      <div className="cdp-page">
        <div className="cdp-loading">
          <div className="cdp-loader" />
          <p>Loading certificate details...</p>
        </div>
      </div>
    );
  }

  if (error || !cert) {
    return (
      <div className="cdp-page">
        <div className="cdp-error-screen">
          <span className="cdp-error-icon">❌</span>
          <h2>{error || 'Certificate not found'}</h2>
          <button className="cdp-btn cdp-btn-ghost" onClick={() => navigate(-1)}>
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  const statusStyle = getStatusStyle(cert.status);

  return (
    <div className="cdp-page">
      {/* Header */}
      <div className="cdp-header">
        <button className="cdp-back-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div className="cdp-header-title">
          <h1>🎓 Certificate Details</h1>
          <code className="cdp-cert-id">{cert.certificate_id}</code>
        </div>
        <div className="cdp-header-actions">
          <button
            className="cdp-btn cdp-btn-verify"
            onClick={handleVerify}
            disabled={verifying}
          >
            {verifying ? <><span className="cdp-spinner" /> Verifying...</> : '🔍 Re-verify'}
          </button>
          <button
            className="cdp-btn cdp-btn-download"
            onClick={handleDownload}
            disabled={downloading || cert.status?.toLowerCase() === 'revoked'}
          >
            {downloading ? <><span className="cdp-spinner" /> Downloading...</> : '⬇️ Download PDF'}
          </button>
        </div>
      </div>

      <div className="cdp-content">
        {/* Main Info Card */}
        <div className="cdp-main-grid">
          {/* Left: Certificate Info */}
          <div className="cdp-card cdp-info-card">
            <div className="cdp-card-gradient" />
            <div className="cdp-cert-icon-wrap">
              <span className="cdp-cert-big-icon">🎓</span>
            </div>

            <div className="cdp-status-row">
              <span
                className="cdp-status-badge"
                style={{ background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}` }}
              >
                {statusStyle.label}
              </span>
              {cert.is_verified && (
                <span className="cdp-verified-badge">✓ Verified</span>
              )}
            </div>

            <h2 className="cdp-event-name">{cert.event_name}</h2>
            <p className="cdp-issued-to">Issued to</p>
            <h3 className="cdp-recipient">{cert.recipient_name}</h3>

            {cert.recipient_email && (
              <p className="cdp-email">{cert.recipient_email}</p>
            )}

            <div className="cdp-meta-grid">
              {cert.participant_id && (
                <div className="cdp-meta-item">
                  <span>🪪</span>
                  <div>
                    <label>Participant ID</label>
                    <strong>{cert.participant_id}</strong>
                  </div>
                </div>
              )}
              <div className="cdp-meta-item">
                <span>📅</span>
                <div>
                  <label>Event Date</label>
                  <strong>{cert.event_date || 'N/A'}</strong>
                </div>
              </div>
              <div className="cdp-meta-item">
                <span>🗓️</span>
                <div>
                  <label>Issued</label>
                  <strong>{cert.issued_date ? new Date(cert.issued_date).toLocaleDateString() : 'N/A'}</strong>
                </div>
              </div>
              {cert.event_creator && (
                <div className="cdp-meta-item">
                  <span>👤</span>
                  <div>
                    <label>Issued By</label>
                    <strong>{cert.event_creator}</strong>
                  </div>
                </div>
              )}
            </div>

            {cert.event_description && (
              <div className="cdp-description">
                <label>Event Description</label>
                <p>{cert.event_description}</p>
              </div>
            )}
          </div>

          {/* Right: Verification & Security */}
          <div className="cdp-right-col">
            {/* Verification Score */}
            {cert.verification_score !== undefined && (
              <div className="cdp-card cdp-score-card">
                <h3>🔐 Verification Score</h3>
                <div className="cdp-score-display">
                  <div
                    className="cdp-score-ring"
                    style={{
                      background: `conic-gradient(
                        ${cert.verification_score >= 80 ? '#10b981' : cert.verification_score >= 60 ? '#f59e0b' : '#ef4444'} 
                        ${cert.verification_score * 3.6}deg,
                        rgba(255,255,255,0.1) 0deg
                      )`
                    }}
                  >
                    <span className="cdp-score-num">{cert.verification_score}</span>
                  </div>
                  <p className="cdp-score-label">
                    {cert.verification_score >= 80 ? '✅ Highly Trusted' : cert.verification_score >= 60 ? '⚠️ Moderate Trust' : '❌ Low Trust'}
                  </p>
                </div>
              </div>
            )}

            {/* Verification Checks */}
            {cert.verification_details && (
              <div className="cdp-card cdp-checks-card">
                <h3>🔍 Security Checks</h3>
                <div className="cdp-check-list">
                  <div className="cdp-check-row">
                    <span>Metadata Integrity</span>
                    <Check val={cert.verification_details.metadata_integrity} />
                  </div>
                  <div className="cdp-check-row">
                    <span>Hash Verification</span>
                    <Check val={cert.verification_details.hash_verification} />
                  </div>
                  <div className="cdp-check-row">
                    <span>Database Record</span>
                    <Check val={cert.verification_details.database_match} />
                  </div>
                  <div className="cdp-check-row">
                    <span>Blockchain Anchor</span>
                    <Check val={cert.verification_details.blockchain_verification} />
                  </div>
                </div>
              </div>
            )}

            {/* Blockchain Info */}
            <div className="cdp-card cdp-blockchain-card">
              <h3>🔗 Blockchain & Cryptography</h3>
              {cert.blockchain_tx_hash ? (
                <div className="cdp-blockchain-data">
                  <div className="cdp-data-item">
                    <label>Transaction Hash</label>
                    <code>{cert.blockchain_tx_hash}</code>
                  </div>
                  <div className="cdp-blockchain-badge">
                    ✓ Recorded on Ethereum Blockchain
                  </div>
                </div>
              ) : (
                <div className="cdp-no-blockchain">
                  <span>○</span> Blockchain transaction pending
                </div>
              )}

              {cert.sha256_hash && (
                <div className="cdp-data-item" style={{ marginTop: '1rem' }}>
                  <label>SHA-256 Hash</label>
                  <code className="cdp-hash">{cert.sha256_hash}</code>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CertificateDetailsPage;
