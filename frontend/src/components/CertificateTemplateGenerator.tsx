import React, { useState } from 'react';
import { Alert, Button, Col, Row } from 'react-bootstrap';

interface CertificateTemplateGeneratorProps {
  onTemplateGenerated?: (templateData: any) => void;
}

const CertificateTemplateGenerator: React.FC<CertificateTemplateGeneratorProps> = ({
  onTemplateGenerated
}) => {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const downloadTemplate = async () => {
    try {
      setGenerating(true);
      setError('');
      
      const response = await fetch('/api/v1/certificates/download-template', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to download template');
      }

      // Create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'certificate_recipients_template.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setSuccess('Template downloaded successfully!');
      
      if (onTemplateGenerated) {
        onTemplateGenerated({ downloaded: true });
      }
      
    } catch (err: any) {
      console.error('Template download error:', err);
      setError('Failed to download template');
    } finally {
      setGenerating(false);
    }
  };

  const generateSampleData = () => {
    return `recipient_name,participant_id,email,phone_number
John Doe,PART-001,john.doe@example.com,+1234567890
Jane Smith,,jane.smith@example.com,+0987654321
Mike Johnson,STU-2023,mike.johnson@example.com,+1122334455
Sarah Wilson,CERT-101,sarah.wilson@example.com,+1555666777
David Brown,,david.brown@example.com,+1999888777`;
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generateSampleData());
      setSuccess('Sample data copied to clipboard!');
    } catch (err) {
      setError('Failed to copy to clipboard');
    }
  };

  return (
    <div className="certificate-template-generator">
      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert variant="success" dismissible onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      <Row className="mb-3">
        <Col md={6}>
          <Button
            variant="outline-info"
            onClick={downloadTemplate}
            disabled={generating}
            className="w-100"
          >
            {generating ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" />
                Generating...
              </>
            ) : (
              <>
                <i className="fas fa-download me-1"></i> Download CSV Template
              </>
            )}
          </Button>
        </Col>
        <Col md={6}>
          <Button
            variant="outline-secondary"
            onClick={copyToClipboard}
            className="w-100"
          >
            <i className="fas fa-copy me-1"></i> Copy Sample Data
          </Button>
        </Col>
      </Row>

      <Alert variant="info" className="mb-0">
        <Alert.Heading><i className="fas fa-info-circle me-2"></i>Template Format Guide</Alert.Heading>
        <hr />
        <Row>
          <Col md={6}>
            <h6>📝 Required Fields:</h6>
            <ul className="mb-2">
              <li><code>recipient_name</code> - Full name of recipient</li>
            </ul>
            
            <h6><i className="fas fa-chart-bar me-1"></i> Optional Fields:</h6>
            <ul className="mb-2">
              <li><code>participant_id</code> - Custom ID (auto-generated if empty)</li>
              <li><code>email</code> - Email for notifications</li>
              <li><code>phone_number</code> - Contact information</li>
            </ul>
          </Col>
          <Col md={6}>
            <h6>🆔 Auto-Generated ID Formats:</h6>
            <ul className="mb-2">
              <li><code>PART-001, PART-002...</code> - Participant IDs</li>
              <li><code>STU-001, STU-002...</code> - Student IDs</li>
              <li><code>CERT-001, CERT-002...</code> - Certificate IDs</li>
              <li><code>ATT-001, ATT-002...</code> - Attendee IDs</li>
            </ul>
            
            <small className="text-muted">
              <i className="fas fa-lightbulb me-1 text-warning"></i><strong>Tip:</strong> Leave participant_id empty for auto-generation with rotating prefixes
            </small>
          </Col>
        </Row>
      </Alert>
    </div>
  );
};

export default CertificateTemplateGenerator;
