import React, { useRef, useState } from 'react';
import { Modal } from 'react-bootstrap';
import QRScannerEmbedded from '../components/QRScannerEmbedded';
import { useAuth } from '../services/AuthContext';
import api from '../services/api';
import './UserDashboard.css';

interface CertificateVerification {
  certificate_id: string;
  recipient_name: string;
  event_name: string;
  event_id: string;
  event_creator?: string;
  event_date?: string;
  issued_date: string;
  issued_at: string;
  status: string;
  is_verified?: boolean;
  sha256_hash?: string;
  blockchain_tx_hash?: string;
  verification_score: number;
}

interface VerificationResult {
  success: boolean;
  certificate?: CertificateVerification;
  message: string;
  fraud_indicators?: string[];
  fraud_detected?: boolean;
  verification_details?: {
    metadata_integrity: boolean;
    hash_verification: boolean;
    database_match: boolean;
    blockchain_verification: boolean;
  };
  verification_status?: string;
  ownership_pending?: boolean;
  ownership_verified?: boolean;
  challenge?: string;
  claimed_to_wallet?: boolean;
}

const UserDashboard: React.FC = () => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [certificateId, setCertificateId] = useState('');
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [activeMethod, setActiveMethod] = useState<'id' | 'qr' | 'upload'>('id');
  const [completingOwnership, setCompletingOwnership] = useState(false);
  const [ownershipResult, setOwnershipResult] = useState<{ success: boolean; verification_status?: string; message?: string } | null>(null);
  const [claimingWallet, setClaimingWallet] = useState(false);
  const [claimedToWallet, setClaimedToWallet] = useState(false);

  const handleCertificateVerification = async () => {
    if (!certificateId.trim()) { setError('Please enter a certificate ID'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const response = await api.post('/certificates/verify-public', {
        certificate_id: certificateId.trim(),
        verification_type: 'id_lookup'
      });
      setVerificationResult(response.data);
      setOwnershipResult(null);
      setClaimedToWallet(!!response.data.claimed_to_wallet);
      setShowVerificationModal(true);
      if (response.data.fraud_detected) await notifySuperAdminFraud(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Certificate verification failed');
    } finally { setLoading(false); }
  };

  const handleQRScan = (result: string) => {
    setShowQRScanner(false);
    setActiveMethod('qr');
    try {
      const qrData = JSON.parse(result);
      if (qrData.certificate_id) {
        setCertificateId(qrData.certificate_id);
        verifyQRData(qrData);
      } else {
        setError('QR code does not contain a valid certificate ID');
      }
    } catch {
      if (result.startsWith('CERT-') || result.match(/^CERT-[A-Z0-9]+$/i)) {
        setCertificateId(result);
        verifyCertificateById(result);
      } else {
        setError('Invalid QR code format');
      }
    }
  };

  const verifyQRData = async (qrData: any) => {
    setLoading(true);
    try {
      const response = await api.post('/certificates/verify-public', {
        certificate_id: qrData.certificate_id,
        qr_metadata: qrData,
        verification_type: 'qr_scan'
      });
      setVerificationResult(response.data);
      setOwnershipResult(null);
      setClaimedToWallet(!!response.data.claimed_to_wallet);
      setShowVerificationModal(true);
      if (response.data.fraud_detected) await notifySuperAdminFraud(response.data);
    } catch (err: any) {
      setError('QR code verification failed');
    } finally { setLoading(false); }
  };

  const verifyCertificateById = async (id: string) => {
    setLoading(true);
    try {
      const response = await api.post('/certificates/verify-public', {
        certificate_id: id,
        verification_type: 'id_lookup'
      });
      setVerificationResult(response.data);
      setOwnershipResult(null);
      setClaimedToWallet(!!response.data.claimed_to_wallet);
      setShowVerificationModal(true);
    } catch { setError('Certificate verification failed'); }
    finally { setLoading(false); }
  };

  const handleClaimCertificate = async () => {
    if (!verificationResult?.certificate?.certificate_id) return;
    setClaimingWallet(true);
    try {
      await api.post('/certificates/claim', { certificate_id: verificationResult.certificate.certificate_id });
      setClaimedToWallet(true);
      setSuccess('Certificate added to your wallet!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not add certificate to wallet.');
    } finally { setClaimingWallet(false); }
  };

  const handleCompleteOwnershipVerification = async () => {
    if (!verificationResult?.certificate?.certificate_id || !verificationResult.challenge) return;
    setCompletingOwnership(true);
    setOwnershipResult(null);
    try {
      const response = await api.post('/certificates/complete-ownership-verification', {
        certificate_id: verificationResult.certificate.certificate_id,
        challenge: verificationResult.challenge
      });
      setOwnershipResult({ success: response.data.success, verification_status: response.data.verification_status, message: response.data.message });
    } catch (err: any) {
      setOwnershipResult({ success: false, message: err.response?.data?.detail || 'Ownership verification failed' });
    } finally { setCompletingOwnership(false); }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) { setError('Please upload a PDF, JPG, or PNG file'); return; }
    setUploadedFile(file);
    setActiveMethod('upload');
    await verifyUploadedFile(file);
  };

  const verifyUploadedFile = async (file: File) => {
    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('verification_type', 'file_upload');
    try {
      const response = await api.post('/certificates/verify-file-public', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setVerificationResult(response.data);
      setOwnershipResult(null);
      setClaimedToWallet(!!response.data.claimed_to_wallet);
      setShowVerificationModal(true);
      if (response.data.fraud_detected) await notifySuperAdminFraud(response.data);
    } catch (err: any) {
      setError('File verification failed: ' + (err.response?.data?.detail || 'Unknown error'));
    } finally { setLoading(false); }
  };

  const handleDownloadCertificate = async (certId: string) => {
    try {
      setLoading(true);
      const response = await api.get(`/certificates/download/${certId}`, {
        responseType: 'blob',
        timeout: 30000
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `certificate_${certId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setSuccess('Certificate downloaded successfully');
    } catch (err: any) {
      setError('Failed to download certificate: ' + (err.response?.data?.detail || err.message));
    } finally { setLoading(false); }
  };

  const notifySuperAdminFraud = async (fraudData: VerificationResult) => {
    try {
      await api.post('/admin/fraud-alert', {
        certificate_id: fraudData.certificate?.certificate_id,
        fraud_indicators: fraudData.fraud_indicators,
        detection_method: activeMethod,
        detected_by: user?.email,
      });
    } catch { /* silent */ }
  };

  const resetForm = () => {
    setCertificateId('');
    setVerificationResult(null);
    setUploadedFile(null);
    setError('');
    setSuccess('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const getCheckIcon = (val: boolean) => val
    ? <span className="ud-check-pass">✓</span>
    : <span className="ud-check-fail">✗</span>;

  return (
    <div className="ud-page">
      {/* Hero Banner */}
      <div className="ud-hero">
        <div className="ud-hero-content">
          <div className="ud-hero-icon">🛡️</div>
          <div>
            <h1 className="ud-hero-title">Certificate Verification</h1>
            <p className="ud-hero-subtitle">
              Welcome back, <strong>{user?.full_name || user?.email}</strong> — verify certificates using ID, QR code, or file upload
            </p>
          </div>
        </div>
        <div className="ud-hero-badge">
          <span>🔗 Blockchain Secured</span>
        </div>
      </div>

      <div className="ud-container">
        {error && (
          <div className="ud-alert ud-alert-error">
            <span>⚠️</span> {error}
            <button className="ud-alert-close" onClick={() => setError('')}>×</button>
          </div>
        )}
        {success && (
          <div className="ud-alert ud-alert-success">
            <span>✅</span> {success}
            <button className="ud-alert-close" onClick={() => setSuccess('')}>×</button>
          </div>
        )}

        {/* Verification Method Cards */}
        <div className="ud-methods-grid">
          {/* Certificate ID */}
          <div className={`ud-method-card ${activeMethod === 'id' ? 'ud-method-active' : ''}`}
            onClick={() => setActiveMethod('id')}>
            <div className="ud-method-icon ud-method-icon-blue">🪪</div>
            <h3 className="ud-method-title">Certificate ID</h3>
            <p className="ud-method-desc">Enter certificate ID to verify authenticity instantly</p>
            {activeMethod === 'id' && (
              <div className="ud-method-form" onClick={e => e.stopPropagation()}>
                <input
                  className="ud-input"
                  type="text"
                  placeholder="e.g. CERT-ABC123456789"
                  value={certificateId}
                  onChange={e => setCertificateId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCertificateVerification()}
                />
                <button
                  className="ud-btn ud-btn-primary"
                  onClick={handleCertificateVerification}
                  disabled={loading || !certificateId.trim()}
                >
                  {loading ? <span className="ud-spinner" /> : '🔍'} Verify
                </button>
              </div>
            )}
          </div>

          {/* QR Code */}
          <div className={`ud-method-card ${activeMethod === 'qr' ? 'ud-method-active' : ''}`}
            onClick={() => { setActiveMethod('qr'); setShowQRScanner(true); }}>
            <div className="ud-method-icon ud-method-icon-green">📱</div>
            <h3 className="ud-method-title">QR Code Scan</h3>
            <p className="ud-method-desc">Scan the QR code on a certificate for instant verification</p>
            {activeMethod === 'qr' && (
              <div className="ud-method-form" onClick={e => e.stopPropagation()}>
                <button
                  className="ud-btn ud-btn-success"
                  onClick={() => setShowQRScanner(true)}
                  disabled={loading}
                >
                  📷 Open Scanner
                </button>
                {loading && <div className="ud-spinner-wrap"><span className="ud-spinner" /> Verifying...</div>}
              </div>
            )}
          </div>

          {/* File Upload */}
          <div className={`ud-method-card ${activeMethod === 'upload' ? 'ud-method-active' : ''}`}
            onClick={() => { setActiveMethod('upload'); }}>
            <div className="ud-method-icon ud-method-icon-purple">📄</div>
            <h3 className="ud-method-title">Upload Certificate</h3>
            <p className="ud-method-desc">Upload PDF/image for blockchain & metadata verification</p>
            {activeMethod === 'upload' && (
              <div className="ud-method-form" onClick={e => e.stopPropagation()}>
                <label className="ud-file-label">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileUpload}
                    disabled={loading}
                    className="ud-file-input"
                  />
                  <span>📂 Choose File</span>
                </label>
                {uploadedFile && <p className="ud-file-name">{uploadedFile.name}</p>}
                {loading && <div className="ud-spinner-wrap"><span className="ud-spinner" /> Analyzing...</div>}
              </div>
            )}
          </div>
        </div>

        <div className="ud-actions-bar">
          <button className="ud-btn ud-btn-ghost" onClick={resetForm}>↺ Reset</button>
        </div>
      </div>

      {/* QR Scanner Modal */}
      <Modal show={showQRScanner} onHide={() => setShowQRScanner(false)} centered className="ud-modal">
        <Modal.Header closeButton className="ud-modal-header">
          <Modal.Title>📱 Scan Certificate QR Code</Modal.Title>
        </Modal.Header>
        <Modal.Body className="ud-modal-body">
          <QRScannerEmbedded onScan={handleQRScan} />
        </Modal.Body>
      </Modal>

      {/* Verification Results Modal */}
      <Modal
        show={showVerificationModal}
        onHide={() => { setShowVerificationModal(false); setOwnershipResult(null); setClaimedToWallet(false); }}
        size="lg"
        centered
        className="ud-modal"
      >
        <Modal.Header closeButton className="ud-modal-header">
          <Modal.Title>
            {verificationResult?.success ? '✅' : '❌'} Certificate Verification Results
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="ud-modal-body">
          {verificationResult && (
            <div className="ud-result">
              {/* Status Banner */}
              <div className={`ud-result-banner ${verificationResult.success ? 'ud-banner-success' : 'ud-banner-danger'}`}>
                <div className="ud-banner-icon">
                  {verificationResult.success ? '🔐' : '⚠️'}
                </div>
                <div>
                  <h3>{verificationResult.success ? 'Certificate Verified' : 'Verification Failed'}</h3>
                  <p>{verificationResult.message}</p>
                </div>
                {verificationResult.certificate?.verification_score !== undefined && (
                  <div className="ud-score-circle" style={{ borderColor: getScoreColor(verificationResult.certificate.verification_score) }}>
                    <span style={{ color: getScoreColor(verificationResult.certificate.verification_score) }}>
                      {verificationResult.certificate.verification_score}
                    </span>
                    <small>Score</small>
                  </div>
                )}
              </div>

              {/* Verification Status Badge */}
              {verificationResult.verification_status && (
                <div className="ud-status-badge">
                  <span className={`ud-badge ${verificationResult.ownership_verified ? 'ud-badge-success' : verificationResult.ownership_pending ? 'ud-badge-warning' : 'ud-badge-info'}`}>
                    🔑 {verificationResult.verification_status}
                  </span>
                </div>
              )}

              {/* Certificate Details */}
              {verificationResult.certificate && (
                <div className="ud-cert-grid">
                  <div className="ud-cert-section">
                    <h4 className="ud-section-title">📋 Certificate Info</h4>
                    <div className="ud-info-table">
                      <div className="ud-info-row">
                        <span className="ud-info-label">Certificate ID</span>
                        <code className="ud-info-value">{verificationResult.certificate.certificate_id}</code>
                      </div>
                      <div className="ud-info-row">
                        <span className="ud-info-label">Recipient</span>
                        <span className="ud-info-value">{verificationResult.certificate.recipient_name}</span>
                      </div>
                      <div className="ud-info-row">
                        <span className="ud-info-label">Event</span>
                        <span className="ud-info-value">{verificationResult.certificate.event_name}</span>
                      </div>
                      {verificationResult.certificate.event_date && (
                        <div className="ud-info-row">
                          <span className="ud-info-label">Event Date</span>
                          <span className="ud-info-value">{verificationResult.certificate.event_date}</span>
                        </div>
                      )}
                      <div className="ud-info-row">
                        <span className="ud-info-label">Issued</span>
                        <span className="ud-info-value">
                          {verificationResult.certificate.issued_date
                            ? new Date(verificationResult.certificate.issued_date).toLocaleDateString()
                            : 'N/A'}
                        </span>
                      </div>
                      {verificationResult.certificate.event_creator && (
                        <div className="ud-info-row">
                          <span className="ud-info-label">Issued By</span>
                          <span className="ud-info-value">{verificationResult.certificate.event_creator}</span>
                        </div>
                      )}
                      <div className="ud-info-row">
                        <span className="ud-info-label">Status</span>
                        <span className={`ud-status-chip ${verificationResult.certificate.status === 'active' ? 'chip-active' : 'chip-revoked'}`}>
                          {verificationResult.certificate.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="ud-cert-section">
                    <h4 className="ud-section-title">🔍 Verification Checks</h4>
                    {verificationResult.verification_details && (
                      <div className="ud-checks-list">
                        <div className="ud-check-item">
                          {getCheckIcon(verificationResult.verification_details.metadata_integrity)}
                          <span>Metadata Integrity</span>
                        </div>
                        <div className="ud-check-item">
                          {getCheckIcon(verificationResult.verification_details.hash_verification)}
                          <span>SHA-256 Hash Match</span>
                        </div>
                        <div className="ud-check-item">
                          {getCheckIcon(verificationResult.verification_details.database_match)}
                          <span>Database Record Match</span>
                        </div>
                        <div className="ud-check-item">
                          {getCheckIcon(verificationResult.verification_details.blockchain_verification)}
                          <span>Blockchain Anchored</span>
                        </div>
                      </div>
                    )}

                    {verificationResult.certificate.blockchain_tx_hash && (
                      <div className="ud-blockchain-info">
                        <h5>🔗 Blockchain Transaction</h5>
                        <code className="ud-tx-hash">{verificationResult.certificate.blockchain_tx_hash}</code>
                      </div>
                    )}

                    {verificationResult.certificate.sha256_hash && (
                      <div className="ud-blockchain-info">
                        <h5># SHA-256 Hash</h5>
                        <code className="ud-tx-hash">{verificationResult.certificate.sha256_hash.substring(0, 32)}...</code>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* DID Ownership Verification */}
              {verificationResult.success && verificationResult.certificate && (verificationResult.ownership_pending || ownershipResult) && (
                <div className="ud-did-section">
                  <h4 className="ud-section-title">🪪 DID Ownership Verification</h4>
                  <p className="ud-did-desc">Prove you are the certificate owner using your Decentralized Identity (DID)</p>
                  {ownershipResult ? (
                    <div className={`ud-ownership-result ${ownershipResult.success ? 'ownership-success' : 'ownership-fail'}`}>
                      <strong>{ownershipResult.verification_status || (ownershipResult.success ? '✅ Ownership Verified' : '❌ Failed')}</strong>
                      {ownershipResult.message && <p>{ownershipResult.message}</p>}
                    </div>
                  ) : verificationResult.ownership_pending && verificationResult.challenge ? (
                    <button
                      className="ud-btn ud-btn-info"
                      onClick={handleCompleteOwnershipVerification}
                      disabled={completingOwnership}
                    >
                      {completingOwnership ? <><span className="ud-spinner" /> Verifying...</> : '🔑 Verify DID Ownership'}
                    </button>
                  ) : null}
                </div>
              )}

              {/* Fraud Alert */}
              {verificationResult.fraud_detected && (
                <div className="ud-fraud-alert">
                  <h4>⚠️ Fraud Detected!</h4>
                  <p>This certificate has been flagged as potentially fraudulent. SuperAdmin has been notified.</p>
                  {verificationResult.fraud_indicators && (
                    <ul>
                      {verificationResult.fraud_indicators.map((ind, i) => <li key={i}>{ind}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="ud-modal-footer">
          {verificationResult?.success && verificationResult.certificate && (
            <>
              {claimedToWallet ? (
                <span className="ud-wallet-badge">✅ In your wallet</span>
              ) : (
                <button className="ud-btn ud-btn-outline-success" onClick={handleClaimCertificate} disabled={claimingWallet}>
                  {claimingWallet ? <><span className="ud-spinner" /> Adding...</> : '💼 Add to Wallet'}
                </button>
              )}
              <button
                className="ud-btn ud-btn-primary"
                onClick={() => handleDownloadCertificate(verificationResult.certificate!.certificate_id)}
              >
                ⬇️ Download PDF
              </button>
            </>
          )}
          <button className="ud-btn ud-btn-ghost" onClick={() => { setShowVerificationModal(false); setOwnershipResult(null); setClaimedToWallet(false); }}>
            Close
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default UserDashboard;
