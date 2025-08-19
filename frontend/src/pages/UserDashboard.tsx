import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Alert, Tab, Tabs, Table, Badge, Form, Modal } from 'react-bootstrap';
import { useAuth } from '../services/AuthContext';
import api from '../services/api';
import { formatDate } from '../utils/dateUtils';
import QRScanner from '../components/QRScanner';
import { handleApiError } from '../utils/errorHandler';

interface Certificate {
  id: number;
  certificate_id: string;
  recipient_name: string;
  recipient_email?: string;
  participant_id?: string;
  event_name: string;
  event_description?: string;
  status: string;
  issued_date: string;
  event_date: string;
  sha256_hash?: string;
  is_verified: boolean;
  blockchain_tx_hash?: string;
}

interface Event {
  id: number;
  name: string;
  description: string;
  date: string;
  admin_name: string;
  status: string;
  is_approved: boolean;
  approved_at: string;
  created_at: string;
  is_registered?: boolean; // Add registration status
}

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

const UserDashboard: React.FC = () => {
  const { user } = useAuth();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [approvedEvents, setApprovedEvents] = useState<Event[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [registrationLoading, setRegistrationLoading] = useState<{[key: number]: boolean}>({});
  
  // Validation
  const [validateId, setValidateId] = useState('');
  const [validationResult, setValidationResult] = useState<any>(null);
  const [validating, setValidating] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);

  // Tamper Detection
  const [tamperCheckId, setTamperCheckId] = useState('');
  const [tamperResult, setTamperResult] = useState<any>(null);
  const [tamperChecking, setTamperChecking] = useState(false);

  // Certificate view modal
  const [showViewCertModal, setShowViewCertModal] = useState(false);
  const [selectedCertificate, setSelectedCertificate] = useState<Certificate | null>(null);
  const [certificateDetails, setCertificateDetails] = useState<any>(null);
  const [certificateLoading, setCertificateLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [certsRes, eventsRes, notificationsRes] = await Promise.all([
          api.get('/certificates/my-certificates'),
          api.get('/events/approved-events'),
          api.get('/notifications')
        ]);
        
        setCertificates(certsRes.data);
        setApprovedEvents(eventsRes.data);
        setNotifications(notificationsRes.data);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
    // Remove aggressive polling - only refresh on user interaction or manual refresh
    // const interval = setInterval(fetchData, 30000);
    // return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(''); // Clear previous errors
      
      // Add timeout to prevent hanging requests
      const timeout = 10000; // 10 seconds
      
      const [certsRes, eventsRes, notificationsRes] = await Promise.all([
        api.get('/certificates/my-certificates', { timeout }),
        api.get('/events/approved-events', { timeout }),
        api.get('/notifications', { timeout })
      ]);
      
      setCertificates(certsRes.data || []);
      setNotifications(notificationsRes.data || []);
      
      // For each event, check registration status
      const eventsWithRegistrationStatus = await Promise.all(
        (eventsRes.data || []).map(async (event: Event) => {
          try {
            const regStatusRes = await api.get(`/event-participants/${event.id}/registration-status`, { timeout });
            return {
              ...event,
              is_registered: regStatusRes.data.is_registered
            };
          } catch (error) {
            // If registration status check fails, assume not registered
            console.warn(`Failed to check registration status for event ${event.id}:`, error);
            return {
              ...event,
              is_registered: false
            };
          }
        })
      );
      
      setApprovedEvents(eventsWithRegistrationStatus);
      
      // Clear any previous errors if successful
      if (error) {
        setError('');
      }
    } catch (err: any) {
      console.error('Dashboard data fetch error:', err);
      let errorMessage = 'Failed to load dashboard data';
      
      if (err.code === 'ECONNREFUSED' || err.message?.includes('Network Error')) {
        errorMessage = 'Cannot connect to server. Please ensure the backend is running.';
      } else if (err.response?.status === 401) {
        errorMessage = 'Authentication failed. Please log in again.';
      } else if (err.response?.status === 403) {
        errorMessage = 'Access denied. Please check your permissions.';
      } else if (err.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      }
      
      setError(errorMessage);
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleValidateCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateId.trim()) return;

    setValidating(true);
    setValidationResult(null);
    setError('');

    try {
      const response = await api.post('/certificates/validate', {
        certificate_id: validateId.trim()
      });
      setValidationResult(response.data);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setValidationResult({
          status: 'NOT_FOUND',
          message: 'Certificate not found',
          certificate_id: validateId.trim()
        });
      } else {
        setError('Failed to validate certificate');
      }
    } finally {
      setValidating(false);
    }
  };

  const handleQRScan = (result: string) => {
    try {
      // Try to parse QR code data - it might be JSON with certificate info
      const qrData = JSON.parse(result);
      if (qrData.certificate_id) {
        setValidateId(qrData.certificate_id);
        setShowQRScanner(false);
        // Automatically validate the certificate
        handleValidateCertificate({ preventDefault: () => {} } as React.FormEvent);
      }
    } catch {
      // If not JSON, assume it's just the certificate ID
      setValidateId(result);
      setShowQRScanner(false);
      // Automatically validate the certificate
      handleValidateCertificate({ preventDefault: () => {} } as React.FormEvent);
    }
  };

  const handleTamperCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tamperCheckId.trim()) return;

    setTamperChecking(true);
    setTamperResult(null);
    setError('');

    try {
      const response = await api.get(`/certificates/${tamperCheckId.trim()}/tamper-check`);
      setTamperResult(response.data);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setTamperResult({
          certificate_id: tamperCheckId.trim(),
          tamper_detected: false,
          status: 'not_found',
          message: 'Certificate not found'
        });
      } else if (err.response?.status === 403) {
        setError('Access denied to this certificate');
      } else {
        setError('Failed to check certificate for tampering');
      }
    } finally {
      setTamperChecking(false);
    }
  };

  const markNotificationRead = async (notificationId: number) => {
    try {
      await api.post(`/notifications/${notificationId}/mark-read`);
      setNotifications(notifications.map(n => 
        n.id === notificationId ? { ...n, is_read: true } : n
      ));
    } catch (err) {
      console.error('Failed to mark notification as read');
    }
  };

  const handleRefresh = () => {
    fetchData();
  };

  const handleEventRegistration = async (eventId: number) => {
    try {
      setError('');
      setRegistrationLoading(prev => ({ ...prev, [eventId]: true }));
      
      await api.post('/event-participants/register', {
        event_id: eventId,
        participant_name: user?.full_name || user?.email || '',
        participant_email: user?.email || ''
      });
      
      // Show success message
      alert('Successfully registered for the event!');
      
      // Update the specific event's registration status without full refresh
      setApprovedEvents(prev => 
        prev.map(event => 
          event.id === eventId 
            ? { ...event, is_registered: true }
            : event
        )
      );
    } catch (err: any) {
      setError(handleApiError(err));
    } finally {
      setRegistrationLoading(prev => ({ ...prev, [eventId]: false }));
    }
  };

  const handleViewCertificate = async (certificate: Certificate) => {
    try {
      setCertificateLoading(true);
      setSelectedCertificate(certificate);
      
      // Fetch detailed certificate information
      const response = await api.get(`/certificates/${certificate.certificate_id}/details`);
      setCertificateDetails(response.data);
      setShowViewCertModal(true);
    } catch (err: any) {
      // If detailed API doesn't exist, show the certificate data we already have
      console.log('Detailed certificate API not available, using existing data');
      setSelectedCertificate(certificate);
      setCertificateDetails(certificate);
      setShowViewCertModal(true);
    } finally {
      setCertificateLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: { [key: string]: string } = {
      valid: 'success',
      revoked: 'danger',
      pending: 'warning',
      VALID: 'success',
      TAMPERED: 'danger',
      SUSPICIOUS: 'warning',
      NOT_FOUND: 'secondary'
    };
    
    return <Badge bg={variants[status] || 'secondary'}>{status.toUpperCase()}</Badge>;
  };

  const getValidationIcon = (status: string) => {
    switch (status) {
      case 'VALID':
        return '✅';
      case 'TAMPERED':
        return '❌';
      case 'SUSPICIOUS':
        return '⚠️';
      case 'NOT_FOUND':
        return '🚫';
      default:
        return '❓';
    }
  };

  const getTamperStatusIcon = (status: string) => {
    switch (status) {
      case 'clean':
        return '🛡️';
      case 'tampered':
        return '⚠️';
      case 'no_file':
        return '📄';
      case 'not_found':
        return '🚫';
      default:
        return '❓';
    }
  };

  if (loading) {
    return (
      <Container className="py-5">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-3">Loading dashboard...</p>
        </div>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="py-5">
        <Row className="justify-content-center">
          <Col md={8}>
            <Alert variant="danger" className="text-center">
              <h5 className="alert-heading">Dashboard Loading Error</h5>
              <p>{error}</p>
              <hr />
              <div className="d-flex justify-content-center gap-2">
                <Button 
                  variant="outline-danger" 
                  onClick={() => window.location.reload()}
                >
                  Reload Page
                </Button>
                <Button 
                  variant="primary" 
                  onClick={() => {
                    setError('');
                    fetchData();
                  }}
                >
                  Retry Loading
                </Button>
              </div>
            </Alert>
          </Col>
        </Row>
      </Container>
    );
  }

  return (
    <Container fluid className="py-4 dashboard-container">
      <Row className="mb-4">
        <Col>
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h2>🎓 User Dashboard</h2>
              <p className="text-muted">Welcome back, {user?.full_name}!</p>
            </div>
            <Button 
              variant="outline-secondary" 
              onClick={fetchData}
              disabled={loading}
            >
              <i className="fas fa-sync-alt me-2"></i>
              {loading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </Col>
      </Row>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          <i className="fas fa-exclamation-triangle me-2"></i>
          {error}
        </Alert>
      )}

      {/* Overview Cards */}
      <Row className="mb-4">
        <Col md={4}>
          <Card className="bg-primary text-white">
            <Card.Body>
              <div className="d-flex justify-content-between">
                <div>
                  <h4>{certificates.length}</h4>
                  <p className="mb-0">My Certificates</p>
                </div>
                <i className="fas fa-certificate fa-2x opacity-75"></i>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="bg-success text-white">
            <Card.Body>
              <div className="d-flex justify-content-between">
                <div>
                  <h4>{certificates.filter(c => c.status === 'valid').length}</h4>
                  <p className="mb-0">Valid Certificates</p>
                </div>
                <i className="fas fa-check-circle fa-2x opacity-75"></i>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="bg-info text-white">
            <Card.Body>
              <div className="d-flex justify-content-between">
                <div>
                  <h4>{notifications.filter(n => !n.is_read).length}</h4>
                  <p className="mb-0">Unread Notifications</p>
                </div>
                <i className="fas fa-bell fa-2x opacity-75"></i>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Quick Actions */}
      <Row className="mb-4">
        <Col>
          <Card>
            <Card.Header>
              <h5 className="mb-0">🔍 Quick Certificate Validation</h5>
            </Card.Header>
            <Card.Body>
              <Form onSubmit={handleValidateCertificate}>
                <Row className="align-items-end">
                  <Col md={8}>
                    <Form.Group>
                      <Form.Label>Certificate ID</Form.Label>
                      <Form.Control
                        type="text"
                        value={validateId}
                        onChange={(e) => setValidateId(e.target.value)}
                        placeholder="Enter certificate ID (e.g., CERT-ABC123456789)"
                        disabled={validating}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={validating || !validateId.trim()}
                      className="w-100"
                    >
                      {validating ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2"></span>
                          Validating...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-search me-2"></i>
                          Validate
                        </>
                      )}
                    </Button>
                  </Col>
                </Row>
              </Form>

              {validationResult && (
                <Alert 
                  variant={
                    validationResult.status === 'VALID' ? 'success' :
                    validationResult.status === 'TAMPERED' ? 'danger' :
                    validationResult.status === 'SUSPICIOUS' ? 'warning' : 'secondary'
                  } 
                  className="mt-3"
                >
                  <div className="d-flex align-items-center">
                    <span className="fs-2 me-3">{getValidationIcon(validationResult.status)}</span>
                    <div>
                      <h5 className="mb-1">
                        {getValidationIcon(validationResult.status)} {validationResult.status}
                      </h5>
                      <p className="mb-1">{validationResult.message}</p>
                      {validationResult.certificate && (
                        <div className="small">
                          <strong>Recipient:</strong> {validationResult.certificate.recipient_name}<br />
                          <strong>Event:</strong> {validationResult.certificate.event_name}<br />
                          <strong>Issued:</strong> {formatDate(validationResult.certificate.issued_date)}
                        </div>
                      )}
                    </div>
                  </div>
                </Alert>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Tabs */}
      <Tabs activeKey={activeTab} onSelect={(k) => setActiveTab(k || 'overview')} className="mb-4">
        <Tab eventKey="overview" title="📊 Overview">
          <Row>
            <Col md={8}>
              <Card>
                <Card.Header>
                  <h5 className="mb-0">📜 My Recent Certificates</h5>
                </Card.Header>
                <Card.Body>
                  {certificates.length === 0 ? (
                    <div className="text-center py-4">
                      <i className="fas fa-certificate fa-3x text-muted mb-3"></i>
                      <p className="text-muted">No certificates yet</p>
                      <p className="small text-muted">
                        Certificates will appear here when issued to you by administrators.
                      </p>
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <Table hover size="sm">
                        <thead>
                          <tr>
                            <th>Certificate ID</th>
                            <th>Event Details</th>
                            <th>Participant Info</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {certificates.slice(0, 5).map(cert => (
                            <tr key={cert.id}>
                              <td>
                                <code className="text-primary">{cert.certificate_id}</code>
                                <br />
                                <small className="text-muted">
                                  <i className="fas fa-calendar me-1"></i>
                                  Issued: {formatDate(cert.issued_date)}
                                </small>
                              </td>
                              <td>
                                <div>
                                  <strong>{cert.event_name}</strong>
                                  {cert.event_description && (
                                    <div className="small text-muted mt-1">
                                      {cert.event_description.length > 50 
                                        ? cert.event_description.substring(0, 50) + '...'
                                        : cert.event_description
                                      }
                                    </div>
                                  )}
                                  <small className="text-info">
                                    <i className="fas fa-calendar-alt me-1"></i>
                                    Event: {new Date(cert.event_date).toLocaleDateString()}
                                  </small>
                                </div>
                              </td>
                              <td>
                                <div>
                                  <div className="fw-bold">{cert.recipient_name}</div>
                                  {cert.participant_id && (
                                    <small className="text-muted">
                                      <i className="fas fa-id-card me-1"></i>
                                      ID: {cert.participant_id}
                                    </small>
                                  )}
                                  {cert.recipient_email && cert.recipient_email !== "Not provided" && (
                                    <div className="small text-muted">
                                      <i className="fas fa-envelope me-1"></i>
                                      {cert.recipient_email}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td>
                                <div>
                                  {getStatusBadge(cert.status)}
                                  {cert.is_verified && (
                                    <div className="mt-1">
                                      <Badge bg="success" className="small">
                                        <i className="fas fa-shield-alt me-1"></i>
                                        Verified
                                      </Badge>
                                    </div>
                                  )}
                                  {cert.blockchain_tx_hash && cert.blockchain_tx_hash !== "Pending blockchain verification" && (
                                    <div className="mt-1">
                                      <Badge bg="info" className="small">
                                        <i className="fas fa-link me-1"></i>
                                        On Blockchain
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td>
                                <div className="d-flex flex-column gap-1">
                                  <Button size="sm" variant="outline-primary">
                                    <i className="fas fa-download me-1"></i>
                                    Download
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline-info"
                                    onClick={() => {
                                      // Show certificate details modal
                                      setSelectedCertificate(cert);
                                      setShowViewCertModal(true);
                                    }}
                                  >
                                    <i className="fas fa-eye me-1"></i>
                                    View Details
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  )}
                </Card.Body>
              </Card>
            </Col>
            <Col md={4}>
              <Card>
                <Card.Header>
                  <h5 className="mb-0">🔔 Recent Notifications</h5>
                </Card.Header>
                <Card.Body style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <p className="text-muted text-center py-3">No notifications</p>
                  ) : (
                    notifications.slice(0, 10).map(notification => (
                      <div
                        key={notification.id}
                        className={`border-bottom pb-2 mb-2 ${!notification.is_read ? 'bg-light rounded p-2' : ''}`}
                      >
                        <div className="d-flex justify-content-between align-items-start">
                          <div className="flex-grow-1">
                            <h6 className="mb-1">
                              {!notification.is_read && <Badge bg="primary" className="me-2">NEW</Badge>}
                              {notification.title}
                            </h6>
                            <p className="small mb-1">{notification.message}</p>
                            <small className="text-muted">
                              {new Date(notification.created_at).toLocaleDateString()}
                            </small>
                          </div>
                          {!notification.is_read && (
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              onClick={() => markNotificationRead(notification.id)}
                            >
                              Mark Read
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Tab>

        <Tab eventKey="certificates" title="📜 My Certificates">
          <Card>
            <Card.Header>
              <h5 className="mb-0">My Certificates</h5>
            </Card.Header>
            <Card.Body>
              {certificates.length === 0 ? (
                <div className="text-center py-5">
                  <i className="fas fa-certificate fa-4x text-muted mb-4"></i>
                  <h4 className="text-muted">No Certificates Yet</h4>
                  <p className="text-muted">
                    Your certificates will appear here when they are issued by administrators.
                  </p>
                </div>
              ) : (
                <div className="table-responsive">
                  <Table hover>
                    <thead>
                      <tr>
                        <th>Certificate ID</th>
                        <th>Participant ID</th>
                        <th>Recipient Details</th>
                        <th>Event</th>
                        <th>Status</th>
                        <th>Issued Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {certificates.map(cert => (
                        <tr key={cert.id}>
                          <td>
                            <code className="text-primary">{cert.certificate_id}</code>
                          </td>
                          <td>
                            <span className="badge bg-secondary">{cert.participant_id || `PART-${cert.id.toString().padStart(4, '0')}`}</span>
                          </td>
                          <td>
                            <div>
                              <strong>{cert.recipient_name}</strong><br/>
                              <small className="text-muted">{cert.recipient_email || user?.email}</small>
                            </div>
                          </td>
                          <td>
                            <div>
                              <strong>{cert.event_name}</strong><br/>
                              <small className="text-muted">Date: {new Date(cert.event_date).toLocaleDateString()}</small>
                            </div>
                          </td>
                          <td>{getStatusBadge(cert.status)}</td>
                          <td>
                            <span title={new Date(cert.issued_date).toLocaleString()}>
                              {formatDate(cert.issued_date)}
                            </span>
                          </td>
                          <td>
                            <div className="btn-group">
                              <Button 
                                size="sm" 
                                variant="outline-info"
                                onClick={() => handleViewCertificate(cert)}
                              >
                                <i className="fas fa-eye me-1"></i>
                                View
                              </Button>
                              <Button size="sm" variant="primary">
                                <i className="fas fa-download me-1"></i>
                                Download PDF
                              </Button>
                              <Button size="sm" variant="outline-info">
                                <i className="fas fa-qrcode me-1"></i>
                                View QR
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline-success"
                                onClick={() => {
                                  setValidateId(cert.certificate_id);
                                  setActiveTab('validation');
                                }}
                              >
                                <i className="fas fa-check-circle me-1"></i>
                                Validate
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline-warning"
                                onClick={() => {
                                  setTamperCheckId(cert.certificate_id);
                                  setActiveTab('tamper-detection');
                                }}
                              >
                                <i className="fas fa-shield-alt me-1"></i>
                                Check Tampering
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </Card.Body>
          </Card>
        </Tab>

        <Tab eventKey="events" title="📅 Available Events">
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">📅 Events Available for Registration</h5>
              <Button variant="outline-primary" size="sm" onClick={handleRefresh} disabled={loading}>
                <i className="fas fa-sync-alt me-2"></i>
                {loading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </Card.Header>
            <Card.Body>
              {approvedEvents.length === 0 ? (
                <div className="text-center py-4">
                  <i className="fas fa-calendar-plus fa-3x text-muted mb-3"></i>
                  <p className="text-muted">No approved events available</p>
                  <p className="small text-muted">
                    Check back later for new events approved by administrators.
                  </p>
                </div>
              ) : (
                <div className="table-responsive">
                  <Table hover>
                    <thead>
                      <tr>
                        <th>Event Name</th>
                        <th>Description</th>
                        <th>Event Date</th>
                        <th>Created By</th>
                        <th>Created At</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {approvedEvents.map(event => (
                        <tr key={event.id}>
                          <td><strong>{event.name}</strong></td>
                          <td>
                            <span title={event.description}>
                              {event.description.length > 50 
                                ? `${event.description.substring(0, 50)}...` 
                                : event.description}
                            </span>
                          </td>
                          <td>
                            <span title={new Date(event.date).toLocaleString()}>
                              {new Date(event.date).toLocaleDateString()}
                            </span>
                          </td>
                          <td>
                            <strong>{event.admin_name}</strong>
                          </td>
                          <td>
                            <span title={new Date(event.created_at).toLocaleString()}>
                              {new Date(event.created_at).toLocaleDateString()}
                            </span>
                          </td>
                          <td>
                            <Badge bg="success">
                              <i className="fas fa-check me-1"></i>
                              Approved
                            </Badge>
                          </td>
                          <td>
                            {event.is_registered ? (
                              <Button
                                size="sm"
                                variant="success"
                                disabled
                              >
                                <i className="fas fa-check me-1"></i>
                                Already Registered
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => handleEventRegistration(event.id)}
                                disabled={registrationLoading[event.id] || false}
                              >
                                {registrationLoading[event.id] ? (
                                  <>
                                    <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                    Registering...
                                  </>
                                ) : (
                                  <>
                                    <i className="fas fa-user-plus me-1"></i>
                                    Register
                                  </>
                                )}
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </Card.Body>
          </Card>
        </Tab>

        <Tab eventKey="validation" title="🔍 Validate Certificate">
          <Card>
            <Card.Header>
              <h5 className="mb-0">Certificate Validation</h5>
            </Card.Header>
            <Card.Body>
              <Row>
                <Col md={8}>
                  <Form onSubmit={handleValidateCertificate}>
                    <Form.Group className="mb-3">
                      <Form.Label>Certificate ID</Form.Label>
                      <Form.Control
                        type="text"
                        value={validateId}
                        onChange={(e) => setValidateId(e.target.value)}
                        placeholder="Enter certificate ID (e.g., CERT-ABC123456789)"
                        disabled={validating}
                        size="lg"
                      />
                      <Form.Text className="text-muted">
                        Enter the certificate ID to validate its authenticity and status.
                      </Form.Text>
                    </Form.Group>
                    
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      disabled={validating || !validateId.trim()}
                      className="me-3"
                    >
                      {validating ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2"></span>
                          Validating Certificate...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-search me-2"></i>
                          Validate Certificate
                        </>
                      )}
                    </Button>
                    
                    <Button
                      variant="outline-primary"
                      size="lg"
                      onClick={() => setShowQRScanner(true)}
                      disabled={validating}
                    >
                      <i className="fas fa-qrcode me-2"></i>
                      Scan QR Code
                    </Button>
                  </Form>

                  {validationResult && (
                    <Card className="mt-4">
                      <Card.Header className={
                        validationResult.status === 'VALID' ? 'bg-success text-white' :
                        validationResult.status === 'TAMPERED' ? 'bg-danger text-white' :
                        validationResult.status === 'SUSPICIOUS' ? 'bg-warning' : 'bg-secondary text-white'
                      }>
                        <h5 className="mb-0">
                          {getValidationIcon(validationResult.status)} Validation Result: {validationResult.status}
                        </h5>
                      </Card.Header>
                      <Card.Body>
                        <p className="mb-3">{validationResult.message}</p>
                        
                        {validationResult.certificate && (
                          <div className="row">
                            <div className="col-md-6">
                              <h6>Certificate Details:</h6>
                              <ul className="list-unstyled">
                                <li><strong>Certificate ID:</strong> {validationResult.certificate.certificate_id}</li>
                                <li><strong>Recipient:</strong> {validationResult.certificate.recipient_name}</li>
                                <li><strong>Event:</strong> {validationResult.certificate.event_name}</li>
                                <li><strong>Event Date:</strong> {new Date(validationResult.certificate.event_date).toLocaleDateString()}</li>
                                <li><strong>Issued Date:</strong> {formatDate(validationResult.certificate.issued_date)}</li>
                              </ul>
                            </div>
                            <div className="col-md-6">
                              <h6>Validation Checks:</h6>
                              <ul className="list-unstyled">
                                {validationResult.checks && Object.entries(validationResult.checks).map(([check, passed]: [string, any]) => (
                                  <li key={check}>
                                    {passed ? '✅' : '❌'} {check.replace('_', ' ').toUpperCase()}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}

                        {validationResult.blockchain_verified && (
                          <Alert variant="info" className="mt-3">
                            <i className="fas fa-link me-2"></i>
                            <strong>Blockchain Verified:</strong> This certificate's hash is verified on the blockchain.
                          </Alert>
                        )}
                      </Card.Body>
                    </Card>
                  )}
                </Col>
                <Col md={4}>
                  <Card className="bg-light">
                    <Card.Body>
                      <h6>📱 QR Code Validation</h6>
                      <p className="small text-muted mb-3">
                        You can also scan the QR code on the certificate using your mobile device for quick validation.
                      </p>
                      <Button variant="outline-primary" size="sm" className="w-100">
                        <i className="fas fa-camera me-2"></i>
                        Scan QR Code
                      </Button>
                    </Card.Body>
                  </Card>

                  <Card className="bg-light mt-3">
                    <Card.Body>
                      <h6>ℹ️ Validation Status Guide</h6>
                      <div className="small">
                        <p><span className="text-success">✅ VALID:</span> Certificate is authentic and valid</p>
                        <p><span className="text-danger">❌ TAMPERED:</span> Certificate has been modified</p>
                        <p><span className="text-warning">⚠️ SUSPICIOUS:</span> Potential issues detected</p>
                        <p><span className="text-secondary">🚫 NOT FOUND:</span> Certificate doesn't exist</p>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Tab>

        <Tab eventKey="tamper-detection" title="🛡️ Tamper Detection">
          <Card>
            <Card.Header>
              <h5 className="mb-0">Certificate Tamper Detection</h5>
            </Card.Header>
            <Card.Body>
              <Row>
                <Col md={8}>
                  <Alert variant="info" className="mb-4">
                    <i className="fas fa-info-circle me-2"></i>
                    <strong>About Tamper Detection:</strong> This advanced security feature uses multiple AI-powered algorithms 
                    to detect if a certificate has been modified, forged, or tampered with after being issued.
                  </Alert>
                  
                  <Form onSubmit={handleTamperCheck}>
                    <Form.Group className="mb-3">
                      <Form.Label>Certificate ID to Check</Form.Label>
                      <Form.Control
                        type="text"
                        value={tamperCheckId}
                        onChange={(e) => setTamperCheckId(e.target.value)}
                        placeholder="Enter certificate ID (e.g., CERT-ABC123456789)"
                        disabled={tamperChecking}
                        size="lg"
                      />
                      <Form.Text className="text-muted">
                        Enter your certificate ID to perform comprehensive tamper detection analysis.
                      </Form.Text>
                    </Form.Group>
                    
                    <Button
                      type="submit"
                      variant="warning"
                      size="lg"
                      disabled={tamperChecking || !tamperCheckId.trim()}
                    >
                      {tamperChecking ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2"></span>
                          Analyzing Certificate...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-shield-alt me-2"></i>
                          Check for Tampering
                        </>
                      )}
                    </Button>
                  </Form>

                  {tamperResult && (
                    <Card className="mt-4">
                      <Card.Header className={
                        tamperResult.status === 'clean' ? 'bg-success text-white' :
                        tamperResult.status === 'tampered' ? 'bg-danger text-white' :
                        tamperResult.status === 'no_file' ? 'bg-warning' : 'bg-secondary text-white'
                      }>
                        <h5 className="mb-0">
                          {getTamperStatusIcon(tamperResult.status)} Tamper Analysis: {tamperResult.status.toUpperCase()}
                        </h5>
                      </Card.Header>
                      <Card.Body>
                        <p className="mb-3">{tamperResult.message}</p>
                        
                        {tamperResult.confidence_score && (
                          <div className="mb-3">
                            <strong>Confidence Score: </strong>
                            <Badge bg={tamperResult.confidence_score >= 0.8 ? 'success' : 
                                      tamperResult.confidence_score >= 0.6 ? 'warning' : 'danger'}>
                              {(tamperResult.confidence_score * 100).toFixed(1)}%
                            </Badge>
                          </div>
                        )}

                        {tamperResult.details && Object.keys(tamperResult.details).length > 0 && (
                          <div className="row">
                            <div className="col-12">
                              <h6>Detection Methods:</h6>
                              <Table size="sm" className="table-borderless">
                                <tbody>
                                  {Object.entries(tamperResult.details).map(([method, result]: [string, any]) => (
                                    <tr key={method}>
                                      <td><strong>{method.replace('_', ' ').toUpperCase()}:</strong></td>
                                      <td>
                                        <Badge bg={result.tamper_detected ? 'danger' : 'success'}>
                                          {result.tamper_detected ? 'TAMPER DETECTED' : 'CLEAN'}
                                        </Badge>
                                      </td>
                                      <td className="text-muted small">{result.details}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </Table>
                            </div>
                          </div>
                        )}

                        {tamperResult.tamper_detected && (
                          <Alert variant="danger" className="mt-3">
                            <i className="fas fa-exclamation-triangle me-2"></i>
                            <strong>SECURITY WARNING:</strong> This certificate shows signs of tampering or modification. 
                            Please contact the issuing authority immediately to verify authenticity.
                          </Alert>
                        )}

                        {tamperResult.status === 'clean' && (
                          <Alert variant="success" className="mt-3">
                            <i className="fas fa-check-circle me-2"></i>
                            <strong>Certificate Verified:</strong> No signs of tampering detected. 
                            This certificate appears to be authentic and unmodified.
                          </Alert>
                        )}
                      </Card.Body>
                    </Card>
                  )}
                </Col>
                <Col md={4}>
                  <Card className="bg-light">
                    <Card.Body>
                      <h6>🔍 Detection Methods</h6>
                      <div className="small">
                        <p><strong>Hash Verification:</strong> Compares file integrity hashes</p>
                        <p><strong>PDF Structure:</strong> Analyzes document structure for anomalies</p>
                        <p><strong>OCR Verification:</strong> Checks text consistency using AI</p>
                        <p><strong>Image Forensics:</strong> Detects digital image manipulation</p>
                        <p><strong>Template Comparison:</strong> Compares against original template</p>
                      </div>
                    </Card.Body>
                  </Card>

                  <Card className="bg-light mt-3">
                    <Card.Body>
                      <h6>⚡ Quick Check</h6>
                      <p className="small text-muted mb-3">
                        Click on any of your certificates below to quickly check for tampering:
                      </p>
                      {certificates.slice(0, 3).map(cert => (
                        <Button
                          key={cert.id}
                          size="sm"
                          variant="outline-warning"
                          className="w-100 mb-2"
                          onClick={() => {
                            setTamperCheckId(cert.certificate_id);
                            // Auto-submit the form
                            handleTamperCheck({ preventDefault: () => {} } as React.FormEvent);
                          }}
                        >
                          <i className="fas fa-shield-alt me-1"></i>
                          Check {cert.certificate_id.substring(0, 12)}...
                        </Button>
                      ))}
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Tab>

        <Tab eventKey="notifications" title="🔔 Notifications">
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">My Notifications</h5>
              <Badge bg="primary">{notifications.filter(n => !n.is_read).length} Unread</Badge>
            </Card.Header>
            <Card.Body>
              {notifications.length === 0 ? (
                <div className="text-center py-4">
                  <i className="fas fa-bell fa-3x text-muted mb-3"></i>
                  <p className="text-muted">No notifications</p>
                </div>
              ) : (
                notifications.map(notification => (
                  <Card key={notification.id} className={`mb-3 ${!notification.is_read ? 'border-primary' : ''}`}>
                    <Card.Body>
                      <div className="d-flex justify-content-between align-items-start">
                        <div className="flex-grow-1">
                          <h6 className="mb-2">
                            {!notification.is_read && <Badge bg="primary" className="me-2">NEW</Badge>}
                            {notification.title}
                          </h6>
                          <p className="mb-2">{notification.message}</p>
                          <small className="text-muted">
                            {new Date(notification.created_at).toLocaleString()}
                          </small>
                        </div>
                        {!notification.is_read && (
                          <Button
                            size="sm"
                            variant="outline-primary"
                            onClick={() => markNotificationRead(notification.id)}
                          >
                            Mark as Read
                          </Button>
                        )}
                      </div>
                    </Card.Body>
                  </Card>
                ))
              )}
            </Card.Body>
          </Card>
        </Tab>
      </Tabs>

      {/* Certificate View Modal */}
      <Modal show={showViewCertModal} onHide={() => setShowViewCertModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            <i className="fas fa-certificate me-2"></i>
            Certificate Details
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {certificateLoading ? (
            <div className="text-center p-4">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="mt-2">Loading certificate details...</p>
            </div>
          ) : selectedCertificate ? (
            <div>
              <Row>
                <Col md={6}>
                  <Card className="mb-3">
                    <Card.Header>
                      <h6 className="mb-0">
                        <i className="fas fa-id-card me-2"></i>
                        Certificate Information
                      </h6>
                    </Card.Header>
                    <Card.Body>
                      <div className="mb-2">
                        <strong>Certificate ID:</strong>
                        <br />
                        <code className="text-primary">{selectedCertificate.certificate_id}</code>
                      </div>
                      <div className="mb-2">
                        <strong>Recipient Name:</strong>
                        <br />
                        {selectedCertificate.recipient_name}
                      </div>
                      {selectedCertificate.recipient_email && selectedCertificate.recipient_email !== "Not provided" && (
                        <div className="mb-2">
                          <strong>Email:</strong>
                          <br />
                          <i className="fas fa-envelope me-1 text-muted"></i>
                          {selectedCertificate.recipient_email}
                        </div>
                      )}
                      {selectedCertificate.participant_id && (
                        <div className="mb-2">
                          <strong>Participant ID:</strong>
                          <br />
                          <i className="fas fa-id-card me-1 text-muted"></i>
                          <code>{selectedCertificate.participant_id}</code>
                        </div>
                      )}
                      <div className="mb-2">
                        <strong>Status:</strong>
                        <br />
                        <div className="d-flex align-items-center gap-2">
                          {getStatusBadge(selectedCertificate.status)}
                          {selectedCertificate.is_verified && (
                            <Badge bg="success">
                              <i className="fas fa-shield-alt me-1"></i>
                              Verified
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={6}>
                  <Card className="mb-3">
                    <Card.Header>
                      <h6 className="mb-0">
                        <i className="fas fa-calendar me-2"></i>
                        Event Information
                      </h6>
                    </Card.Header>
                    <Card.Body>
                      <div className="mb-2">
                        <strong>Event Name:</strong>
                        <br />
                        <i className="fas fa-calendar-alt me-1 text-primary"></i>
                        {selectedCertificate.event_name}
                      </div>
                      {selectedCertificate.event_description && (
                        <div className="mb-2">
                          <strong>Event Description:</strong>
                          <br />
                          <div className="text-muted small bg-light p-2 rounded">
                            {selectedCertificate.event_description}
                          </div>
                        </div>
                      )}
                      <div className="mb-2">
                        <strong>Event Date:</strong>
                        <br />
                        <i className="fas fa-calendar me-1 text-info"></i>
                        {formatDate(selectedCertificate.event_date)}
                      </div>
                      <div className="mb-2">
                        <strong>Issued Date:</strong>
                        <br />
                        <i className="fas fa-clock me-1 text-success"></i>
                        {formatDate(selectedCertificate.issued_date)}
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>

              {/* Security and Blockchain Information */}
              <Row>
                <Col md={12}>
                  <Card className="mb-3">
                    <Card.Header>
                      <h6 className="mb-0">
                        <i className="fas fa-shield-alt me-2"></i>
                        Security & Blockchain Information
                      </h6>
                    </Card.Header>
                    <Card.Body>
                      <Row>
                        <Col md={6}>
                          <div className="mb-2">
                            <strong>Digital Hash:</strong>
                            <br />
                            <code className="small text-info d-block">
                              {selectedCertificate.sha256_hash || "Not available"}
                            </code>
                            <small className="text-muted">
                              Used for tamper detection
                            </small>
                          </div>
                        </Col>
                        <Col md={6}>
                          <div className="mb-2">
                            <strong>Blockchain Status:</strong>
                            <br />
                            {selectedCertificate.blockchain_tx_hash && 
                             selectedCertificate.blockchain_tx_hash !== "Pending blockchain verification" ? (
                              <div>
                                <Badge bg="success" className="mb-1">
                                  <i className="fas fa-link me-1"></i>
                                  On Blockchain
                                </Badge>
                                <code className="small text-success d-block">
                                  {selectedCertificate.blockchain_tx_hash.length > 20 
                                    ? selectedCertificate.blockchain_tx_hash.substring(0, 20) + "..."
                                    : selectedCertificate.blockchain_tx_hash
                                  }
                                </code>
                              </div>
                            ) : (
                              <Badge bg="warning">
                                <i className="fas fa-clock me-1"></i>
                                {selectedCertificate.blockchain_tx_hash || "Pending verification"}
                              </Badge>
                            )}
                          </div>
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
              
              {/* Additional certificate details if available */}
              {certificateDetails && certificateDetails !== selectedCertificate && (
                <Card>
                  <Card.Header>
                    <h6 className="mb-0">
                      <i className="fas fa-info-circle me-2"></i>
                      Additional Details
                    </h6>
                  </Card.Header>
                  <Card.Body>
                    <pre className="bg-light p-2 rounded">
                      {JSON.stringify(certificateDetails, null, 2)}
                    </pre>
                  </Card.Body>
                </Card>
              )}
            </div>
          ) : (
            <div className="text-center p-4">
              <p className="text-muted">No certificate selected</p>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <div className="w-100 d-flex justify-content-between">
            <div>
              {selectedCertificate && (
                <>
                  <Button
                    variant="primary"
                    className="me-2"
                  >
                    <i className="fas fa-download me-1"></i>
                    Download PDF
                  </Button>
                  <Button
                    variant="outline-success"
                    className="me-2"
                    onClick={() => {
                      setValidateId(selectedCertificate.certificate_id);
                      setShowViewCertModal(false);
                      setActiveTab('validation');
                    }}
                  >
                    <i className="fas fa-check-circle me-1"></i>
                    Validate
                  </Button>
                  <Button
                    variant="outline-warning"
                    className="me-2"
                    onClick={() => {
                      setTamperCheckId(selectedCertificate.certificate_id);
                      setShowViewCertModal(false);
                      setActiveTab('tamper-detection');
                    }}
                  >
                    <i className="fas fa-shield-alt me-1"></i>
                    Check Tampering
                  </Button>
                </>
              )}
            </div>
            <Button variant="secondary" onClick={() => setShowViewCertModal(false)}>
              Close
            </Button>
          </div>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default UserDashboard;
