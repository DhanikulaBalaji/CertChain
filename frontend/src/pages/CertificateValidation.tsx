import React, { useState, useRef, useCallback } from 'react';
import { Container, Row, Col, Card, Button, Form, Alert, Badge, Spinner, Table, Modal } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import api from '../services/api';
import jsQR from 'jsqr';

interface ValidationResult {
  certificate_id: string;
  status: 'valid' | 'invalid' | 'revoked' | 'tampered' | 'not_found' | 'suspicious';
  message: string;
  details: {
    recipient_name?: string;
    event_name?: string;
    issue_date?: string;
    blockchain_verified?: boolean;
    pdf_integrity?: boolean;
    ocr_verified?: boolean;
    hash_match?: boolean;
    revocation_reason?: string;
    tamper_details?: string;
  };
  validation_timestamp: string;
}

const CertificateValidation: React.FC = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [validationMethod, setValidationMethod] = useState<'manual' | 'qr' | 'upload'>('manual');
  const [certificateId, setCertificateId] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrScanActive, setQRScanActive] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateCertificate = async (certId: string) => {
    if (!certId.trim()) {
      setError('Please enter a certificate ID');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await api.post('/certificates/validate', {
        certificate_id: certId.trim()
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      setValidationResult(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Validation failed');
      console.error('Validation error:', err);
    } finally {
      setLoading(false);
    }
  };

  const validateUploadedFile = async (file: File) => {
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/certificates/validate-file', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(token && { Authorization: `Bearer ${token}` })
        }
      });

      setValidationResult(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'File validation failed');
      console.error('File validation error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualValidation = (e: React.FormEvent) => {
    e.preventDefault();
    validateCertificate(certificateId);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Please select a PDF file');
      return;
    }

    setUploadedFile(file);
    validateUploadedFile(file);
  };

  const startQRScan = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setQRScanActive(true);
        setError(null);
      }
    } catch (err) {
      setError('Camera access denied or not available');
      console.error('Camera error:', err);
    }
  }, []);

  const stopQRScan = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const tracks = stream.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setQRScanActive(false);
  }, []);

  const scanQRCode = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    
    // Use jsQR to scan for QR codes
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    
    if (code) {
      try {
        // Try to parse QR code data as JSON or extract certificate ID
        let certificateId = '';
        
        if (code.data.startsWith('CERT-') || code.data.match(/^[A-Z0-9-]+$/)) {
          // Direct certificate ID
          certificateId = code.data;
        } else {
          // Try to parse as JSON
          const qrData = JSON.parse(code.data);
          certificateId = qrData.certificate_id || qrData.id || '';
        }
        
        if (certificateId) {
          stopQRScan();
          setCertificateId(certificateId);
          validateCertificate(certificateId);
          setError(null);
        } else {
          setError('QR code does not contain a valid certificate ID');
        }
      } catch (e) {
        setError('Invalid QR code format');
      }
    }
  }, [stopQRScan, validateCertificate]);

  // Start scanning when QR mode is activated
  React.useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    if (qrScanActive) {
      intervalId = setInterval(scanQRCode, 500);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [qrScanActive, scanQRCode]);

  const getStatusVariant = (status: ValidationResult['status']) => {
    switch (status) {
      case 'valid': return 'success';
      case 'invalid': return 'danger';
      case 'revoked': return 'warning';
      case 'tampered': return 'danger';
      case 'suspicious': return 'warning';
      case 'not_found': return 'secondary';
      default: return 'secondary';
    }
  };

  const getStatusIcon = (status: ValidationResult['status']) => {
    switch (status) {
      case 'valid': return 'fas fa-check-circle';
      case 'invalid': return 'fas fa-times-circle';
      case 'revoked': return 'fas fa-ban';
      case 'tampered': return 'fas fa-exclamation-triangle';
      case 'suspicious': return 'fas fa-question-circle';
      case 'not_found': return 'fas fa-search';
      default: return 'fas fa-info-circle';
    }
  };

  return (
    <Container className="mt-4">
      <Row>
        <Col>
          <h2>
            <i className="fas fa-shield-alt me-2"></i>
            Certificate Validation
          </h2>
          <p className="text-muted">Verify the authenticity and integrity of certificates</p>
        </Col>
      </Row>

      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      {/* Validation Method Selection */}
      <Row className="mb-4">
        <Col>
          <Card>
            <Card.Header>
              <h5>Choose Validation Method</h5>
            </Card.Header>
            <Card.Body>
              <div className="d-flex gap-2 flex-wrap">
                <Button
                  variant={validationMethod === 'manual' ? 'primary' : 'outline-primary'}
                  onClick={() => {
                    setValidationMethod('manual');
                    if (qrScanActive) stopQRScan();
                  }}
                >
                  <i className="fas fa-keyboard me-2"></i>Manual Entry
                </Button>
                <Button
                  variant={validationMethod === 'qr' ? 'primary' : 'outline-primary'}
                  onClick={() => {
                    setValidationMethod('qr');
                    if (!qrScanActive) startQRScan();
                  }}
                >
                  <i className="fas fa-qrcode me-2"></i>QR Code Scan
                </Button>
                <Button
                  variant={validationMethod === 'upload' ? 'primary' : 'outline-primary'}
                  onClick={() => {
                    setValidationMethod('upload');
                    if (qrScanActive) stopQRScan();
                  }}
                >
                  <i className="fas fa-file-upload me-2"></i>Upload PDF
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md={6}>
          {/* Manual Entry */}
          {validationMethod === 'manual' && (
            <Card>
              <Card.Header>
                <h5><i className="fas fa-keyboard me-2"></i>Manual Certificate ID Entry</h5>
              </Card.Header>
              <Card.Body>
                <Form onSubmit={handleManualValidation}>
                  <Form.Group className="mb-3">
                    <Form.Label>Certificate ID</Form.Label>
                    <Form.Control
                      type="text"
                      value={certificateId}
                      onChange={(e) => setCertificateId(e.target.value)}
                      placeholder="Enter certificate ID (e.g., CERT-2024-001234)"
                      required
                    />
                    <Form.Text className="text-muted">
                      Enter the unique certificate ID found on your certificate
                    </Form.Text>
                  </Form.Group>
                  
                  <Button type="submit" variant="primary" disabled={loading || !certificateId.trim()}>
                    {loading ? (
                      <>
                        <Spinner size="sm" animation="border" className="me-2" />
                        Validating...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-search me-2"></i>Validate Certificate
                      </>
                    )}
                  </Button>
                </Form>
              </Card.Body>
            </Card>
          )}

          {/* QR Code Scanning */}
          {validationMethod === 'qr' && (
            <Card>
              <Card.Header>
                <h5><i className="fas fa-qrcode me-2"></i>QR Code Scanner</h5>
              </Card.Header>
              <Card.Body>
                <div className="text-center mb-3">
                  <div className="position-relative d-inline-block">
                    <video
                      ref={videoRef}
                      style={{
                        width: '100%',
                        maxWidth: '400px',
                        height: 'auto',
                        border: '2px solid #dee2e6',
                        borderRadius: '8px'
                      }}
                      playsInline
                      muted
                    />
                    {!qrScanActive && (
                      <div className="position-absolute top-50 start-50 translate-middle">
                        <i className="fas fa-camera fa-3x text-muted"></i>
                      </div>
                    )}
                  </div>
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                </div>
                
                <div className="d-flex gap-2 justify-content-center">
                  {!qrScanActive ? (
                    <Button variant="primary" onClick={startQRScan}>
                      <i className="fas fa-camera me-2"></i>Start Camera
                    </Button>
                  ) : (
                    <Button variant="danger" onClick={stopQRScan}>
                      <i className="fas fa-stop me-2"></i>Stop Camera
                    </Button>
                  )}
                </div>
                
                <Alert variant="info" className="mt-3">
                  <i className="fas fa-info-circle me-2"></i>
                  Point your camera at the QR code on the certificate to scan and validate automatically.
                </Alert>
              </Card.Body>
            </Card>
          )}

          {/* File Upload */}
          {validationMethod === 'upload' && (
            <Card>
              <Card.Header>
                <h5><i className="fas fa-file-upload me-2"></i>Upload PDF Certificate</h5>
              </Card.Header>
              <Card.Body>
                <Form.Group className="mb-3">
                  <Form.Label>Select PDF Certificate</Form.Label>
                  <Form.Control
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handleFileUpload}
                  />
                  <Form.Text className="text-muted">
                    Upload the PDF certificate file for validation
                  </Form.Text>
                </Form.Group>
                
                {uploadedFile && (
                  <Alert variant="info">
                    <i className="fas fa-file-pdf me-2"></i>
                    Selected: {uploadedFile.name}
                  </Alert>
                )}
                
                {loading && (
                  <div className="text-center">
                    <Spinner animation="border" />
                    <p className="mt-2">Processing PDF file...</p>
                  </div>
                )}
              </Card.Body>
            </Card>
          )}
        </Col>

        {/* Validation Result */}
        <Col md={6}>
          {validationResult && (
            <Card>
              <Card.Header className="d-flex justify-content-between align-items-center">
                <h5><i className="fas fa-clipboard-check me-2"></i>Validation Result</h5>
                <Badge bg={getStatusVariant(validationResult.status)} className="fs-6">
                  <i className={`${getStatusIcon(validationResult.status)} me-1`}></i>
                  {validationResult.status.toUpperCase()}
                </Badge>
              </Card.Header>
              <Card.Body>
                <div className="mb-3">
                  <h6>Certificate ID: {validationResult.certificate_id}</h6>
                  <p className="mb-2">{validationResult.message}</p>
                  <small className="text-muted">
                    Validated on: {new Date(validationResult.validation_timestamp).toLocaleString()}
                  </small>
                </div>

                {validationResult.details && Object.keys(validationResult.details).length > 0 && (
                  <>
                    <div className="d-flex gap-2 mb-3">
                      <Button 
                        variant="outline-primary" 
                        size="sm"
                        onClick={() => setShowDetailsModal(true)}
                      >
                        <i className="fas fa-info-circle me-2"></i>View Details
                      </Button>
                      {validationResult.status === 'valid' && (
                        <Button 
                          variant="primary" 
                          size="sm"
                          onClick={() => navigate(`/certificate/${validationResult.certificate_id}`)}
                        >
                          <i className="fas fa-certificate me-2"></i>Full Certificate Details
                        </Button>
                      )}
                    </div>
                    
                    <div className="mt-3">
                      <h6>Quick Summary:</h6>
                      <Table size="sm" responsive>
                        <tbody>
                          {validationResult.details.recipient_name && (
                            <tr>
                              <td><strong>Recipient:</strong></td>
                              <td>{validationResult.details.recipient_name}</td>
                            </tr>
                          )}
                          {validationResult.details.event_name && (
                            <tr>
                              <td><strong>Event:</strong></td>
                              <td>{validationResult.details.event_name}</td>
                            </tr>
                          )}
                          {validationResult.details.issue_date && (
                            <tr>
                              <td><strong>Issue Date:</strong></td>
                              <td>{new Date(validationResult.details.issue_date).toLocaleDateString()}</td>
                            </tr>
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </>
                )}

                {/* Action buttons based on status */}
                <div className="mt-3">
                  {validationResult.status === 'valid' && (
                    <Alert variant="success">
                      <i className="fas fa-check-circle me-2"></i>
                      This certificate is authentic and has not been tampered with.
                    </Alert>
                  )}
                  
                  {validationResult.status === 'tampered' && (
                    <Alert variant="danger">
                      <i className="fas fa-exclamation-triangle me-2"></i>
                      Warning: This certificate appears to have been modified or tampered with.
                    </Alert>
                  )}
                  
                  {validationResult.status === 'revoked' && (
                    <Alert variant="warning">
                      <i className="fas fa-ban me-2"></i>
                      This certificate has been revoked and is no longer valid.
                      {validationResult.details.revocation_reason && (
                        <div className="mt-2">
                          <strong>Reason:</strong> {validationResult.details.revocation_reason}
                        </div>
                      )}
                    </Alert>
                  )}
                  
                  {validationResult.status === 'not_found' && (
                    <Alert variant="secondary">
                      <i className="fas fa-search me-2"></i>
                      Certificate not found in our database. Please check the certificate ID.
                    </Alert>
                  )}
                </div>
              </Card.Body>
            </Card>
          )}
        </Col>
      </Row>

      {/* Validation Details Modal */}
      <Modal show={showDetailsModal} onHide={() => setShowDetailsModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Detailed Validation Report</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {validationResult?.details && (
            <Table striped bordered hover>
              <thead>
                <tr>
                  <th>Validation Check</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Blockchain Verification</td>
                  <td>
                    <Badge bg={validationResult.details.blockchain_verified ? 'success' : 'danger'}>
                      {validationResult.details.blockchain_verified ? 'PASSED' : 'FAILED'}
                    </Badge>
                  </td>
                  <td>Certificate hash verified on blockchain</td>
                </tr>
                <tr>
                  <td>PDF Integrity</td>
                  <td>
                    <Badge bg={validationResult.details.pdf_integrity ? 'success' : 'danger'}>
                      {validationResult.details.pdf_integrity ? 'PASSED' : 'FAILED'}
                    </Badge>
                  </td>
                  <td>PDF structure and content integrity</td>
                </tr>
                <tr>
                  <td>OCR Verification</td>
                  <td>
                    <Badge bg={validationResult.details.ocr_verified ? 'success' : 'danger'}>
                      {validationResult.details.ocr_verified ? 'PASSED' : 'FAILED'}
                    </Badge>
                  </td>
                  <td>Text content matches original data</td>
                </tr>
                <tr>
                  <td>Hash Match</td>
                  <td>
                    <Badge bg={validationResult.details.hash_match ? 'success' : 'danger'}>
                      {validationResult.details.hash_match ? 'PASSED' : 'FAILED'}
                    </Badge>
                  </td>
                  <td>SHA-256 hash verification</td>
                </tr>
              </tbody>
            </Table>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDetailsModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default CertificateValidation;
