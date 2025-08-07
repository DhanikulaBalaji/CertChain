import React from 'react';
import { Card, Badge, Alert, Button } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCheckCircle,
  faTimesCircle,
  faExclamationTriangle,
  faQuestionCircle,
  faDownload,
  faEye,
  faShieldAlt,
  faCalendarAlt,
  faBuilding,
  faUser
} from '@fortawesome/free-solid-svg-icons';

interface ValidationResultProps {
  certificateId: string;
  result: {
    status: 'valid' | 'invalid' | 'tampered' | 'not_found' | 'suspicious';
    message: string;
    certificate?: {
      id: string;
      recipient_name: string;
      event_title: string;
      organization: string;
      issue_date: string;
      verification_hash: string;
      blockchain_tx?: string;
      template_used?: string;
    };
    validation_details?: {
      hash_valid: boolean;
      blockchain_verified: boolean;
      ocr_analysis: boolean;
      structure_intact: boolean;
      tamper_score?: number;
    };
    security_warnings?: string[];
    timestamp: string;
  };
  onViewCertificate?: (certificateId: string) => void;
  onDownloadReport?: (certificateId: string) => void;
}

const ValidationResult: React.FC<ValidationResultProps> = ({
  certificateId,
  result,
  onViewCertificate,
  onDownloadReport
}) => {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'valid':
        return {
          variant: 'success',
          icon: faCheckCircle,
          title: 'Certificate Valid',
          color: '#28a745'
        };
      case 'tampered':
        return {
          variant: 'danger',
          icon: faTimesCircle,
          title: 'Certificate Tampered',
          color: '#dc3545'
        };
      case 'suspicious':
        return {
          variant: 'warning',
          icon: faExclamationTriangle,
          title: 'Suspicious Activity',
          color: '#ffc107'
        };
      case 'not_found':
        return {
          variant: 'secondary',
          icon: faQuestionCircle,
          title: 'Certificate Not Found',
          color: '#6c757d'
        };
      default:
        return {
          variant: 'danger',
          icon: faTimesCircle,
          title: 'Invalid Certificate',
          color: '#dc3545'
        };
    }
  };

  const statusConfig = getStatusConfig(result.status);

  const renderValidationDetails = () => {
    if (!result.validation_details) return null;

    const { hash_valid, blockchain_verified, ocr_analysis, structure_intact, tamper_score } = result.validation_details;

    return (
      <Card className="mt-3">
        <Card.Header>
          <h6 className="mb-0">
            <FontAwesomeIcon icon={faShieldAlt} className="me-2" />
            Validation Details
          </h6>
        </Card.Header>
        <Card.Body>
          <div className="row">
            <div className="col-md-6">
              <div className="validation-check mb-2" style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem' }}>
                <FontAwesomeIcon 
                  icon={hash_valid ? faCheckCircle : faTimesCircle} 
                  className={`me-2 ${hash_valid ? 'text-success' : 'text-danger'}`} 
                />
                <span>Hash Integrity: </span>
                <Badge bg={hash_valid ? 'success' : 'danger'}>
                  {hash_valid ? 'Valid' : 'Compromised'}
                </Badge>
              </div>
              
              <div className="validation-check mb-2" style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem' }}>
                <FontAwesomeIcon 
                  icon={blockchain_verified ? faCheckCircle : faTimesCircle} 
                  className={`me-2 ${blockchain_verified ? 'text-success' : 'text-danger'}`} 
                />
                <span>Blockchain Verification: </span>
                <Badge bg={blockchain_verified ? 'success' : 'danger'}>
                  {blockchain_verified ? 'Verified' : 'Not Found'}
                </Badge>
              </div>
            </div>
            
            <div className="col-md-6">
              <div className="validation-check mb-2" style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem' }}>
                <FontAwesomeIcon 
                  icon={ocr_analysis ? faCheckCircle : faTimesCircle} 
                  className={`me-2 ${ocr_analysis ? 'text-success' : 'text-danger'}`} 
                />
                <span>OCR Analysis: </span>
                <Badge bg={ocr_analysis ? 'success' : 'danger'}>
                  {ocr_analysis ? 'Passed' : 'Failed'}
                </Badge>
              </div>
              
              <div className="validation-check mb-2" style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem' }}>
                <FontAwesomeIcon 
                  icon={structure_intact ? faCheckCircle : faTimesCircle} 
                  className={`me-2 ${structure_intact ? 'text-success' : 'text-danger'}`} 
                />
                <span>Structure Check: </span>
                <Badge bg={structure_intact ? 'success' : 'danger'}>
                  {structure_intact ? 'Intact' : 'Modified'}
                </Badge>
              </div>
            </div>
          </div>
          
          {tamper_score !== undefined && (
            <div className="mt-3">
              <div className="d-flex justify-content-between align-items-center">
                <span>Tamper Risk Score:</span>
                <div>
                  <div 
                    className="progress me-2" 
                    style={{ width: '100px', height: '8px', display: 'inline-block', marginBottom: '0' }}
                  >
                    <div 
                      className={`progress-bar ${tamper_score > 70 ? 'bg-danger' : tamper_score > 30 ? 'bg-warning' : 'bg-success'}`}
                      role="progressbar" 
                      style={{ width: `${tamper_score}%` }}
                    />
                  </div>
                  <Badge 
                    bg={tamper_score > 70 ? 'danger' : tamper_score > 30 ? 'warning' : 'success'}
                  >
                    {tamper_score}%
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </Card.Body>
      </Card>
    );
  };

  const renderCertificateInfo = () => {
    if (!result.certificate) return null;

    const cert = result.certificate;

    return (
      <Card className="mt-3">
        <Card.Header>
          <h6 className="mb-0">Certificate Information</h6>
        </Card.Header>
        <Card.Body>
          <div className="row">
            <div className="col-md-6">
              <div className="info-item mb-2" style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
                <FontAwesomeIcon icon={faUser} className="me-2 text-primary" />
                <strong>Recipient:</strong> {cert.recipient_name}
              </div>
              <div className="info-item mb-2" style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
                <FontAwesomeIcon icon={faBuilding} className="me-2 text-primary" />
                <strong>Event:</strong> {cert.event_title}
              </div>
              <div className="info-item mb-2" style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
                <FontAwesomeIcon icon={faBuilding} className="me-2 text-primary" />
                <strong>Organization:</strong> {cert.organization}
              </div>
            </div>
            <div className="col-md-6">
              <div className="info-item mb-2" style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
                <FontAwesomeIcon icon={faCalendarAlt} className="me-2 text-primary" />
                <strong>Issue Date:</strong> {new Date(cert.issue_date).toLocaleDateString()}
              </div>
              <div className="info-item mb-2" style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
                <strong>Hash:</strong> 
                <code className="ms-2 small">{cert.verification_hash.substring(0, 16)}...</code>
              </div>
              {cert.blockchain_tx && (
                <div className="info-item mb-2" style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
                  <strong>Blockchain TX:</strong> 
                  <code className="ms-2 small">{cert.blockchain_tx.substring(0, 16)}...</code>
                </div>
              )}
            </div>
          </div>
        </Card.Body>
      </Card>
    );
  };

  const renderSecurityWarnings = () => {
    if (!result.security_warnings || result.security_warnings.length === 0) return null;

    return (
      <Alert variant="warning" className="mt-3">
        <Alert.Heading>
          <FontAwesomeIcon icon={faExclamationTriangle} className="me-2" />
          Security Warnings
        </Alert.Heading>
        <ul className="mb-0">
          {result.security_warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      </Alert>
    );
  };

  return (
    <div className="validation-result" style={{ maxWidth: '700px', margin: '0 auto' }}>
      <Card className="shadow-sm">
        <Card.Header className={`bg-${statusConfig.variant} text-white`}>
          <div className="d-flex justify-content-between align-items-center">
            <h5 className="mb-0">
              <FontAwesomeIcon icon={statusConfig.icon} className="me-2" />
              {statusConfig.title}
            </h5>
            <Badge bg="light" text="dark">
              ID: {certificateId}
            </Badge>
          </div>
        </Card.Header>
        <Card.Body>
          <Alert variant={statusConfig.variant} className="mb-3">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <strong>{result.message}</strong>
                <div className="mt-1">
                  <small>
                    Validated on: {new Date(result.timestamp).toLocaleString()}
                  </small>
                </div>
              </div>
              <FontAwesomeIcon 
                icon={statusConfig.icon} 
                size="2x" 
                style={{ color: statusConfig.color, opacity: 0.8 }}
              />
            </div>
          </Alert>

          {renderSecurityWarnings()}
          {renderCertificateInfo()}
          {renderValidationDetails()}

          {result.certificate && (
            <div className="d-flex gap-2 mt-3">
              {onViewCertificate && (
                <Button 
                  variant="primary" 
                  onClick={() => onViewCertificate(certificateId)}
                >
                  <FontAwesomeIcon icon={faEye} className="me-2" />
                  View Certificate
                </Button>
              )}
              {onDownloadReport && (
                <Button 
                  variant="outline-secondary" 
                  onClick={() => onDownloadReport(certificateId)}
                >
                  <FontAwesomeIcon icon={faDownload} className="me-2" />
                  Download Report
                </Button>
              )}
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default ValidationResult;
