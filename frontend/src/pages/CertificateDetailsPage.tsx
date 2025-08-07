import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Alert, Spinner, Badge, Modal } from 'react-bootstrap';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faCertificate, 
  faDownload, 
  faQrcode, 
  faShieldAlt, 
  faCalendarAlt, 
  faUser, 
  faHashtag,
  faCheckCircle,
  faTimesCircle,
  faExclamationTriangle,
  faArrowLeft,
  faLink,
  faEye,
  faFileAlt
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../services/AuthContext';
import api from '../services/api';

interface CertificateDetails {
  id: number;
  certificate_id: string;
  recipient_name: string;
  event_name: string;
  event_date: string;
  issued_date: string;
  status: string;
  sha256_hash: string;
  blockchain_tx_hash?: string;
  qr_code_data?: string;
  is_verified: boolean;
  pdf_path?: string;
  validation_details?: {
    blockchain_verified: boolean;
    pdf_integrity: boolean;
    ocr_verified: boolean;
    hash_match: boolean;
  };
}

const CertificateDetailsPage: React.FC = () => {
  const { certificateId } = useParams<{ certificateId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [certificate, setCertificate] = useState<CertificateDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null);

  useEffect(() => {
    if (certificateId) {
      fetchCertificateDetails();
    }
  }, [certificateId]);

  const fetchCertificateDetails = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/certificates/${certificateId}`);
      setCertificate(response.data);
      
      // Auto-validate the certificate
      await validateCertificate();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch certificate details');
    } finally {
      setLoading(false);
    }
  };

  const validateCertificate = async () => {
    if (!certificateId) return;
    
    try {
      setValidating(true);
      const response = await api.post('/certificates/validate', {
        certificate_id: certificateId
      });
      
      if (certificate) {
        setCertificate(prev => prev ? {
          ...prev,
          validation_details: response.data.details
        } : null);
      }
    } catch (err: any) {
      console.error('Validation failed:', err);
    } finally {
      setValidating(false);
    }
  };

  const downloadCertificate = async () => {
    if (!certificateId) return;
    
    try {
      const response = await api.get(`/certificates/${certificateId}/download`, {
        responseType: 'blob'
      });
      
      // Create download link
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
    }
  };

  const generateQRCode = () => {
    if (certificate?.qr_code_data) {
      // For demo purposes, we'll create a simple QR code display
      // In production, you'd generate an actual QR code image
      setQrCodeImage(certificate.qr_code_data);
      setShowQRModal(true);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return <Badge bg="success"><FontAwesomeIcon icon={faCheckCircle} className="me-1" />Active</Badge>;
      case 'revoked':
        return <Badge bg="danger"><FontAwesomeIcon icon={faTimesCircle} className="me-1" />Revoked</Badge>;
      case 'suspended':
        return <Badge bg="warning"><FontAwesomeIcon icon={faExclamationTriangle} className="me-1" />Suspended</Badge>;
      default:
        return <Badge bg="secondary">Unknown</Badge>;
    }
  };

  const getVerificationBadge = (verified: boolean) => {
    return verified ? 
      <Badge bg="success"><FontAwesomeIcon icon={faCheckCircle} className="me-1" />Verified</Badge> :
      <Badge bg="danger"><FontAwesomeIcon icon={faTimesCircle} className="me-1" />Unverified</Badge>;
  };

  if (loading) {
    return (
      <Container className="mt-4 text-center">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3">Loading certificate details...</p>
      </Container>
    );
  }

  if (error || !certificate) {
    return (
      <Container className="mt-4">
        <Alert variant="danger">
          <FontAwesomeIcon icon={faTimesCircle} className="me-2" />
          {error || 'Certificate not found'}
        </Alert>
        <Button variant="primary" onClick={() => navigate(-1)}>
          <FontAwesomeIcon icon={faArrowLeft} className="me-2" />
          Go Back
        </Button>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      {/* Header */}
      <Row className="mb-4">
        <Col>
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h2>
                <FontAwesomeIcon icon={faCertificate} className="me-3 text-primary" />
                Certificate Details
              </h2>
              <p className="text-muted">Certificate ID: {certificate.certificate_id}</p>
            </div>
            <div>
              <Button variant="outline-secondary" onClick={() => navigate(-1)} className="me-2">
                <FontAwesomeIcon icon={faArrowLeft} className="me-2" />
                Back
              </Button>
              <Button variant="primary" onClick={downloadCertificate}>
                <FontAwesomeIcon icon={faDownload} className="me-2" />
                Download PDF
              </Button>
            </div>
          </div>
        </Col>
      </Row>

      <Row>
        {/* Main Certificate Information */}
        <Col lg={8}>
          <Card className="mb-4">
            <Card.Header>
              <h5 className="mb-0">
                <FontAwesomeIcon icon={faFileAlt} className="me-2" />
                Certificate Information
              </h5>
            </Card.Header>
            <Card.Body>
              <Row>
                <Col md={6}>
                  <div className="mb-3">
                    <label className="form-label text-muted">Recipient</label>
                    <div className="d-flex align-items-center">
                      <FontAwesomeIcon icon={faUser} className="me-2 text-primary" />
                      <strong>{certificate.recipient_name}</strong>
                    </div>
                  </div>
                  
                  <div className="mb-3">
                    <label className="form-label text-muted">Event</label>
                    <div className="d-flex align-items-center">
                      <FontAwesomeIcon icon={faCalendarAlt} className="me-2 text-primary" />
                      <strong>{certificate.event_name}</strong>
                    </div>
                  </div>
                  
                  <div className="mb-3">
                    <label className="form-label text-muted">Event Date</label>
                    <div>{certificate.event_date}</div>
                  </div>
                </Col>
                
                <Col md={6}>
                  <div className="mb-3">
                    <label className="form-label text-muted">Status</label>
                    <div>{getStatusBadge(certificate.status)}</div>
                  </div>
                  
                  <div className="mb-3">
                    <label className="form-label text-muted">Issued Date</label>
                    <div>{certificate.issued_date}</div>
                  </div>
                  
                  <div className="mb-3">
                    <label className="form-label text-muted">Verification Status</label>
                    <div>{getVerificationBadge(certificate.is_verified)}</div>
                  </div>
                </Col>
              </Row>
            </Card.Body>
          </Card>

          {/* Security Information */}
          <Card className="mb-4">
            <Card.Header>
              <h5 className="mb-0">
                <FontAwesomeIcon icon={faShieldAlt} className="me-2" />
                Security & Verification
                {validating && <Spinner animation="border" size="sm" className="ms-2" />}
              </h5>
            </Card.Header>
            <Card.Body>
              <div className="mb-3">
                <label className="form-label text-muted">SHA-256 Hash</label>
                <div className="font-monospace small text-break">
                  <FontAwesomeIcon icon={faHashtag} className="me-2 text-primary" />
                  {certificate.sha256_hash}
                </div>
              </div>
              
              {certificate.blockchain_tx_hash && (
                <div className="mb-3">
                  <label className="form-label text-muted">Blockchain Transaction</label>
                  <div className="font-monospace small text-break">
                    <FontAwesomeIcon icon={faLink} className="me-2 text-primary" />
                    {certificate.blockchain_tx_hash}
                  </div>
                </div>
              )}

              {/* Validation Results */}
              {certificate.validation_details && (
                <div className="mt-4">
                  <h6>Validation Results</h6>
                  <Row>
                    <Col sm={6}>
                      <div className="mb-2">
                        {certificate.validation_details.hash_match ? 
                          <Badge bg="success"><FontAwesomeIcon icon={faCheckCircle} /> Hash Integrity</Badge> :
                          <Badge bg="danger"><FontAwesomeIcon icon={faTimesCircle} /> Hash Mismatch</Badge>
                        }
                      </div>
                      <div className="mb-2">
                        {certificate.validation_details.pdf_integrity ? 
                          <Badge bg="success"><FontAwesomeIcon icon={faCheckCircle} /> PDF Integrity</Badge> :
                          <Badge bg="danger"><FontAwesomeIcon icon={faTimesCircle} /> PDF Tampered</Badge>
                        }
                      </div>
                    </Col>
                    <Col sm={6}>
                      <div className="mb-2">
                        {certificate.validation_details.blockchain_verified ? 
                          <Badge bg="success"><FontAwesomeIcon icon={faCheckCircle} /> Blockchain Verified</Badge> :
                          <Badge bg="warning"><FontAwesomeIcon icon={faExclamationTriangle} /> Not on Blockchain</Badge>
                        }
                      </div>
                      <div className="mb-2">
                        {certificate.validation_details.ocr_verified ? 
                          <Badge bg="success"><FontAwesomeIcon icon={faCheckCircle} /> OCR Verified</Badge> :
                          <Badge bg="warning"><FontAwesomeIcon icon={faExclamationTriangle} /> OCR Unverified</Badge>
                        }
                      </div>
                    </Col>
                  </Row>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>

        {/* QR Code and Actions */}
        <Col lg={4}>
          <Card>
            <Card.Header>
              <h5 className="mb-0">
                <FontAwesomeIcon icon={faQrcode} className="me-2" />
                Quick Actions
              </h5>
            </Card.Header>
            <Card.Body className="text-center">
              <div className="mb-4">
                <Button 
                  variant="outline-primary" 
                  size="lg" 
                  onClick={generateQRCode}
                  disabled={!certificate.qr_code_data}
                >
                  <FontAwesomeIcon icon={faQrcode} className="me-2" />
                  View QR Code
                </Button>
              </div>
              
              <div className="mb-3">
                <Button 
                  variant="success" 
                  onClick={downloadCertificate}
                  className="w-100"
                >
                  <FontAwesomeIcon icon={faDownload} className="me-2" />
                  Download Certificate
                </Button>
              </div>
              
              <div className="mb-3">
                <Button 
                  variant="outline-info" 
                  onClick={validateCertificate}
                  disabled={validating}
                  className="w-100"
                >
                  <FontAwesomeIcon icon={faShieldAlt} className="me-2" />
                  {validating ? 'Validating...' : 'Re-validate'}
                </Button>
              </div>

              {/* Share Options */}
              <div className="mt-4 pt-3 border-top">
                <small className="text-muted">Share this certificate</small>
                <div className="mt-2">
                  <Button variant="outline-secondary" size="sm" className="me-2">
                    <FontAwesomeIcon icon={faLink} />
                  </Button>
                  <Button variant="outline-secondary" size="sm">
                    <FontAwesomeIcon icon={faEye} />
                  </Button>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* QR Code Modal */}
      <Modal show={showQRModal} onHide={() => setShowQRModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            <FontAwesomeIcon icon={faQrcode} className="me-2" />
            Certificate QR Code
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center">
          {qrCodeImage ? (
            <div>
              <div className="mb-3">
                <div 
                  style={{
                    width: '200px',
                    height: '200px',
                    border: '2px solid #dee2e6',
                    margin: '0 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#f8f9fa'
                  }}
                >
                  <FontAwesomeIcon icon={faQrcode} size="4x" className="text-muted" />
                </div>
              </div>
              <p className="text-muted small">
                Scan this QR code to verify the certificate
              </p>
              <div className="font-monospace small text-break bg-light p-2 rounded">
                {qrCodeImage.substring(0, 100)}...
              </div>
            </div>
          ) : (
            <p>QR code not available</p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowQRModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default CertificateDetailsPage;
