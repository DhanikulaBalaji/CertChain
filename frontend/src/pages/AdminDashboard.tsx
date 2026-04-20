import React, { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Container, Form, Modal, Row, Tab, Table, Tabs } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../services/AuthContext';
import { formatDate } from '../utils/dateUtils';
import { handleApiError } from '../utils/errorHandler';
import './AdminDashboard.css';

interface Event {
  id: number;
  name: string;
  description: string;
  date: string;
  is_approved: boolean;  // Use is_approved instead of status
  status?: string;       // Keep status for compatibility
  template_path?: string;
  created_at: string;
  admin_name?: string;   // Admin who created the event
  admin_id?: number;     // Admin ID
}

interface Certificate {
  id: number;
  certificate_id: string;
  recipient_name: string;
  recipient_email?: string;
  participant_id?: string;
  event_name: string;
  event_id?: number;
  status?: string;  // Make status optional
  issued_date: string;
  revoked_by?: string;       // Who revoked the certificate
  revocation_reason?: string; // Why it was revoked
  revoked_at?: string;       // When it was revoked
}

interface EventParticipant {
  id: number;
  participant_name: string;
  participant_email: string;
  registered_at: string;
}

const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [lastUpdated, setLastUpdated] = useState<string>('');
  
  // Blockchain status
  const [blockchainStatus, setBlockchainStatus] = useState<any>(null);
  const [blockchainLoading, setBlockchainLoading] = useState(false);
  
  // Blockchain verification
  const [verificationCertId, setVerificationCertId] = useState('');
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  
  // Event creation modal
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventForm, setEventForm] = useState({
    name: '',
    description: '',
    date: '',
    template_file: null as File | null
  });
  
  // Certificate generation
  const [showCertModal, setShowCertModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [certGenerationType, setCertGenerationType] = useState<'single' | 'bulk'>('bulk');
  const [singleCertForm, setSingleCertForm] = useState({
    recipient_name: '',
    participant_id: '',
    recipient_email: ''
  });

  // Event participants management
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [selectedEventForParticipants, setSelectedEventForParticipants] = useState<Event | null>(null);

  // Certificate view modal
  const [showViewCertModal, setShowViewCertModal] = useState(false);
  const [selectedCertificate, setSelectedCertificate] = useState<Certificate | null>(null);
  const [certificateDetails, setCertificateDetails] = useState<any>(null);
  const [certificateLoading, setCertificateLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        console.log('Fetching dashboard data at:', new Date().toLocaleTimeString());
        
        const [eventsRes, certsRes, statsRes] = await Promise.all([
          api.get('/events/my-events?include_rejected=true'),
          api.get('/certificates/admin-certificates'),
          api.get('/admin/dashboard-stats')
        ]);
        
        console.log('Events response:', eventsRes.data);
        console.log('Certificates response:', certsRes.data);
        console.log('Dashboard stats response:', statsRes.data);
        
        setEvents(eventsRes.data);
        setCertificates(certsRes.data);
        
        // Store dashboard stats for use in the component
        if (statsRes.data) {
          // You can store this in a state variable if needed for displaying stats
          console.log('Dashboard stats loaded:', statsRes.data);
        }
        
        setLastUpdated(new Date().toLocaleTimeString());
        console.log('Dashboard data updated at:', new Date().toLocaleTimeString());
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    fetchBlockchainStatus();
    
    // Removed aggressive auto-refresh - data will update on user actions
    // Manual refresh buttons are available for real-time updates
    
    // Optional: Uncomment for very long sessions (10 minutes)
    // const interval = setInterval(() => {
    //   fetchData();
    //   fetchBlockchainStatus();
    // }, 600000); // 10 minutes
    // return () => clearInterval(interval);
  }, []);

  const fetchBlockchainStatus = async () => {
    try {
      setBlockchainLoading(true);
      const response = await api.get('/blockchain/status');
      setBlockchainStatus(response.data);
    } catch (err) {
      console.warn('Blockchain status fetch failed:', err);
      setBlockchainStatus({
        success: false,
        data: { connected: false, enabled: false },
        message: 'Blockchain service unavailable'
      });
    } finally {
      setBlockchainLoading(false);
    }
  };

  const handleVerifyCertificate = async () => {
    if (!verificationCertId.trim()) {
      setError('Please enter a certificate ID');
      return;
    }

    try {
      setVerificationLoading(true);
      setError('');
      setSuccess('');
      
      const response = await api.post('/blockchain/verify', {
        certificate_id: verificationCertId
      });
      
      setVerificationResult(response.data);
      
      if (response.data.success) {
        setSuccess('Certificate verification completed');
      } else {
        setError(response.data.message || 'Verification failed');
      }
    } catch (err: any) {
      console.error('Verification error:', err);
      setError(handleApiError(err));
      setVerificationResult(null);
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleManualStore = async (certificateId: string) => {
    try {
      setError('');
      setSuccess('');
      
      const response = await api.post('/blockchain/store', {
        certificate_id: certificateId
      });
      
      if (response.data.success) {
        setSuccess(`Certificate ${certificateId} stored on blockchain`);
        // Refresh blockchain status
        fetchBlockchainStatus();
      } else {
        setError(response.data.message || 'Failed to store certificate');
      }
    } catch (err: any) {
      console.error('Store error:', err);
      setError(handleApiError(err));
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      console.log('Fetching dashboard data at:', new Date().toLocaleTimeString());
      
      const [eventsRes, certsRes, statsRes] = await Promise.all([
        api.get('/events/my-events?include_rejected=true'),
        api.get('/certificates/admin-certificates'),
        api.get('/admin/dashboard-stats')
      ]);
      
      console.log('Events response:', eventsRes.data);
      console.log('Certificates response:', certsRes.data);
      console.log('Dashboard stats response:', statsRes.data);
      
      setEvents(eventsRes.data);
      setCertificates(certsRes.data);
      setLastUpdated(new Date().toLocaleTimeString());
      console.log('Dashboard data updated at:', new Date().toLocaleTimeString());
      
      // Clear any previous errors if successful
      if (error) {
        setError('');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || 'Failed to load dashboard data';
      setError(errorMessage);
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('name', eventForm.name);
      formData.append('description', eventForm.description);
      formData.append('date', eventForm.date);
      
      if (eventForm.template_file) {
        formData.append('template_file', eventForm.template_file);
      }

      await api.post('/events', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setSuccess('Event created successfully! Awaiting Super Admin approval.');
      setShowEventModal(false);
      setEventForm({ name: '', description: '', date: '', template_file: null });
      fetchData();
    } catch (err: any) {
      setError(handleApiError(err));
    }
  };

  const handleDeleteEvent = async (eventId: number) => {
    if (!window.confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
      return;
    }

    try {
      setError('');
      const token = localStorage.getItem('token');
      await api.delete(`/events/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setSuccess('Event deleted successfully');
      fetchData(); // Refresh data
    } catch (err: any) {
      setError(handleApiError(err));
    }
  };

  const handleCertificateGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;

    if (certGenerationType === 'single' && !singleCertForm.recipient_name.trim()) {
      setError('Please enter recipient name');
      return;
    }

    if (certGenerationType === 'bulk' && !csvFile) {
      setError('Please select a recipients file');
      return;
    }

    setError('');
    setSuccess('');

    try {
      if (certGenerationType === 'single') {
        // Single certificate generation
        const response = await api.post('/certificates/generate-single', {
          event_id: selectedEvent.id,
          recipient_name: singleCertForm.recipient_name.trim(),
          participant_id: singleCertForm.participant_id.trim() || undefined,
          recipient_email: singleCertForm.recipient_email?.trim() || undefined
        });

        setSuccess('Certificate generated successfully!');
      } else {
        // Bulk certificate generation
        const formData = new FormData();
        formData.append('recipients_file', csvFile!);
        formData.append('event_id', selectedEvent.id.toString());

        console.log('Sending bulk certificate generation request:', {
          event_id: selectedEvent.id,
          filename: csvFile!.name,
          fileSize: csvFile!.size,
          fileType: csvFile!.type
        });

        const response = await api.post('/certificates/bulk-generate', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        console.log('Bulk certificate generation response:', response.data);
        setSuccess(`Certificates generated successfully! Generated: ${response.data.data?.generated_count || 'Unknown'} certificates`);
      }

      setShowCertModal(false);
      setCsvFile(null);
      setSelectedEvent(null);
      setSingleCertForm({ recipient_name: '', participant_id: '', recipient_email: '' });
      fetchData();
      fetchBlockchainStatus(); // Refresh blockchain status after certificate generation
    } catch (err: any) {
      setError(handleApiError(err));
    }
  };

  const getEventStatusBadge = (event: Event) => {
    // Debug log to help troubleshoot status issues
    console.log(`Event "${event.name}" status check:`, {
      is_approved: event.is_approved,
      status: event.status,
      id: event.id
    });
    
    // Check if event is approved
    if (event.is_approved && event.status === 'approved') {
      return <Badge bg="success">APPROVED</Badge>;
    } else if (event.status === 'rejected') {
      return <Badge bg="danger">REJECTED</Badge>;
    } else if (event.status === 'closed') {
      return <Badge bg="info">CLOSED</Badge>;
    } else {
      return <Badge bg="warning">PENDING</Badge>;
    }
  };

  const getCertificateStatusBadge = (status?: string, cert?: Certificate) => {
    // Handle undefined, null, or empty status for certificates
    if (!status) {
      return <Badge bg="secondary">UNKNOWN</Badge>;
    }
    
    const variants: { [key: string]: string } = {
      active: 'success',
      valid: 'success',
      revoked: 'danger',
      suspended: 'warning'
    };
    
    const statusLower = status.toLowerCase();
    const color = variants[statusLower] || 'secondary';
    
    if (status.toLowerCase() === 'revoked' && cert?.revoked_by) {
      return (
        <div>
          <Badge bg={color}>{status.toUpperCase()}</Badge>
          <div className="small text-muted mt-1">
            <strong>Revoked by:</strong> {cert.revoked_by}
            {cert.revocation_reason && (
              <div><strong>Reason:</strong> {cert.revocation_reason}</div>
            )}
            {cert.revoked_at && (
              <div><strong>Date:</strong> {formatDate(cert.revoked_at)}</div>
            )}
          </div>
        </div>
      );
    }
    
    return <Badge bg={color}>{status.toUpperCase()}</Badge>;
  };

  const handleViewParticipants = async (event: Event) => {
    try {
      setSelectedEventForParticipants(event);
      const response = await api.get(`/event-participants/event/${event.id}`);
      setParticipants(response.data);
      setShowParticipantsModal(true);
    } catch (err: any) {
      setError('Failed to load event participants');
    }
  };

  const handleRemoveParticipant = async (participantId: number) => {
    try {
      await api.delete(`/event-participants/${participantId}`);
      // Refresh participants list
      if (selectedEventForParticipants) {
        const response = await api.get(`/event-participants/event/${selectedEventForParticipants.id}`);
        setParticipants(response.data);
      }
      setSuccess('Participant removed successfully');
    } catch (err: any) {
      setError('Failed to remove participant');
    }
  };

  const handleDownloadCertificate = async (certificateId: string) => {
    try {
      setLoading(true);
      setError('');
      
      const response = await api.get(`/certificates/download/${certificateId}`, {
        responseType: 'blob',
        timeout: 30000 // 30 second timeout for downloads
      });
      
      // Create blob link to download
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
      console.error('Download error:', err);
      if (err.code === 'ECONNABORTED') {
        setError('Download timeout - please try again');
      } else if (err.response?.status === 404) {
        setError('Certificate file not found');
      } else if (err.response?.status === 403) {
        setError('You do not have permission to download this certificate');
      } else {
        setError('Failed to download certificate: ' + (err.response?.data?.detail || err.message || 'Unknown error'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReissueCertificate = async (certificateId: string) => {
    try {
      setError('');
      setSuccess('');
      
      if (window.confirm('Are you sure you want to re-issue this certificate? This will generate a new certificate with the same details and a new certificate ID.')) {
        console.log('Re-issuing certificate:', certificateId);
        
        const response = await api.post(`/certificates/${certificateId}/reissue`);
        console.log('Re-issue response:', response.data);
        
        setSuccess('Certificate re-issued successfully! The certificate now has a new ID.');
        
        // Refresh the data to show the updated certificate
        setTimeout(() => {
          fetchData();
        }, 1000);
      }
    } catch (err: any) {
      console.error('Re-issue error:', err);
      const errorMessage = err.response?.data?.detail || err.response?.data?.message || err.message || 'Unknown error occurred';
      setError(`Failed to re-issue certificate: ${errorMessage}`);
    }
  };

  const handleRevokeCertificate = async (certificateId: string) => {
    try {
      const reason = prompt('Please provide a reason for revoking this certificate:');
      if (reason && reason.trim()) {
        const formData = new FormData();
        formData.append('reason', reason.trim());
        await api.post(`/certificates/${certificateId}/revoke`, formData);
        setSuccess('Certificate revoked successfully');
        fetchData(); // Refresh data
      }
    } catch (err: any) {
      setError(`Failed to revoke certificate: ${err.response?.data?.detail || err.message}`);
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

  if (loading) {
    return (
      <div style={{ minHeight:'100vh', background:'var(--grad-bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center' }}>
          <span className="ds-spinner ds-spinner-lg" style={{ margin:'0 auto 14px' }} />
          <p style={{ color:'var(--c-text-3)', fontSize:'0.9rem' }}>Loading dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background:'var(--grad-bg)', minHeight:'100vh' }}>
    <Container fluid className="py-4 admin-dashboard">
      <Row className="mb-4">
        <Col>
          <div className="admin-hero d-flex justify-content-between align-items-center">
            <div>
              <h2><i className="fas fa-cogs me-2"></i>Admin Dashboard</h2>
              <p className="text-muted mb-0">Welcome back, {user?.full_name}!</p>
            </div>
            <div className="d-flex gap-2 align-items-center">
              <Button 
                variant="outline-secondary" 
                onClick={fetchData}
                disabled={loading}
              >
                <i className="fas fa-sync-alt me-2"></i>
                {loading ? 'Refreshing...' : 'Refresh'}
              </Button>
              {lastUpdated && (
                <small className="text-muted">
                  Last updated: {lastUpdated}
                </small>
              )}
              <Button 
                variant="primary" 
                onClick={() => setShowEventModal(true)}
                className="btn-lg"
              >
                <i className="fas fa-plus me-2"></i>
                Create New Event
              </Button>
            </div>
          </div>
        </Col>
      </Row>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          <i className="fas fa-exclamation-triangle me-2"></i>
          {error}
        </Alert>
      )}

      {success && (
        <Alert variant="success" dismissible onClose={() => setSuccess('')}>
          <i className="fas fa-check-circle me-2"></i>
          {success}
        </Alert>
      )}

      {/* Overview Cards */}
      <Row className="mb-4">
        <Col md={3}>
          <Card className="bg-primary text-white">
            <Card.Body>
              <div className="d-flex justify-content-between">
                <div>
                  <h4>{events.length}</h4>
                  <p className="mb-0">My Events</p>
                </div>
                <i className="fas fa-calendar fa-2x opacity-75"></i>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="bg-success text-white">
            <Card.Body>
              <div className="d-flex justify-content-between">
                <div>
                  <h4>{events.filter(e => e.is_approved).length}</h4>
                  <p className="mb-0">Approved Events</p>
                </div>
                <i className="fas fa-check-circle fa-2x opacity-75"></i>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="bg-info text-white">
            <Card.Body>
              <div className="d-flex justify-content-between">
                <div>
                  <h4>{certificates.length}</h4>
                  <p className="mb-0">Certificates Issued</p>
                </div>
                <i className="fas fa-certificate fa-2x opacity-75"></i>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className={`text-white ${
            blockchainStatus?.data?.connected ? 'bg-success' : 
            blockchainStatus?.data?.enabled ? 'bg-warning' : 'bg-secondary'
          }`}>
            <Card.Body>
              <div className="d-flex justify-content-between">
                <div>
                  <h4>
                    {blockchainLoading ? (
                      <span className="spinner-border spinner-border-sm"></span>
                    ) : (
                      <i className={`fas ${
                        blockchainStatus?.data?.connected ? 'fa-link' : 
                        blockchainStatus?.data?.enabled ? 'fa-unlink' : 'fa-times'
                      }`}></i>
                    )}
                  </h4>
                  <p className="mb-0">
                    {blockchainStatus?.data?.connected ? 'Blockchain Connected' : 
                     blockchainStatus?.data?.enabled ? 'Blockchain Enabled' : 'Blockchain Disabled'}
                  </p>
                </div>
                <i className="fas fa-chain fa-2x opacity-75"></i>
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
              <h5 className="mb-0">🚀 Quick Actions</h5>
            </Card.Header>
            <Card.Body>
              <div className="d-flex gap-3">
                <Button
                  variant="primary"
                  onClick={() => setShowEventModal(true)}
                >
                  <i className="fas fa-plus me-2"></i>
                  Create New Event
                </Button>
                <Button
                  variant="success"
                  onClick={() => setShowCertModal(true)}
                  disabled={events.filter(e => e.is_approved).length === 0}
                >
                  <i className="fas fa-certificate me-2"></i>
                  Generate Certificates
                </Button>
                <Button
                  variant="info"
                  onClick={() => setShowEventModal(true)}
                >
                  <i className="fas fa-upload me-2"></i>
                  Upload Template
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Tabs */}
      <Tabs activeKey={activeTab} onSelect={(k) => setActiveTab(k || 'overview')} className="mb-4">
        <Tab eventKey="overview" title={<><i className="fas fa-chart-pie me-1"></i> Overview</>}>
          <Row>
            <Col md={6}>
              <Card>
                <Card.Header>
                  <h5 className="mb-0">📅 Recent Events</h5>
                </Card.Header>
                <Card.Body>
                  {events.length === 0 ? (
                    <div className="text-center py-4">
                      <i className="fas fa-calendar-plus fa-3x text-muted mb-3"></i>
                      <p className="text-muted">No events created yet</p>
                      <Button variant="primary" onClick={() => setShowEventModal(true)}>
                        Create Your First Event
                      </Button>
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <Table hover size="sm">
                        <thead>
                          <tr>
                            <th>Event</th>
                            <th>Date</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {events.slice(0, 5).map(event => (
                            <tr key={event.id}>
                              <td>
                                <strong>{event.name}</strong><br />
                                <small className="text-muted">{event.description}</small>
                              </td>
                              <td>{new Date(event.date).toLocaleDateString()}</td>
                              <td>{getEventStatusBadge(event)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  )}
                </Card.Body>
              </Card>
            </Col>
            <Col md={6}>
              <Card>
                <Card.Header>
                  <h5 className="mb-0">📜 Recent Certificates</h5>
                </Card.Header>
                <Card.Body>
                  {certificates.length === 0 ? (
                    <div className="text-center py-4">
                      <i className="fas fa-certificate fa-3x text-muted mb-3"></i>
                      <p className="text-muted">No certificates generated yet</p>
                      <Button 
                        variant="success" 
                        onClick={() => setShowCertModal(true)}
                        disabled={events.filter(e => e.is_approved).length === 0}
                      >
                        Generate Certificates
                      </Button>
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <Table hover size="sm">
                        <thead>
                          <tr>
                            <th>Recipient</th>
                            <th>Event</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {certificates.slice(0, 5).map(cert => (
                            <tr key={cert.id}>
                              <td>{cert.recipient_name}</td>
                              <td>{cert.event_name}</td>
                              <td>{getCertificateStatusBadge(cert.status, cert)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Tab>

        <Tab eventKey="events" title={<><i className="fas fa-calendar-alt me-1"></i> My Events</>}>
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">My Events</h5>
              <Button variant="primary" onClick={() => setShowEventModal(true)}>
                <i className="fas fa-plus me-2"></i>Create Event
              </Button>
            </Card.Header>
            <Card.Body>
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
                    {events.map(event => (
                      <tr key={event.id}>
                        <td><strong>{event.name}</strong></td>
                        <td>
                          <span title={event.description}>
                            {event.description.length > 40 
                              ? `${event.description.substring(0, 40)}...` 
                              : event.description}
                          </span>
                        </td>
                        <td>
                          <span title={new Date(event.date).toLocaleString()}>
                            {new Date(event.date).toLocaleDateString()}
                          </span>
                        </td>
                        <td>
                          <strong>{event.admin_name || user?.full_name || 'Admin'}</strong>
                        </td>
                        <td>
                          <span title={new Date(event.created_at).toLocaleString()}>
                            {new Date(event.created_at).toLocaleDateString()}
                          </span>
                        </td>
                        <td>{getEventStatusBadge(event)}</td>
                        <td>
                          <div className="d-flex gap-2">
                            {event.is_approved && (
                              <>
                                <Button
                                  size="sm"
                                  variant="success"
                                  onClick={() => {
                                    setSelectedEvent(event);
                                    setShowCertModal(true);
                                  }}
                                >
                                  Generate Certificates
                                </Button>
                                <Button
                                  size="sm"
                                  variant="info"
                                  onClick={() => handleViewParticipants(event)}
                                  title="View Participants"
                                >
                                  <i className="fas fa-users me-1"></i>
                                  Participants
                                </Button>
                              </>
                            )}
                            {!event.is_approved && event.status === 'pending' && (
                              <Badge bg="warning">Awaiting Approval</Badge>
                            )}
                            {(event.status === 'pending' || event.status === 'rejected') && (
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => handleDeleteEvent(event.id)}
                                title="Delete Event"
                              >
                                🗑️ Delete
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card.Body>
          </Card>
        </Tab>

        <Tab eventKey="certificates" title={<><i className="fas fa-certificate me-1"></i> Certificates</>}>
          <Card>
            <Card.Header>
              <h5 className="mb-0">Generated Certificates</h5>
            </Card.Header>
            <Card.Body>
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
                        <td><code className="text-primary">{cert.certificate_id}</code></td>
                        <td>
                          <span className="badge bg-secondary">
                            {cert.participant_id || `PART-${cert.id.toString().padStart(4, '0')}`}
                          </span>
                        </td>
                        <td>
                          <div>
                            <strong>{cert.recipient_name}</strong><br/>
                            <small className="text-muted">Participant: {cert.participant_id || `PART-${cert.id.toString().padStart(4, '0')}`}</small>
                          </div>
                        </td>
                        <td>
                          <strong>{cert.event_name}</strong><br/>
                          <small className="text-muted">Event Details</small>
                        </td>
                        <td>{getCertificateStatusBadge(cert.status, cert)}</td>
                        <td>{formatDate(cert.issued_date)}</td>
                        <td>
                          <div className="btn-group" role="group">
                            <Button 
                              size="sm" 
                              variant="outline-info" 
                              className="me-1"
                              onClick={() => handleViewCertificate(cert)}
                            >
                              View
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline-primary" 
                              className="me-1"
                              onClick={() => handleDownloadCertificate(cert.certificate_id)}
                            >
                              Download
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline-warning" 
                              className="me-1"
                              onClick={() => handleReissueCertificate(cert.certificate_id)}
                              disabled={cert.status === 'revoked'}
                            >
                              Re-issue
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline-danger"
                              onClick={() => handleRevokeCertificate(cert.certificate_id)}
                              disabled={cert.status === 'revoked'}
                            >
                              Revoke
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card.Body>
          </Card>
        </Tab>

        {/* Blockchain Tab */}
        <Tab eventKey="blockchain" title={<><i className="fas fa-link me-1"></i> Blockchain</>}>
          <Card className="mt-3">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">🔗 Blockchain Management</h5>
              <Button 
                variant="outline-primary" 
                size="sm"
                onClick={fetchBlockchainStatus}
                disabled={blockchainLoading}
              >
                {blockchainLoading ? '⏳ Refreshing...' : '🔄 Refresh Status'}
              </Button>
            </Card.Header>
            <Card.Body>
              {/* Blockchain Status Section */}
              <Row className="mb-4">
                <Col>
                  <h6>📊 System Status</h6>
                  {blockchainLoading ? (
                    <div className="text-center p-3">
                      <div className="spinner-border" role="status">
                        <span className="visually-hidden">Loading...</span>
                      </div>
                    </div>
                  ) : blockchainStatus ? (
                    <div className="p-3 bg-light rounded">
                      <Row>
                        <Col md={6}>
                          <strong>Connection Status:</strong>{' '}
                          <Badge 
                            bg={blockchainStatus.data?.connected ? 'success' : 'danger'}
                            className="ms-2"
                          >
                            {blockchainStatus.data?.connected ? '🟢 Connected' : '🔴 Disconnected'}
                          </Badge>
                        </Col>
                        <Col md={6}>
                          <strong>Service:</strong>{' '}
                          <Badge 
                            bg={blockchainStatus.data?.enabled ? 'success' : 'warning'}
                            className="ms-2"
                          >
                            {blockchainStatus.data?.enabled ? '✅ Enabled' : '⚠️ Disabled'}
                          </Badge>
                        </Col>
                      </Row>
                      {blockchainStatus.data?.network && (
                        <Row className="mt-2">
                          <Col md={6}>
                            <strong>Network:</strong> {blockchainStatus.data.network}
                          </Col>
                          <Col md={6}>
                            <strong>Block Number:</strong> {blockchainStatus.data.latest_block || 'Not available'}
                          </Col>
                        </Row>
                      )}
                      {blockchainStatus.data?.contract_address && (
                        <Row className="mt-2">
                          <Col>
                            <strong>Contract:</strong>{' '}
                            <code className="small">{blockchainStatus.data.contract_address}</code>
                          </Col>
                        </Row>
                      )}
                      {blockchainStatus.data?.statistics && (
                        <Row className="mt-2">
                          <Col md={4}>
                            <strong>Stored Certificates:</strong> {blockchainStatus.data.statistics.stored_certificates || 0}
                          </Col>
                          <Col md={4}>
                            <strong>Total Transactions:</strong> {blockchainStatus.data.statistics.total_transactions || 0}
                          </Col>
                          <Col md={4}>
                            <strong>Gas Used:</strong> {blockchainStatus.data.statistics.total_gas_used || 0}
                          </Col>
                        </Row>
                      )}
                      <Row className="mt-2">
                        <Col>
                          <small className="text-muted">
                            📝 {blockchainStatus.message}
                          </small>
                        </Col>
                      </Row>
                    </div>
                  ) : (
                    <Alert variant="warning">
                      ⚠️ No blockchain status available. Click refresh to check connection.
                    </Alert>
                  )}
                </Col>
              </Row>

              {/* Certificate Verification Section */}
              <Row className="mb-4">
                <Col>
                  <h6>🔍 Certificate Verification</h6>
                  <Card className="p-3">
                    <Form onSubmit={(e) => { e.preventDefault(); handleVerifyCertificate(); }}>
                      <Row>
                        <Col md={8}>
                          <Form.Group>
                            <Form.Label>Certificate ID</Form.Label>
                            <Form.Control
                              type="text"
                              placeholder="Enter certificate ID (e.g., CERT-ABC123)"
                              value={verificationCertId}
                              onChange={(e) => setVerificationCertId(e.target.value)}
                              disabled={verificationLoading}
                            />
                          </Form.Group>
                        </Col>
                        <Col md={4} className="d-flex align-items-end">
                          <Button 
                            type="submit"
                            variant="primary"
                            disabled={verificationLoading || !verificationCertId.trim()}
                            className="w-100"
                          >
                            {verificationLoading ? '⏳ Verifying...' : '🔍 Verify'}
                          </Button>
                        </Col>
                      </Row>
                    </Form>

                    {/* Verification Results */}
                    {verificationResult && (
                      <div className="mt-3 p-3 border rounded">
                        <h6>🔍 Verification Results</h6>
                        <Row>
                          <Col md={6}>
                            <strong>Certificate ID:</strong> {verificationResult.certificate_id}
                          </Col>
                          <Col md={6}>
                            <strong>Status:</strong>{' '}
                            <Badge bg={verificationResult.is_valid ? 'success' : 'danger'}>
                              {verificationResult.is_valid ? '✅ Valid' : '❌ Invalid'}
                            </Badge>
                          </Col>
                        </Row>
                        {verificationResult.blockchain_data && (
                          <>
                            <Row className="mt-2">
                              <Col md={6}>
                                <strong>On Blockchain:</strong>{' '}
                                <Badge bg={verificationResult.blockchain_data.exists ? 'success' : 'warning'}>
                                  {verificationResult.blockchain_data.exists ? '✅ Yes' : '⚠️ No'}
                                </Badge>
                              </Col>
                              <Col md={6}>
                                <strong>Hash Match:</strong>{' '}
                                <Badge bg={verificationResult.blockchain_data.hash_matches ? 'success' : 'danger'}>
                                  {verificationResult.blockchain_data.hash_matches ? '✅ Match' : '❌ Mismatch'}
                                </Badge>
                              </Col>
                            </Row>
                            {verificationResult.blockchain_data.transaction_hash && (
                              <Row className="mt-2">
                                <Col>
                                  <strong>Transaction:</strong>{' '}
                                  <code className="small">{verificationResult.blockchain_data.transaction_hash}</code>
                                </Col>
                              </Row>
                            )}
                          </>
                        )}
                        <Row className="mt-2">
                          <Col>
                            <small className="text-muted">
                              📝 {verificationResult.message}
                            </small>
                          </Col>
                        </Row>
                      </div>
                    )}
                  </Card>
                </Col>
              </Row>

              {/* Certificate Management Section */}
              <Row>
                <Col>
                  <h6>⚙️ Certificate Management</h6>
                  <div className="table-responsive">
                    <Table striped bordered hover size="sm">
                      <thead>
                        <tr>
                          <th>Certificate ID</th>
                          <th>Recipient</th>
                          <th>Event</th>
                          <th>Issued Date</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {certificates.map((cert) => (
                          <tr key={cert.id}>
                            <td>
                              <code className="small">{cert.certificate_id}</code>
                            </td>
                            <td>{cert.recipient_name}</td>
                            <td>{cert.event_name}</td>
                            <td>{formatDate(cert.issued_date)}</td>
                            <td>
                              <Button
                                size="sm"
                                variant="outline-primary"
                                onClick={() => handleManualStore(cert.certificate_id)}
                                title="Store on Blockchain"
                                className="me-2"
                              >
                                ⛓️ Store
                              </Button>
                              <Button
                                size="sm"
                                variant="outline-info"
                                onClick={() => {
                                  setVerificationCertId(cert.certificate_id);
                                  handleVerifyCertificate();
                                }}
                                title="Verify Certificate"
                              >
                                🔍 Verify
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {certificates.length === 0 && (
                          <tr>
                            <td colSpan={5} className="text-center text-muted">
                              📝 No certificates available
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                  </div>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Tab>
      </Tabs>

      {/* Create Event Modal */}
      <Modal show={showEventModal} onHide={() => setShowEventModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>📅 Create New Event</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleEventSubmit}>
          <Modal.Body>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Event Name *</Form.Label>
                  <Form.Control
                    type="text"
                    value={eventForm.name}
                    onChange={(e) => setEventForm({...eventForm, name: e.target.value})}
                    placeholder="Enter event name"
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Event Date *</Form.Label>
                  <Form.Control
                    type="date"
                    value={eventForm.date}
                    onChange={(e) => setEventForm({...eventForm, date: e.target.value})}
                    required
                  />
                </Form.Group>
              </Col>
            </Row>
            
            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={eventForm.description}
                onChange={(e) => setEventForm({...eventForm, description: e.target.value})}
                placeholder="Enter event description"
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Certificate Template (Optional)</Form.Label>
              <Form.Control
                type="file"
                accept=".png,.jpg,.jpeg"
                onChange={(e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  setEventForm({...eventForm, template_file: file || null});
                }}
              />
              <Form.Text className="text-muted">
                Upload a PNG or JPG template. Use placeholders: {`{{name}}, {{event}}, {{date}}, {{certificate_id}}`}
              </Form.Text>
            </Form.Group>

            <Alert variant="info">
              <i className="fas fa-info-circle me-2"></i>
              Your event will be submitted for Super Admin approval before certificates can be generated.
            </Alert>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowEventModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Create Event
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Certificate Generation Modal */}
      <Modal show={showCertModal} onHide={() => setShowCertModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>📜 Generate Certificates</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleCertificateGeneration}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Select Event *</Form.Label>
              <Form.Select
                value={selectedEvent?.id || ''}
                onChange={(e) => {
                  const event = events.find(ev => ev.id === parseInt(e.target.value));
                  setSelectedEvent(event || null);
                }}
                required
              >
                <option value="">Choose an approved event...</option>
                {events.filter(e => e.is_approved).map(event => (
                  <option key={event.id} value={event.id}>
                    {event.name} - {new Date(event.date).toLocaleDateString()}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Generation Type *</Form.Label>
              <div className="d-flex gap-3">
                <Form.Check
                  type="radio"
                  id="single-cert"
                  name="certType"
                  label="📄 Single Certificate"
                  checked={certGenerationType === 'single'}
                  onChange={() => setCertGenerationType('single')}
                />
                <Form.Check
                  type="radio"
                  id="bulk-cert"
                  name="certType"
                  label="📊 Bulk Certificates"
                  checked={certGenerationType === 'bulk'}
                  onChange={() => setCertGenerationType('bulk')}
                />
              </div>
            </Form.Group>

            {certGenerationType === 'single' ? (
              <>
                <Form.Group className="mb-3">
                  <Form.Label>Recipient Name *</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="Enter recipient's full name"
                    value={singleCertForm.recipient_name}
                    onChange={(e) => setSingleCertForm({
                      ...singleCertForm,
                      recipient_name: e.target.value
                    })}
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Participant ID (Optional)</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="Enter participant ID (auto-generated if empty)"
                    value={singleCertForm.participant_id}
                    onChange={(e) => setSingleCertForm({
                      ...singleCertForm,
                      participant_id: e.target.value
                    })}
                  />
                  <Form.Text className="text-muted">
                    Optional identifier (student ID, employee number, etc.). If left empty, a random ID will be generated.
                  </Form.Text>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Recipient Email (Optional – for wallet &amp; DID)</Form.Label>
                  <Form.Control
                    type="email"
                    placeholder="recipient@example.com"
                    value={singleCertForm.recipient_email || ''}
                    onChange={(e) => setSingleCertForm({
                      ...singleCertForm,
                      recipient_email: e.target.value
                    })}
                  />
                  <Form.Text className="text-muted">
                    Use the recipient&apos;s registered email so the certificate appears in their wallet and supports DID verification.
                  </Form.Text>
                </Form.Group>
              </>
            ) : (
              <Form.Group className="mb-3">
                <Form.Label>Recipients File *</Form.Label>
                <div className="d-flex mb-2">
                  <Button
                    variant="outline-info"
                    size="sm"
                    onClick={() => window.open('/api/v1/certificates/download-template', '_blank')}
                    className="me-2"
                  >
                    📥 Download Template
                  </Button>
                  <small className="text-muted align-self-center">
                    Download sample Excel/CSV template with proper format
                  </small>
                </div>
                <Form.Control
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    setCsvFile(file || null);
                  }}
                  required
                />
                <Form.Text className="text-muted">
                  <div className="mt-2">
                    <strong>📋 Accepted formats:</strong> CSV (.csv), Excel (.xlsx, .xls)<br />
                    <strong>📝 Required columns:</strong> recipient_name<br />
                    <strong>📊 Optional columns:</strong> participant_id, email<br />
                    <strong>💡 Example format:</strong>
                    <div className="mt-2 p-2 bg-light rounded small">
                      <code>
                        recipient_name,participant_id,email<br />
                        John Doe,PART-1001,john@example.com<br />
                        Jane Smith,,jane@example.com<br />
                        Mike Johnson,STU-2023,mike@example.com
                      </code>
                    </div>
                    <small className="text-success">
                      💡 <strong>Tip:</strong> Leave participant_id empty for auto-generation (PART-XXXX)
                    </small>
                  </div>
                </Form.Text>
              </Form.Group>
            )}

            {selectedEvent && (
              <Alert variant="success">
                <strong>Selected Event:</strong> {selectedEvent.name}<br />
                <strong>Date:</strong> {new Date(selectedEvent.date).toLocaleDateString()}<br />
                <strong>Type:</strong> {certGenerationType === 'single' ? '📄 Single Certificate' : '📊 Bulk Generation'}
              </Alert>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => {
              setShowCertModal(false);
              setCertGenerationType('bulk');
              setSingleCertForm({ recipient_name: '', participant_id: '', recipient_email: '' });
            }}>
              Cancel
            </Button>
            <Button 
              variant="success" 
              type="submit" 
              disabled={
                !selectedEvent || 
                (certGenerationType === 'single' && !singleCertForm.recipient_name.trim()) ||
                (certGenerationType === 'bulk' && !csvFile)
              }
            >
              <i className="fas fa-certificate me-2"></i>
              Generate {certGenerationType === 'single' ? 'Certificate' : 'Certificates'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Event Participants Modal */}
      <Modal show={showParticipantsModal} onHide={() => setShowParticipantsModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>👥 Event Participants - {selectedEventForParticipants?.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {participants.length === 0 ? (
            <div className="text-center py-4">
              <i className="fas fa-users fa-3x text-muted mb-3"></i>
              <p className="text-muted">No participants registered for this event yet</p>
            </div>
          ) : (
            <div className="table-responsive">
              <Table hover>
                <thead>
                  <tr>
                    <th>Participant Name</th>
                    <th>Email</th>
                    <th>Registered Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map(participant => (
                    <tr key={participant.id}>
                      <td><strong>{participant.participant_name}</strong></td>
                      <td>{participant.participant_email}</td>
                      <td>{new Date(participant.registered_at).toLocaleDateString()}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="outline-danger"
                          onClick={() => handleRemoveParticipant(participant.id)}
                          title="Remove Participant"
                        >
                          <i className="fas fa-user-minus me-1"></i>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <div className="w-100 d-flex justify-content-between align-items-center">
            <Badge bg="info">
              Total Participants: {participants.length}
            </Badge>
            <Button variant="secondary" onClick={() => setShowParticipantsModal(false)}>
              Close
            </Button>
          </div>
        </Modal.Footer>
      </Modal>

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
                      <div className="mb-2">
                        <strong>Participant ID:</strong>
                        <br />
                        {selectedCertificate.participant_id || 'ID not assigned'}
                      </div>
                      <div className="mb-2">
                        <strong>Status:</strong>
                        <br />
                        <Badge bg={selectedCertificate.status === 'active' ? 'success' : 'danger'}>
                          {selectedCertificate.status || 'Active'}
                        </Badge>
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
                        {selectedCertificate.event_name}
                      </div>
                      <div className="mb-2">
                        <strong>Issued Date:</strong>
                        <br />
                        {formatDate(selectedCertificate.issued_date)}
                      </div>
                      {selectedCertificate.status === 'revoked' && (
                        <>
                          <div className="mb-2">
                            <strong>Revoked By:</strong>
                            <br />
                            {selectedCertificate.revoked_by || 'Not revoked'}
                          </div>
                          <div className="mb-2">
                            <strong>Revocation Date:</strong>
                            <br />
                            {selectedCertificate.revoked_at ? formatDate(selectedCertificate.revoked_at) : 'Not revoked'}
                          </div>
                          <div className="mb-2">
                            <strong>Revocation Reason:</strong>
                            <br />
                            <span className="text-muted">
                              {selectedCertificate.revocation_reason || 'No reason provided'}
                            </span>
                          </div>
                        </>
                      )}
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
                    onClick={() => handleDownloadCertificate(selectedCertificate.certificate_id)}
                  >
                    <i className="fas fa-download me-1"></i>
                    Download PDF
                  </Button>
                  {selectedCertificate.status !== 'revoked' && (
                    <>
                      <Button
                        variant="warning"
                        className="me-2"
                        onClick={() => {
                          setShowViewCertModal(false);
                          handleReissueCertificate(selectedCertificate.certificate_id);
                        }}
                      >
                        <i className="fas fa-redo me-1"></i>
                        Re-issue
                      </Button>
                      <Button
                        variant="danger"
                        className="me-2"
                        onClick={() => {
                          setShowViewCertModal(false);
                          handleRevokeCertificate(selectedCertificate.certificate_id);
                        }}
                      >
                        <i className="fas fa-ban me-1"></i>
                        Revoke
                      </Button>
                    </>
                  )}
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
    </div>
  );
};

export default AdminDashboard;
