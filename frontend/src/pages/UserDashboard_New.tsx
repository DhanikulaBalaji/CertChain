import React, { useState, useRef } from 'react';
import { Container, Row, Col, Card, Button, Form, Alert, Modal, Badge, Table } from 'react-bootstrap';
import { useAuth } from '../services/AuthContext';
import api from '../services/api';
import QRScannerEmbedded from '../components/QRScannerEmbedded';

interface CertificateVerification {
  certificate_id: string;
  recipient_name: string;
  event_name: string;
  issued_date: string;
  status: string;
  is_verified: boolean;
  sha256_hash: string;
  blockchain_tx_hash?: string;
  metadata_match?: boolean;
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
}

const UserDashboard: React.FC = () => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // States
  const [certificateId, setCertificateId] = useState('');
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [activeVerificationMethod, setActiveVerificationMethod] = useState<'id' | 'qr' | 'upload'>('id');

  // Certificate verification by ID
  const handleCertificateVerification = async () => {
    if (!certificateId.trim()) {
      setError('Please enter a certificate ID');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.post('/certificates/verify-comprehensive', {
        certificate_id: certificateId.trim(),
        verification_type: 'id_lookup'
      });

      setVerificationResult(response.data);
      setShowVerificationModal(true);

      // If fraud detected, notify SuperAdmin
      if (response.data.fraud_detected) {
        await notifySuperAdminFraud(response.data);
      }

    } catch (err: any) {
      setError(err.response?.data?.detail || 'Certificate verification failed');
      setVerificationResult({
        success: false,
        message: 'Certificate not found or verification failed'
      });
    } finally {
      setLoading(false);
    }
  };

  // QR Code scanning verification
  const handleQRScan = (result: string) => {
    try {
      // Try to parse QR code data
      const qrData = JSON.parse(result);
      if (qrData.certificate_id) {
        setCertificateId(qrData.certificate_id);
        setActiveVerificationMethod('qr');
        verifyQRData(qrData);
      }
    } catch {
      // If not JSON, assume it's just the certificate ID
      setCertificateId(result);
      setActiveVerificationMethod('qr');
      verifyCertificateById(result);
    }
    setShowQRScanner(false);
  };

  // Verify QR code data
  const verifyQRData = async (qrData: any) => {
    setLoading(true);
    try {
      const response = await api.post('/certificates/verify-comprehensive', {
        certificate_id: qrData.certificate_id,
        qr_metadata: qrData,
        verification_type: 'qr_scan'
      });

      setVerificationResult(response.data);
      setShowVerificationModal(true);

      if (response.data.fraud_detected) {
        await notifySuperAdminFraud(response.data);
      }
    } catch (err: any) {
      setError('QR code verification failed');
    } finally {
      setLoading(false);
    }
  };

  // Verify certificate by ID (for QR fallback)
  const verifyCertificateById = async (id: string) => {
    setLoading(true);
    try {
      const response = await api.post('/certificates/verify-comprehensive', {
        certificate_id: id,
        verification_type: 'qr_id_fallback'
      });

      setVerificationResult(response.data);
      setShowVerificationModal(true);
    } catch (err: any) {
      setError('Certificate verification failed');
    } finally {
      setLoading(false);
    }
  };

  // File upload verification
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please upload a PDF, JPG, or PNG file');
      return;
    }

    setUploadedFile(file);
    setActiveVerificationMethod('upload');
    await verifyUploadedFile(file);
  };

  // Verify uploaded file
  const verifyUploadedFile = async (file: File) => {
    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('verification_type', 'file_upload');

    try {
      const response = await api.post('/certificates/verify-file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setVerificationResult(response.data);
      setShowVerificationModal(true);

      if (response.data.fraud_detected) {
        await notifySuperAdminFraud(response.data);
      }
    } catch (err: any) {
      setError('File verification failed: ' + (err.response?.data?.detail || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Download certificate
  const handleDownloadCertificate = async (certificateId: string) => {
    try {
      const response = await api.get(`/certificates/${certificateId}/download`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `certificate_${certificateId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setSuccess('Certificate downloaded successfully');
    } catch (err: any) {
      setError('Failed to download certificate');
    }
  };

  // Notify SuperAdmin about fraud
  const notifySuperAdminFraud = async (fraudData: VerificationResult) => {
    try {
      await api.post('/admin/fraud-alert', {
        certificate_id: fraudData.certificate?.certificate_id,
        fraud_indicators: fraudData.fraud_indicators,
        detection_method: activeVerificationMethod,
        detected_by: user?.email,
        verification_details: fraudData.verification_details
      });
    } catch (err) {
      console.error('Failed to notify SuperAdmin about fraud:', err);
    }
  };

  // Reset form
  const resetForm = () => {
    setCertificateId('');
    setVerificationResult(null);
    setUploadedFile(null);
    setError('');
    setSuccess('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Get verification score color
  const getScoreColor = (score: number) => {
    if (score >= 90) return 'success';
    if (score >= 70) return 'warning';
    return 'danger';
  };

  return (
    <Container fluid className="py-4">
      <Row>
        <Col lg={12}>
          <Card className="shadow-sm">
            <Card.Header className="bg-primary text-white">
              <h4 className="mb-0">
                <i className="fas fa-shield-alt me-2"></i>
                Certificate Verification & Fraud Detection
              </h4>
              <small>Verify certificates, detect fraud, and ensure authenticity</small>
            </Card.Header>
            <Card.Body>
              {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
              {success && <Alert variant="success" dismissible onClose={() => setSuccess('')}>{success}</Alert>}

              {/* Verification Methods */}
              <Row className="mb-4">
                <Col md={4}>
                  <Card className={`h-100 ${activeVerificationMethod === 'id' ? 'border-primary' : ''}`}>
                    <Card.Body className="text-center">
                      <i className="fas fa-id-card fa-3x text-primary mb-3"></i>
                      <h5>Certificate ID Verification</h5>
                      <p className="text-muted">Enter certificate ID to verify authenticity</p>
                      <Form.Group className="mb-3">
                        <Form.Control
                          type="text"
                          placeholder="Enter Certificate ID (e.g., CERT-ABC123456789)"
                          value={certificateId}
                          onChange={(e) => setCertificateId(e.target.value)}
                          onFocus={() => setActiveVerificationMethod('id')}
                        />
                      </Form.Group>
                      <Button 
                        variant="primary" 
                        onClick={handleCertificateVerification}
                        disabled={loading || !certificateId.trim()}
                        className="w-100"
                      >
                        {loading && activeVerificationMethod === 'id' ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2"></span>
                            Verifying...
                          </>
                        ) : (
                          <>
                            <i className="fas fa-search me-2"></i>
                            Verify Certificate
                          </>
                        )}
                      </Button>
                    </Card.Body>
                  </Card>
                </Col>

                <Col md={4}>
                  <Card className={`h-100 ${activeVerificationMethod === 'qr' ? 'border-success' : ''}`}>
                    <Card.Body className="text-center">
                      <i className="fas fa-qrcode fa-3x text-success mb-3"></i>
                      <h5>QR Code Scanning</h5>
                      <p className="text-muted">Scan QR code from certificate for instant verification</p>
                      <Button 
                        variant="success" 
                        onClick={() => setShowQRScanner(true)}
                        disabled={loading}
                        className="w-100"
                      >
                        <i className="fas fa-camera me-2"></i>
                        Scan QR Code
                      </Button>
                    </Card.Body>
                  </Card>
                </Col>

                <Col md={4}>
                  <Card className={`h-100 ${activeVerificationMethod === 'upload' ? 'border-warning' : ''}`}>
                    <Card.Body className="text-center">
                      <i className="fas fa-upload fa-3x text-warning mb-3"></i>
                      <h5>File Upload Verification</h5>
                      <p className="text-muted">Upload PDF/JPG certificate for metadata analysis</p>
                      <Form.Group>
                        <Form.Control
                          type="file"
                          ref={fileInputRef}
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={handleFileUpload}
                          disabled={loading}
                          className="mb-2"
                        />
                      </Form.Group>
                      {uploadedFile && (
                        <Badge bg="info" className="mb-2">
                          {uploadedFile.name}
                        </Badge>
                      )}
                    </Card.Body>
                  </Card>
                </Col>
              </Row>

              {/* Quick Actions */}
              <Row className="mb-3">
                <Col>
                  <div className="d-flex gap-2 justify-content-center">
                    <Button variant="outline-secondary" onClick={resetForm}>
                      <i className="fas fa-refresh me-2"></i>
                      Reset Form
                    </Button>
                  </div>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* QR Scanner Modal */}
      <Modal show={showQRScanner} onHide={() => setShowQRScanner(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Scan Certificate QR Code</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <QRScannerEmbedded onScan={handleQRScan} />
        </Modal.Body>
      </Modal>

      {/* Verification Results Modal */}
      <Modal show={showVerificationModal} onHide={() => setShowVerificationModal(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>
            <i className={`fas ${verificationResult?.success ? 'fa-check-circle text-success' : 'fa-exclamation-triangle text-danger'} me-2`}></i>
            Certificate Verification Results
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {verificationResult && (
            <>
              {/* Verification Status */}
              <Row className="mb-4">
                <Col>
                  <Card className={`border-${verificationResult.success ? 'success' : 'danger'}`}>
                    <Card.Body className="text-center">
                      <h4 className={`text-${verificationResult.success ? 'success' : 'danger'}`}>
                        {verificationResult.success ? 'Certificate Verified' : 'Verification Failed'}
                      </h4>
                      <p className="mb-0">{verificationResult.message}</p>
                      
                      {verificationResult.certificate?.verification_score && (
                        <div className="mt-3">
                          <Badge bg={getScoreColor(verificationResult.certificate.verification_score)} className="fs-6">
                            Verification Score: {verificationResult.certificate.verification_score}%
                          </Badge>
                        </div>
                      )}
                    </Card.Body>
                  </Card>
                </Col>
              </Row>

              {/* Certificate Details */}
              {verificationResult.certificate && (
                <Row className="mb-4">
                  <Col md={6}>
                    <Card>
                      <Card.Header>
                        <h6 className="mb-0">Certificate Information</h6>
                      </Card.Header>
                      <Card.Body>
                        <Table borderless size="sm">
                          <tbody>
                            <tr>
                              <td><strong>Certificate ID:</strong></td>
                              <td><code>{verificationResult.certificate.certificate_id}</code></td>
                            </tr>
                            <tr>
                              <td><strong>Recipient:</strong></td>
                              <td>{verificationResult.certificate.recipient_name}</td>
                            </tr>
                            <tr>
                              <td><strong>Event:</strong></td>
                              <td>{verificationResult.certificate.event_name}</td>
                            </tr>
                            <tr>
                              <td><strong>Issued Date:</strong></td>
                              <td>{new Date(verificationResult.certificate.issued_date).toLocaleDateString()}</td>
                            </tr>
                            <tr>
                              <td><strong>Status:</strong></td>
                              <td>
                                <Badge bg={verificationResult.certificate.status === 'active' ? 'success' : 'danger'}>
                                  {verificationResult.certificate.status}
                                </Badge>
                              </td>
                            </tr>
                          </tbody>
                        </Table>
                      </Card.Body>
                    </Card>
                  </Col>
                  
                  <Col md={6}>
                    <Card>
                      <Card.Header>
                        <h6 className="mb-0">Verification Details</h6>
                      </Card.Header>
                      <Card.Body>
                        {verificationResult.verification_details && (
                          <Table borderless size="sm">
                            <tbody>
                              <tr>
                                <td><strong>Metadata Integrity:</strong></td>
                                <td>
                                  <Badge bg={verificationResult.verification_details.metadata_integrity ? 'success' : 'danger'}>
                                    {verificationResult.verification_details.metadata_integrity ? 'Valid' : 'Invalid'}
                                  </Badge>
                                </td>
                              </tr>
                              <tr>
                                <td><strong>Hash Verification:</strong></td>
                                <td>
                                  <Badge bg={verificationResult.verification_details.hash_verification ? 'success' : 'danger'}>
                                    {verificationResult.verification_details.hash_verification ? 'Valid' : 'Invalid'}
                                  </Badge>
                                </td>
                              </tr>
                              <tr>
                                <td><strong>Database Match:</strong></td>
                                <td>
                                  <Badge bg={verificationResult.verification_details.database_match ? 'success' : 'danger'}>
                                    {verificationResult.verification_details.database_match ? 'Match' : 'No Match'}
                                  </Badge>
                                </td>
                              </tr>
                              <tr>
                                <td><strong>Blockchain:</strong></td>
                                <td>
                                  <Badge bg={verificationResult.verification_details.blockchain_verification ? 'success' : 'warning'}>
                                    {verificationResult.verification_details.blockchain_verification ? 'Verified' : 'Pending'}
                                  </Badge>
                                </td>
                              </tr>
                            </tbody>
                          </Table>
                        )}
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
              )}

              {/* Fraud Detection */}
              {verificationResult.fraud_detected && (
                <Row className="mb-4">
                  <Col>
                    <Alert variant="danger">
                      <h6><i className="fas fa-exclamation-triangle me-2"></i>Fraud Detected!</h6>
                      <p>This certificate has been flagged as potentially fraudulent. SuperAdmin has been notified.</p>
                      {verificationResult.fraud_indicators && (
                        <ul className="mb-0">
                          {verificationResult.fraud_indicators.map((indicator, index) => (
                            <li key={index}>{indicator}</li>
                          ))}
                        </ul>
                      )}
                    </Alert>
                  </Col>
                </Row>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          {verificationResult?.success && verificationResult.certificate && (
            <Button 
              variant="primary" 
              onClick={() => handleDownloadCertificate(verificationResult.certificate!.certificate_id)}
            >
              <i className="fas fa-download me-2"></i>
              Download Certificate
            </Button>
          )}
          <Button variant="secondary" onClick={() => setShowVerificationModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default UserDashboard;
