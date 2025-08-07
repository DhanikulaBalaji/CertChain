import React from 'react';
import { Card, Badge, Button, Row, Col, Alert } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faCheckCircle, 
  faExclamationTriangle, 
  faTimesCircle, 
  faDownload, 
  faEye,
  faCalendarAlt,
  faUser,
  faIdCard,
  faShieldAlt,
  faLink
} from '@fortawesome/free-solid-svg-icons';

export interface CertificateData {
  id: string;
  certificate_id: string;
  recipient_name: string;
  event_name: string;
  issue_date: string;
  status: 'ACTIVE' | 'REVOKED' | 'SUSPENDED';
  validation_status: 'VALID' | 'TAMPERED' | 'SUSPICIOUS' | 'NOT_FOUND';
  blockchain_tx_hash?: string;
  qr_code_data?: string;
  pdf_path?: string;
  issuer_name?: string;
  verification_details?: {
    blockchain_verified: boolean;
    hash_verified: boolean;
    tamper_detected: boolean;
    last_verified: string;
  };
}

interface CertificatePreviewProps {
  certificate: CertificateData | null;
  isLoading?: boolean;
  onDownload?: () => void;
  onViewFull?: () => void;
}

const CertificatePreview: React.FC<CertificatePreviewProps> = ({
  certificate,
  isLoading,
  onDownload,
  onViewFull
}) => {
  if (isLoading) {
    return (
      <Card className="text-center p-4">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-3 mb-0 text-muted">Verifying certificate...</p>
      </Card>
    );
  }

  if (!certificate) {
    return (
      <Card className="text-center p-4">
        <FontAwesomeIcon icon={faIdCard} size="3x" className="text-muted mb-3" />
        <h5 className="text-muted">No Certificate Selected</h5>
        <p className="text-muted mb-0">
          Scan a QR code or enter a certificate ID to view details
        </p>
      </Card>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'VALID': return 'success';
      case 'ACTIVE': return 'success';
      case 'TAMPERED': return 'danger';
      case 'REVOKED': return 'danger';
      case 'SUSPICIOUS': return 'warning';
      case 'SUSPENDED': return 'warning';
      case 'NOT_FOUND': return 'secondary';
      default: return 'secondary';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'VALID': return faCheckCircle;
      case 'ACTIVE': return faCheckCircle;
      case 'TAMPERED': return faTimesCircle;
      case 'REVOKED': return faTimesCircle;
      case 'SUSPICIOUS': return faExclamationTriangle;
      case 'SUSPENDED': return faExclamationTriangle;
      default: return faTimesCircle;
    }
  };

  const getStatusMessage = (validationStatus: string, certificateStatus: string) => {
    if (validationStatus === 'NOT_FOUND') {
      return 'Certificate not found in our records';
    }
    if (validationStatus === 'TAMPERED') {
      return 'Certificate has been tampered with or modified';
    }
    if (validationStatus === 'SUSPICIOUS') {
      return 'Certificate validation raised security concerns';
    }
    if (certificateStatus === 'REVOKED') {
      return 'Certificate has been revoked by the issuer';
    }
    if (certificateStatus === 'SUSPENDED') {
      return 'Certificate is temporarily suspended';
    }
    if (validationStatus === 'VALID' && certificateStatus === 'ACTIVE') {
      return 'Certificate is valid and authentic';
    }
    return 'Certificate status unknown';
  };

  return (
    <Card className="h-100">
      <Card.Header className="d-flex justify-content-between align-items-center">
        <div>
          <FontAwesomeIcon icon={faIdCard} className="me-2" />
          <strong>Certificate Details</strong>
        </div>
        <Badge 
          bg={getStatusVariant(certificate.validation_status)} 
          className="d-flex align-items-center"
        >
          <FontAwesomeIcon 
            icon={getStatusIcon(certificate.validation_status)} 
            className="me-1" 
          />
          {certificate.validation_status}
        </Badge>
      </Card.Header>

      <Card.Body>
        {/* Validation Status Alert */}
        <Alert 
          variant={getStatusVariant(certificate.validation_status)}
          className="d-flex align-items-center"
        >
          <FontAwesomeIcon 
            icon={getStatusIcon(certificate.validation_status)} 
            className="me-2" 
          />
          {getStatusMessage(certificate.validation_status, certificate.status)}
        </Alert>

        {/* Certificate Information */}
        <Row className="g-3">
          <Col md={6}>
            <div className="mb-3">
              <label className="form-label text-muted small">
                <FontAwesomeIcon icon={faUser} className="me-1" />
                Recipient Name
              </label>
              <div className="fw-bold">{certificate.recipient_name}</div>
            </div>
          </Col>
          
          <Col md={6}>
            <div className="mb-3">
              <label className="form-label text-muted small">
                <FontAwesomeIcon icon={faIdCard} className="me-1" />
                Certificate ID
              </label>
              <div className="fw-bold font-monospace">{certificate.certificate_id}</div>
            </div>
          </Col>
          
          <Col md={6}>
            <div className="mb-3">
              <label className="form-label text-muted small">
                Event/Course
              </label>
              <div className="fw-bold">{certificate.event_name}</div>
            </div>
          </Col>
          
          <Col md={6}>
            <div className="mb-3">
              <label className="form-label text-muted small">
                <FontAwesomeIcon icon={faCalendarAlt} className="me-1" />
                Issue Date
              </label>
              <div className="fw-bold">
                {new Date(certificate.issue_date).toLocaleDateString()}
              </div>
            </div>
          </Col>

          {certificate.issuer_name && (
            <Col md={6}>
              <div className="mb-3">
                <label className="form-label text-muted small">
                  Issued By
                </label>
                <div className="fw-bold">{certificate.issuer_name}</div>
              </div>
            </Col>
          )}

          <Col md={6}>
            <div className="mb-3">
              <label className="form-label text-muted small">
                Certificate Status
              </label>
              <div>
                <Badge bg={getStatusVariant(certificate.status)}>
                  {certificate.status}
                </Badge>
              </div>
            </div>
          </Col>
        </Row>

        {/* Verification Details */}
        {certificate.verification_details && (
          <div className="mt-4">
            <h6 className="mb-3">
              <FontAwesomeIcon icon={faShieldAlt} className="me-2" />
              Verification Details
            </h6>
            
            <Row className="g-2">
              <Col md={6}>
                <div className="d-flex align-items-center">
                  <FontAwesomeIcon 
                    icon={certificate.verification_details.blockchain_verified ? faCheckCircle : faTimesCircle}
                    className={`me-2 ${certificate.verification_details.blockchain_verified ? 'text-success' : 'text-danger'}`}
                  />
                  <small>Blockchain Verified</small>
                </div>
              </Col>
              
              <Col md={6}>
                <div className="d-flex align-items-center">
                  <FontAwesomeIcon 
                    icon={certificate.verification_details.hash_verified ? faCheckCircle : faTimesCircle}
                    className={`me-2 ${certificate.verification_details.hash_verified ? 'text-success' : 'text-danger'}`}
                  />
                  <small>Hash Integrity</small>
                </div>
              </Col>
              
              <Col md={6}>
                <div className="d-flex align-items-center">
                  <FontAwesomeIcon 
                    icon={!certificate.verification_details.tamper_detected ? faCheckCircle : faTimesCircle}
                    className={`me-2 ${!certificate.verification_details.tamper_detected ? 'text-success' : 'text-danger'}`}
                  />
                  <small>No Tampering Detected</small>
                </div>
              </Col>
              
              <Col md={6}>
                <small className="text-muted">
                  Last verified: {new Date(certificate.verification_details.last_verified).toLocaleString()}
                </small>
              </Col>
            </Row>
          </div>
        )}

        {/* Blockchain Transaction */}
        {certificate.blockchain_tx_hash && (
          <div className="mt-4">
            <h6 className="mb-2">
              <FontAwesomeIcon icon={faLink} className="me-2" />
              Blockchain Transaction
            </h6>
            <div className="font-monospace small text-break bg-light p-2 rounded">
              {certificate.blockchain_tx_hash}
            </div>
          </div>
        )}
      </Card.Body>

      {/* Action Buttons */}
      <Card.Footer className="d-flex gap-2">
        {onViewFull && (
          <Button variant="primary" size="sm" onClick={onViewFull}>
            <FontAwesomeIcon icon={faEye} className="me-1" />
            View Full Certificate
          </Button>
        )}
        
        {onDownload && certificate.pdf_path && (
          <Button variant="outline-primary" size="sm" onClick={onDownload}>
            <FontAwesomeIcon icon={faDownload} className="me-1" />
            Download PDF
          </Button>
        )}
        
        {certificate.blockchain_tx_hash && (
          <Button 
            variant="outline-secondary" 
            size="sm"
            onClick={() => window.open(`https://etherscan.io/tx/${certificate.blockchain_tx_hash}`, '_blank')}
          >
            <FontAwesomeIcon icon={faLink} className="me-1" />
            View on Blockchain
          </Button>
        )}
      </Card.Footer>
    </Card>
  );
};

export default CertificatePreview;
