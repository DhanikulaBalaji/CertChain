import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Alert, Badge, Spinner } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faCertificate, 
  faDownload, 
  faCalendarAlt, 
  faUser, 
  faEye,
  faSpinner,
  faExclamationTriangle
} from '@fortawesome/free-solid-svg-icons';
import api from '../services/api';

interface Certificate {
  id: number;
  certificate_id: string;
  recipient_name: string;
  event_name: string;
  event_date: string;
  status: string;
  issued_date: string;
}

const MyCertificates: React.FC = () => {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    fetchCertificates();
  }, []);

  const fetchCertificates = async () => {
    try {
      setLoading(true);
      const response = await api.get('/certificates/my-certificates');
      setCertificates(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch certificates');
    } finally {
      setLoading(false);
    }
  };

  const downloadCertificate = async (certificateId: string) => {
    try {
      setDownloadingId(certificateId);
      const response = await api.get(`/certificates/download/${certificateId}`, {
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `certificate_${certificateId}.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to download certificate');
    } finally {
      setDownloadingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return <Badge bg="success">Active</Badge>;
      case 'revoked':
        return <Badge bg="danger">Revoked</Badge>;
      case 'suspended':
        return <Badge bg="warning">Suspended</Badge>;
      default:
        return <Badge bg="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Container className="mt-5 text-center">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
        <p className="mt-3">Loading your certificates...</p>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      <Row>
        <Col>
          <Card className="shadow-sm">
            <Card.Header className="bg-primary text-white">
              <h4 className="mb-0">
                <FontAwesomeIcon icon={faCertificate} className="me-2" />
                My Certificates
              </h4>
            </Card.Header>
            <Card.Body>
              {error && (
                <Alert variant="danger" dismissible onClose={() => setError('')}>
                  {error}
                </Alert>
              )}

              {certificates.length === 0 ? (
                <div className="text-center py-5">
                  <FontAwesomeIcon icon={faExclamationTriangle} size="3x" className="text-muted mb-3" />
                  <h5 className="text-muted">No Certificates Found</h5>
                  <p className="text-muted">
                    You don't have any certificates yet. Certificates will appear here once:
                  </p>
                  <ul className="list-unstyled text-muted">
                    <li>• You participate in an event</li>
                    <li>• The event admin generates your certificate</li>
                    <li>• The admin closes the event for certificate viewing</li>
                  </ul>
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <Alert variant="info">
                      <FontAwesomeIcon icon={faCertificate} className="me-2" />
                      <strong>Your Certificates</strong> - You can view and download certificates from events you've participated in.
                    </Alert>
                  </div>

                  <div className="table-responsive">
                    <Table striped bordered hover>
                      <thead className="table-dark">
                        <tr>
                          <th>Certificate ID</th>
                          <th>
                            <FontAwesomeIcon icon={faUser} className="me-1" />
                            Recipient
                          </th>
                          <th>
                            <FontAwesomeIcon icon={faCalendarAlt} className="me-1" />
                            Event
                          </th>
                          <th>Event Date</th>
                          <th>Issued Date</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {certificates.map((cert) => (
                          <tr key={cert.id}>
                            <td>
                              <code className="text-primary">{cert.certificate_id}</code>
                            </td>
                            <td>{cert.recipient_name}</td>
                            <td>
                              <strong>{cert.event_name}</strong>
                            </td>
                            <td>{new Date(cert.event_date).toLocaleDateString()}</td>
                            <td>{new Date(cert.issued_date).toLocaleDateString()}</td>
                            <td>{getStatusBadge(cert.status)}</td>
                            <td>
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => downloadCertificate(cert.certificate_id)}
                                disabled={downloadingId === cert.certificate_id || cert.status.toLowerCase() === 'revoked'}
                                title={cert.status.toLowerCase() === 'revoked' ? 'Cannot download revoked certificate' : 'Download Certificate'}
                              >
                                {downloadingId === cert.certificate_id ? (
                                  <>
                                    <FontAwesomeIcon icon={faSpinner} spin className="me-1" />
                                    Downloading...
                                  </>
                                ) : (
                                  <>
                                    <FontAwesomeIcon icon={faDownload} className="me-1" />
                                    Download
                                  </>
                                )}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>

                  <div className="mt-3">
                    <small className="text-muted">
                      <FontAwesomeIcon icon={faEye} className="me-1" />
                      Total certificates: {certificates.length}
                    </small>
                  </div>
                </>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default MyCertificates;
