import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import './PublicCertificateView.css';

const API_BASE = 'http://localhost:8001/api/v1';

interface CertData {
  certificate_id: string;
  recipient_name: string;
  recipient_email?: string;
  participant_id?: string;
  event_name: string;
  event_description?: string;
  event_date?: string;
  event_creator?: string;
  issued_date?: string;
  status: string;
  sha256_hash?: string;
  blockchain_tx_hash?: string;
  is_verified: boolean;
  verification_result?: {
    success: boolean;
    message: string;
    verification_score?: number;
    verification_details?: {
      metadata_integrity: boolean;
      hash_verification: boolean;
      database_match: boolean;
      blockchain_verification: boolean;
    };
    fraud_detected?: boolean;
  };
  certificate_image_url?: string;
  certificate_pdf_url?: string;
}

const PublicCertificateView: React.FC = () => {
  const { certificateId: paramId } = useParams<{ certificateId: string }>();
  const [searchParams] = useSearchParams();
  const certIdFromQuery = searchParams.get('id') || searchParams.get('certificate_id');
  const certificateId = paramId || certIdFromQuery;

  const [cert, setCert] = useState<CertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (certificateId) {
      fetchCertificate(certificateId);
    } else {
      setError('No certificate ID provided');
      setLoading(false);
    }
  }, [certificateId]);

  const fetchCertificate = async (id: string) => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/certificates/public/${id}`);
      setCert(response.data);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setError('Certificate not found. The certificate ID may be invalid or the certificate has been deleted.');
      } else {
        setError('Failed to load certificate. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return { icon: '✅', label: 'Valid & Active', color: '#10b981', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)' };
      case 'revoked': return { icon: '❌', label: 'Revoked', color: '#ef4444', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)' };
      default: return { icon: '⚠️', label: status, color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)' };
    }
  };

  const getVerificationScore = (vr?: CertData['verification_result']) => {
    if (!vr) return 0;
    return vr.verification_score || (vr.success ? 80 : 30);
  };

  if (loading) {
    return (
      <div className="pcv-page">
        <div className="pcv-brand">
          <span className="pcv-brand-icon">🏛️</span>
          <span>Certificate Verification Portal</span>
        </div>
        <div className="pcv-loading">
          <div className="pcv-loader" />
          <p>Verifying certificate authenticity...</p>
          <small>Checking blockchain records and cryptographic integrity</small>
        </div>
      </div>
    );
  }

  if (error || !cert) {
    return (
      <div className="pcv-page">
        <div className="pcv-brand">
          <span className="pcv-brand-icon">🏛️</span>
          <span>Certificate Verification Portal</span>
        </div>
        <div className="pcv-error">
          <span className="pcv-error-icon">❌</span>
          <h2>Certificate Not Found</h2>
          <p>{error}</p>
          <div className="pcv-cert-id-searched">
            Searched for: <code>{certificateId}</code>
          </div>
        </div>
      </div>
    );
  }

  const statusInfo = getStatusInfo(cert.status);
  const vr = cert.verification_result;
  const score = getVerificationScore(vr);
  const isValid = cert.status?.toLowerCase() === 'active' && vr?.success;

  return (
    <div className="pcv-page">
      {/* Brand Header */}
      <div className="pcv-brand">
        <span className="pcv-brand-icon">🏛️</span>
        <span>Blockchain Certificate Verification Portal</span>
        <span className={`pcv-overall-status ${isValid ? 'status-valid' : 'status-invalid'}`}>
          {isValid ? '✅ AUTHENTIC' : '⚠️ INVALID'}
        </span>
      </div>

      <div className="pcv-container">
        {/* Main Status Banner */}
        <div className="pcv-status-banner" style={{ background: statusInfo.bg, borderColor: statusInfo.border }}>
          <div className="pcv-status-icon">{statusInfo.icon}</div>
          <div className="pcv-status-content">
            <h1 className="pcv-status-title" style={{ color: statusInfo.color }}>
              Certificate {statusInfo.label}
            </h1>
            <p className="pcv-status-msg">{vr?.message || `This certificate is ${cert.status}`}</p>
          </div>
          <div className="pcv-score-wrap">
            <div className="pcv-score-circle">
              <span className="pcv-score-num">{score}</span>
              <span className="pcv-score-label">Trust Score</span>
            </div>
          </div>
        </div>

        {/* Certificate Image */}
        {cert.certificate_image_url && !imageError && (
          <div className="pcv-cert-image-wrap">
            <h2 className="pcv-section-title">📜 Certificate</h2>
            <div className="pcv-cert-image-container">
              <img
                src={`http://localhost:8001${cert.certificate_image_url}`}
                alt="Certificate"
                className="pcv-cert-image"
                onError={() => setImageError(true)}
              />
              <div className="pcv-cert-image-overlay">
                {isValid ? (
                  <div className="pcv-cert-seal valid-seal">
                    <span>✓</span>
                    <p>Blockchain Verified</p>
                  </div>
                ) : (
                  <div className="pcv-cert-seal invalid-seal">
                    <span>✗</span>
                    <p>Not Valid</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Certificate Details Grid */}
        <div className="pcv-details-grid">
          {/* Recipient Info */}
          <div className="pcv-card">
            <h2 className="pcv-card-title">👤 Recipient Information</h2>
            <div className="pcv-info-list">
              <div className="pcv-info-item">
                <span className="pcv-info-label">Recipient Name</span>
                <strong className="pcv-info-value pcv-highlight">{cert.recipient_name}</strong>
              </div>
              {cert.recipient_email && (
                <div className="pcv-info-item">
                  <span className="pcv-info-label">Email</span>
                  <strong className="pcv-info-value">{cert.recipient_email}</strong>
                </div>
              )}
              {cert.participant_id && (
                <div className="pcv-info-item">
                  <span className="pcv-info-label">Participant/Student ID</span>
                  <strong className="pcv-info-value">{cert.participant_id}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Event Info */}
          <div className="pcv-card">
            <h2 className="pcv-card-title">🎪 Event Information</h2>
            <div className="pcv-info-list">
              <div className="pcv-info-item">
                <span className="pcv-info-label">Event Name</span>
                <strong className="pcv-info-value pcv-highlight">{cert.event_name}</strong>
              </div>
              {cert.event_date && (
                <div className="pcv-info-item">
                  <span className="pcv-info-label">Event Date</span>
                  <strong className="pcv-info-value">{cert.event_date}</strong>
                </div>
              )}
              {cert.event_creator && (
                <div className="pcv-info-item">
                  <span className="pcv-info-label">Issued By</span>
                  <strong className="pcv-info-value">{cert.event_creator}</strong>
                </div>
              )}
              {cert.issued_date && (
                <div className="pcv-info-item">
                  <span className="pcv-info-label">Issue Date</span>
                  <strong className="pcv-info-value">
                    {new Date(cert.issued_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </strong>
                </div>
              )}
              {cert.event_description && (
                <div className="pcv-info-item pcv-info-desc">
                  <span className="pcv-info-label">Description</span>
                  <p className="pcv-info-value">{cert.event_description}</p>
                </div>
              )}
            </div>
          </div>

          {/* Verification Checks */}
          <div className="pcv-card">
            <h2 className="pcv-card-title">🔍 Verification Results</h2>
            {vr?.verification_details ? (
              <div className="pcv-checks">
                {[
                  { label: 'Metadata Integrity', val: vr.verification_details.metadata_integrity, desc: 'Certificate data is consistent and unmodified' },
                  { label: 'Cryptographic Hash', val: vr.verification_details.hash_verification, desc: 'SHA-256 hash matches original' },
                  { label: 'Database Record', val: vr.verification_details.database_match, desc: 'Found in official certificate registry' },
                  { label: 'Blockchain Anchor', val: vr.verification_details.blockchain_verification, desc: 'Recorded on Ethereum blockchain' },
                ].map(c => (
                  <div key={c.label} className={`pcv-check ${c.val ? 'pcv-check-pass' : 'pcv-check-warn'}`}>
                    <span className="pcv-check-icon">{c.val ? '✓' : '○'}</span>
                    <div>
                      <strong>{c.label}</strong>
                      <p>{c.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="pcv-no-data">Verification details not available</p>
            )}
          </div>

          {/* Blockchain Info */}
          <div className="pcv-card">
            <h2 className="pcv-card-title">🔗 Blockchain & Cryptography</h2>
            <div className="pcv-info-list">
              <div className="pcv-info-item">
                <span className="pcv-info-label">Certificate ID</span>
                <code className="pcv-code">{cert.certificate_id}</code>
              </div>
              {cert.sha256_hash && (
                <div className="pcv-info-item">
                  <span className="pcv-info-label">SHA-256 Hash</span>
                  <code className="pcv-code pcv-code-sm">{cert.sha256_hash}</code>
                </div>
              )}
              {cert.blockchain_tx_hash ? (
                <>
                  <div className="pcv-info-item">
                    <span className="pcv-info-label">Blockchain Transaction</span>
                    <code className="pcv-code pcv-code-sm">{cert.blockchain_tx_hash}</code>
                  </div>
                  <div className="pcv-blockchain-confirmed">
                    🔗 Confirmed on Ethereum Network
                  </div>
                </>
              ) : (
                <div className="pcv-info-item">
                  <span className="pcv-info-label">Blockchain Status</span>
                  <span className="pcv-code" style={{ color: '#f59e0b', fontSize: '0.8rem' }}>
                    Transaction Pending
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fraud Alert */}
        {vr?.fraud_detected && (
          <div className="pcv-fraud-alert">
            <span className="pcv-fraud-icon">⚠️</span>
            <div>
              <strong>Potential Fraud Detected</strong>
              <p>This certificate has been flagged for suspicious activity. Please report to the issuing institution.</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pcv-footer">
          <p>🔐 This verification was performed using blockchain cryptography and is tamper-proof.</p>
          <p>Verified on {new Date().toLocaleString('en-IN')}</p>
        </div>
      </div>
    </div>
  );
};

export default PublicCertificateView;
