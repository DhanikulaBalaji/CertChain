import React, { useState, useEffect, useCallback } from 'react';
import { Container, Row, Col, Card, Button, Table, Badge, Alert, Tab, Tabs, Form, Modal } from 'react-bootstrap';
import { useAuth } from '../services/AuthContext';
import api, { eventsAPI } from '../services/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrashAlt, faLock, faUsers } from '@fortawesome/free-solid-svg-icons';
import EventParticipantModal from '../components/EventParticipantModal';
import CertificateTemplateGenerator from '../components/CertificateTemplateGenerator';
import { formatDate } from '../utils/dateUtils';
import { handleApiError } from '../utils/errorHandler';

interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  is_approved: boolean;
  created_at: string;
}

interface Event {
  id: number;
  name: string;
  description: string;
  date: string;
  is_approved: boolean;
  status: string;
  admin_id: number;
  created_at: string;
}

interface Certificate {
  id: number;
  certificate_id: string;
  recipient_name: string;
  recipient_email?: string;
  recipient_phone?: string;
  event?: {
    name: string;
  };
  status: string;
  issued_at: string;
  participant_id?: string;
}

interface ActivityLog {
  id: number;
  user_id: number;
  user_info?: {
    username: string;
    email: string;
    role: string;
  };
  action: string;
  resource_type?: string;
  resource_id?: string;
  details?: any;
  ip_address?: string;
  timestamp: string;
}

interface TamperLog {
  id: number;
  certificate_id: number;
  tamper_type: string;
  detected_at: string;
  details?: string;
  severity: string;
}

interface NotificationHistory {
  id: number;
  user_id?: number;
  title: string;
  message: string;
  notification_type: string;
  is_read: boolean;
  created_at: string;
}

const SuperAdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [tamperLogs, setTamperLogs] = useState<TamperLog[]>([]);
  const [notificationHistory, setNotificationHistory] = useState<NotificationHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  
  // Search states
  const [userSearch, setUserSearch] = useState('');
  const [eventSearch, setEventSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [eventApprovalFilter, setEventApprovalFilter] = useState('');

  // Event participant modal states
  const [showParticipantModal, setShowParticipantModal] = useState(false);
  const [selectedEventForParticipants, setSelectedEventForParticipants] = useState<Event | null>(null);

  // Certificate generation states
  const [showCertModal, setShowCertModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [certGenerationType, setCertGenerationType] = useState<'single' | 'bulk'>('bulk');
  const [singleCertForm, setSingleCertForm] = useState({
    recipient_name: '',
    participant_id: '',
    recipient_email: '',
    recipient_phone: ''
  });

  // Certificate update modal states
  const [showCertUpdateModal, setShowCertUpdateModal] = useState(false);
  const [selectedCertificate, setSelectedCertificate] = useState<Certificate | null>(null);
  const [certUpdateForm, setCertUpdateForm] = useState({
    recipient_name: '',
    recipient_email: '',
    recipient_phone: '',
    status: 'valid'
  });

  useEffect(() => {
    fetchDashboardData();
    
    // Removed aggressive auto-refresh - data will update on user actions
    // Manual refresh buttons are available for real-time updates
    
    // Optional: Uncomment for very long sessions (10 minutes)
    // const interval = setInterval(() => {
    //   fetchDashboardData();
    // }, 600000); // 10 minutes
    // return () => clearInterval(interval);
  }, [userSearch, eventSearch, userRoleFilter, eventApprovalFilter]);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Build query parameters for users
      const userParams = new URLSearchParams();
      if (userSearch) userParams.append('search', userSearch);
      if (userRoleFilter) userParams.append('role', userRoleFilter);
      
      // Build query parameters for events
      const eventParams = new URLSearchParams();
      if (eventSearch) eventParams.append('search', eventSearch);
      if (eventApprovalFilter) eventParams.append('is_approved', eventApprovalFilter);
      
      const [usersRes, eventsRes, certsRes, statsRes] = await Promise.all([
        api.get(`/admin/users?${userParams.toString()}`),
        api.get(`/admin/events?${eventParams.toString()}`),
        api.get('/certificates'),
        api.get('/admin/super-admin/dashboard-stats')
      ]);
      
      console.log('Super Admin Dashboard Stats:', statsRes.data);
      
      setUsers(usersRes.data);
      setEvents(eventsRes.data);
      setCertificates(certsRes.data);
    } catch (err: any) {
      setError('Failed to load dashboard data');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  }, [userSearch, eventSearch, userRoleFilter, eventApprovalFilter]);

  const fetchActivityLogs = async () => {
    try {
      const response = await api.get('/admin/activity-logs?limit=100&days=30');
      setActivityLogs(response.data);
    } catch (err: any) {
      console.error('Failed to load activity logs:', err);
      setActivityLogs([]);
    }
  };

  const fetchTamperLogs = async () => {
    try {
      const response = await api.get('/admin/tamper-logs?limit=100&days=30');
      setTamperLogs(response.data);
    } catch (err: any) {
      console.error('Failed to load tamper logs:', err);
      setTamperLogs([]);
    }
  };

  const fetchNotificationHistory = async () => {
    try {
      const response = await api.get('/admin/notification-history?limit=100&days=30');
      setNotificationHistory(response.data);
    } catch (err: any) {
      console.error('Failed to load notification history:', err);
      setNotificationHistory([]);
    }
  };

  const handleTabSelect = (tab: string | null) => {
    if (tab) {
      setActiveTab(tab);
      
      // Load data for specific tabs when they're selected
      if (tab === 'activity-logs' && activityLogs.length === 0) {
        fetchActivityLogs();
      } else if (tab === 'tamper-logs' && tamperLogs.length === 0) {
        fetchTamperLogs();
      } else if (tab === 'notifications' && notificationHistory.length === 0) {
        fetchNotificationHistory();
      }
    }
  };

  const handleUserAction = async (userId: number, action: string) => {
    try {
      switch (action) {
        case 'approve':
          await api.post(`/admin/users/${userId}/approve`);
          break;
        case 'promote':
          await api.post(`/admin/users/${userId}/promote`);
          break;
        case 'demote':
          await api.post(`/admin/users/${userId}/demote`);
          break;
        case 'deactivate':
          await api.post(`/admin/users/${userId}/deactivate`);
          break;
        case 'delete':
          if (window.confirm('Are you sure you want to delete this user?')) {
            await api.delete(`/admin/users/${userId}`);
          } else {
            return; // User cancelled deletion
          }
          break;
      }
      fetchDashboardData(); // Refresh data
    } catch (err: any) {
      setError(`Failed to ${action} user`);
    }
  };

  const handleEventAction = async (eventId: number, action: string) => {
    try {
      if (action === 'approve') {
        await api.put(`/events/${eventId}/approve`); // Changed from POST to PUT and correct endpoint
      } else if (action === 'reject') {
        const reason = prompt('Please provide a reason for rejection:') || 'No reason provided';
        await api.post(`/admin/events/${eventId}/reject`, { reason });
      } else if (action === 'close') {
        if (window.confirm('Are you sure you want to close this event? Users will be able to view and download their certificates.')) {
          await api.post(`/events/${eventId}/close`);
        } else {
          return; // User cancelled closure
        }
      } else if (action === 'revoke') {
        if (window.confirm('Are you sure you want to revoke this event? All associated certificates will also be revoked.')) {
          await api.post(`/events/${eventId}/revoke`);
        } else {
          return; // User cancelled revocation
        }
      } else if (action === 'delete') {
        const confirmDelete = window.confirm(
          'Are you sure you want to delete this event? This action cannot be undone. If the event has certificates, they will be revoked.'
        );
        if (confirmDelete) {
          // Force delete past events with certificates
          await eventsAPI.deleteEvent(eventId, true, false);
        } else {
          return; // User cancelled deletion
        }
      } else if (action === 'delete-permanent') {
        const confirmPermanentDelete = window.confirm(
          '⚠️ PERMANENT DELETION WARNING ⚠️\n\n' +
          'This will PERMANENTLY DELETE the event and ALL associated certificates and files.\n' +
          'This action is IRREVERSIBLE and cannot be undone.\n\n' +
          'Are you absolutely sure you want to proceed?'
        );
        if (confirmPermanentDelete) {
          const doubleConfirm = window.confirm(
            'FINAL CONFIRMATION:\n\n' +
            'This will permanently erase all data for this event.\n' +
            'Type YES in the next dialog to confirm.'
          );
          if (doubleConfirm) {
            const finalConfirm = prompt('Type "DELETE FOREVER" to confirm permanent deletion:');
            if (finalConfirm === 'DELETE FOREVER') {
              await eventsAPI.deleteEventPermanent(eventId);
            } else {
              alert('Permanent deletion cancelled - incorrect confirmation text.');
              return;
            }
          } else {
            return; // User cancelled permanent deletion
          }
        } else {
          return; // User cancelled permanent deletion
        }
      }
      fetchDashboardData(); // Refresh data
    } catch (err: any) {
      console.error(`Failed to ${action} event:`, err);
      setError(`Failed to ${action} event: ${handleApiError(err)}`);
    }
  };

  const handleCertificateRevoke = async (certificateId: number) => {
    try {
      if (window.confirm('Are you sure you want to revoke this certificate?')) {
        await api.post(`/certificates/${certificateId}/revoke`);
        fetchDashboardData(); // Refresh data
      }
    } catch (err: any) {
      console.error('Failed to revoke certificate:', err);
      setError(`Failed to revoke certificate: ${handleApiError(err)}`);
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
    
    try {
      setError('');
      setSuccess('');
      
      if (certGenerationType === 'single') {
        // Single certificate generation
        const response = await api.post('/certificates/generate-single', {
          event_id: selectedEvent.id,
          recipient_name: singleCertForm.recipient_name.trim(),
          participant_id: singleCertForm.participant_id.trim() || undefined
        });

        setSuccess('Certificate generated successfully! 🎉');
      } else {
        // Bulk certificate generation
        const formData = new FormData();
        formData.append('event_id', selectedEvent.id.toString());
        formData.append('recipients_file', csvFile!);
        
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
        setSuccess(`Certificates generated successfully! Generated: ${response.data.data?.generated_count || 'Unknown'} certificates 🎉`);
      }
      
      console.log('Certificate generation completed successfully');
      setShowCertModal(false);
      setSelectedEvent(null);
      setCsvFile(null);
      setSingleCertForm({ 
        recipient_name: '', 
        participant_id: '',
        recipient_email: '',
        recipient_phone: ''
      });
      fetchDashboardData();
    } catch (err: any) {
      console.error('Certificate generation error:', err);
      setError(handleApiError(err));
    }
  };

  const handleCertificateUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCertificate) return;

    try {
      setError('');
      setSuccess('');
      
      const response = await api.put(`/certificates/${selectedCertificate.id}`, {
        recipient_name: certUpdateForm.recipient_name.trim(),
        recipient_email: certUpdateForm.recipient_email.trim(),
        recipient_phone: certUpdateForm.recipient_phone.trim(),
        status: certUpdateForm.status
      });

      setSuccess('Certificate updated successfully! 🎉');
      setShowCertUpdateModal(false);
      setSelectedCertificate(null);
      setCertUpdateForm({ recipient_name: '', recipient_email: '', recipient_phone: '', status: 'valid' });
      fetchDashboardData();
    } catch (err: any) {
      console.error('Certificate update error:', err);
      setError(handleApiError(err));
    }
  };

  const handleCertificateReissue = async (certificateId: number) => {
    try {
      if (window.confirm('Are you sure you want to re-issue this certificate? This will generate a new certificate ID.')) {
        setError('');
        setSuccess('');
        
        const response = await api.post(`/certificates/${certificateId}/reissue`);
        setSuccess(`Certificate re-issued successfully! New ID: ${response.data.certificate_id} 🎉`);
        fetchDashboardData();
      }
    } catch (err: any) {
      console.error('Failed to re-issue certificate:', err);
      setError(`Failed to re-issue certificate: ${handleApiError(err)}`);
    }
  };

  const openCertificateUpdateModal = (certificate: Certificate) => {
    setSelectedCertificate(certificate);
    setCertUpdateForm({
      recipient_name: certificate.recipient_name || '',
      recipient_email: certificate.recipient_email || '',
      recipient_phone: certificate.recipient_phone || '',
      status: certificate.status || 'valid'
    });
    setShowCertUpdateModal(true);
  };

  const handleSearch = () => {
    // Filters are automatically applied through useEffect
  };

  const clearSearch = () => {
    setUserSearch('');
    setEventSearch('');
    setUserRoleFilter('');
    setEventApprovalFilter('');
    // Data will be refreshed automatically through useEffect
  };

  const clearAllNotifications = async () => {
    try {
      await api.post('/admin/notifications/clear-all');
      fetchDashboardData(); // Refresh data
      setError(''); // Clear any errors
    } catch (err: any) {
      setError('Failed to clear notifications');
    }
  };

  const getStatusBadge = (status?: string, type: 'user' | 'event' | 'certificate' = 'event') => {
    const variants: { [key: string]: string } = {
      active: 'success',
      inactive: 'secondary',
      pending: 'warning',
      approved: 'success',
      rejected: 'danger',
      revoked: 'danger',
      valid: 'success'
    };
    
    // Handle undefined, null, or empty status
    if (!status) {
      return <Badge bg="secondary">UNKNOWN</Badge>;
    }
    
    const statusLower = status.toLowerCase();
    return <Badge bg={variants[statusLower] || 'secondary'}>{status.toUpperCase()}</Badge>;
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

  return (
    <Container fluid className="py-4 dashboard-container">
      <Row className="mb-4">
        <Col>
          <h2>🔧 Super Admin Dashboard</h2>
          <p className="text-muted">Welcome back, {user?.full_name || user?.email}!</p>
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
                  <h4>{users.length}</h4>
                  <p className="mb-0">Total Users</p>
                </div>
                <i className="fas fa-users fa-2x opacity-75"></i>
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
                  <p className="mb-0">Active Events</p>
                </div>
                <i className="fas fa-calendar fa-2x opacity-75"></i>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="bg-warning text-white">
            <Card.Body>
              <div className="d-flex justify-content-between">
                <div>
                  <h4>{events.filter(e => !e.is_approved).length}</h4>
                  <p className="mb-0">Pending Approvals</p>
                </div>
                <i className="fas fa-clock fa-2x opacity-75"></i>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Tabs */}
      <Tabs activeKey={activeTab} onSelect={handleTabSelect} className="mb-4">
        <Tab eventKey="overview" title="📊 Overview">
          <Row>
            <Col md={6}>
              <Card>
                <Card.Header>
                  <h5 className="mb-0">🚨 Pending User Approvals</h5>
                </Card.Header>
                <Card.Body>
                  {users.filter(u => !u.is_approved).length === 0 ? (
                    <p className="text-muted">No pending user approvals</p>
                  ) : (
                    <div className="table-responsive">
                      <Table hover size="sm">
                        <thead>
                          <tr>
                            <th>User</th>
                            <th>Email</th>
                            <th>Requested Role</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.filter(u => !u.is_approved).slice(0, 5).map(user => (
                            <tr key={user.id}>
                              <td>{user.full_name}</td>
                              <td>{user.email}</td>
                              <td>
                                <Badge bg={user.role === 'admin' ? 'primary' : 'secondary'}>
                                  {user.role === 'admin' ? 'Admin' : 'User'}
                                </Badge>
                              </td>
                              <td>
                                <Button
                                  size="sm"
                                  variant="success"
                                  onClick={() => handleUserAction(user.id, 'approve')}
                                >
                                  Approve
                                </Button>
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
            <Col md={6}>
              <Card>
                <Card.Header>
                  <h5 className="mb-0">📅 Pending Event Approvals</h5>
                </Card.Header>
                <Card.Body>
                  {events.filter(e => !e.is_approved).length === 0 ? (
                    <p className="text-muted">No pending event approvals</p>
                  ) : (
                    <div className="table-responsive">
                      <Table hover size="sm">
                        <thead>
                          <tr>
                            <th>Event</th>
                            <th>Created By</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {events.filter(e => !e.is_approved).slice(0, 5).map(event => (
                            <tr key={event.id}>
                              <td>{event.name}</td>
                              <td>Admin ID: {event.admin_id}</td>
                              <td>
                                <Button
                                  size="sm"
                                  variant="success"
                                  className="me-1"
                                  onClick={() => handleEventAction(event.id, 'approve')}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => handleEventAction(event.id, 'reject')}
                                >
                                  Reject
                                </Button>
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
          </Row>
        </Tab>

        <Tab eventKey="users" title="👥 User Management">
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">User Management</h5>
              <Button variant="primary">
                <i className="fas fa-user-plus me-2"></i>Add User
              </Button>
            </Card.Header>
            <Card.Body>
              {/* Search Controls */}
              <Row className="mb-3">
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Search Users</Form.Label>
                    <Form.Control
                      type="text"
                      placeholder="Search by email or name..."
                      value={userSearch}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserSearch(e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group>
                    <Form.Label>Filter by Role</Form.Label>
                    <Form.Select
                      value={userRoleFilter}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setUserRoleFilter(e.target.value)}
                    >
                      <option value="">All Roles</option>
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      <option value="super_admin">Super Admin</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group>
                    <Form.Label>&nbsp;</Form.Label>
                    <div className="d-flex gap-2">
                      <Button variant="outline-secondary" onClick={clearSearch}>Clear Filters</Button>
                    </div>
                  </Form.Group>
                </Col>
              </Row>
              
              <div className="table-responsive">
                <Table hover>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Active Status</th>
                      <th>Approval Status</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => (
                      <tr key={user.id}>
                        <td>
                          <div>
                            <strong>{user.full_name}</strong><br />
                            <small className="text-muted">{user.email}</small>
                          </div>
                        </td>
                        <td>{user.email}</td>
                        <td>
                          <Badge bg={(user.role || '').toString() === 'super_admin' ? 'danger' : (user.role || '').toString() === 'admin' ? 'warning' : 'info'}>
                            {((user.role || 'user').toString().replace('_', ' ').toUpperCase())}
                          </Badge>
                        </td>
                        <td>
                          <Badge bg={user.is_active ? 'success' : 'secondary'}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td>
                          <Badge bg={user.is_approved ? 'success' : 'warning'}>
                            {user.is_approved ? 'Approved' : 'Pending'}
                          </Badge>
                        </td>
                        <td>{new Date(user.created_at).toLocaleDateString()}</td>
                        <td>
                          <div className="btn-group" role="group">
                            {!user.is_approved && user.role !== 'super_admin' && (
                              <Button
                                size="sm"
                                variant="success"
                                onClick={() => handleUserAction(user.id, 'approve')}
                              >
                                Approve
                              </Button>
                            )}
                            {user.role === 'user' && user.is_active && (
                              <Button
                                size="sm"
                                variant="warning"
                                onClick={() => handleUserAction(user.id, 'promote')}
                              >
                                Make Admin
                              </Button>
                            )}
                            {user.role === 'admin' && (
                              <Button
                                size="sm"
                                variant="outline-warning"
                                onClick={() => handleUserAction(user.id, 'demote')}
                              >
                                Remove Admin
                              </Button>
                            )}
                            {user.is_active && user.role !== 'super_admin' && (
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => handleUserAction(user.id, 'deactivate')}
                              >
                                Deactivate
                              </Button>
                            )}
                            {user.role !== 'super_admin' && (
                              <Button
                                size="sm"
                                variant="outline-danger"
                                onClick={() => handleUserAction(user.id, 'delete')}
                              >
                                Delete
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

        <Tab eventKey="events" title="📅 Events">
          <Card>
            <Card.Header>
              <h5 className="mb-0">Event Management</h5>
            </Card.Header>
            <Card.Body>
              {/* Event Search Controls */}
              <Row className="mb-3">
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Search Events</Form.Label>
                    <Form.Control
                      type="text"
                      placeholder="Search by event name or description..."
                      value={eventSearch}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEventSearch(e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group>
                    <Form.Label>Filter by Status</Form.Label>
                    <Form.Select
                      value={eventApprovalFilter}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEventApprovalFilter(e.target.value)}
                    >
                      <option value="">All Statuses</option>
                      <option value="true">Approved</option>
                      <option value="false">Pending</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group>
                    <Form.Label>&nbsp;</Form.Label>
                    <div className="d-flex gap-2">
                      <Button variant="outline-secondary" onClick={clearSearch}>Clear Filters</Button>
                    </div>
                  </Form.Group>
                </Col>
              </Row>
              
              <div className="table-responsive">
                <Table hover>
                  <thead>
                    <tr>
                      <th>Event Name</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Created By</th>
                      <th>Created At</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map(event => (
                      <tr key={event.id}>
                        <td>
                          <strong>{event.name}</strong><br />
                          <small className="text-muted">{event.description}</small>
                        </td>
                        <td>{new Date(event.date).toLocaleDateString()}</td>
                        <td>{getStatusBadge(event.is_approved ? 'approved' : 'pending', 'event')}</td>
                        <td>Admin ID: {event.admin_id}</td>
                        <td>{new Date(event.created_at).toLocaleDateString()}</td>
                        <td>
                          {!event.is_approved ? (
                            <div className="btn-group">
                              <Button
                                size="sm"
                                variant="success"
                                onClick={() => handleEventAction(event.id, 'approve')}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => handleEventAction(event.id, 'reject')}
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <div className="btn-group">
                              {/* Participants Management Button */}
                              <Button
                                size="sm"
                                variant="outline-primary"
                                onClick={() => {
                                  setSelectedEventForParticipants(event);
                                  setShowParticipantModal(true);
                                }}
                                title="Manage event participants"
                                className="me-1"
                              >
                                <FontAwesomeIcon icon={faUsers} /> Participants
                              </Button>
                              
                              {/* Certificate Generation Button - Only for approved events */}
                              {event.is_approved && (
                                <Button
                                  size="sm"
                                  variant="success"
                                  onClick={() => {
                                    setSelectedEvent(event);
                                    setShowCertModal(true);
                                  }}
                                  title="Generate certificates for this event"
                                  className="me-1"
                                >
                                  📜 Generate Certificates
                                </Button>
                              )}
                              
                              {/* Close Event Button - Only for approved events that are not closed */}
                              {event.status !== 'closed' && (
                                <Button
                                  size="sm"
                                  variant="info"
                                  onClick={() => handleEventAction(event.id, 'close')}
                                  title="Close event to allow users to view certificates"
                                  className="me-1"
                                >
                                  <FontAwesomeIcon icon={faLock} /> Close
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="warning"
                                onClick={() => handleEventAction(event.id, 'revoke')}
                              >
                                Revoke
                              </Button>
                              {/* Add delete button for past events */}
                              {new Date(event.date) < new Date() && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={() => handleEventAction(event.id, 'delete')}
                                    title="Delete past event (will revoke all certificates)"
                                    className="me-1"
                                  >
                                    <FontAwesomeIcon icon={faTrashAlt} />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="dark"
                                    onClick={() => handleEventAction(event.id, 'delete-permanent')}
                                    title="⚠️ PERMANENTLY DELETE event and ALL data (IRREVERSIBLE)"
                                    style={{ backgroundColor: '#dc3545', borderColor: '#dc3545', opacity: 0.8 }}
                                  >
                                    <FontAwesomeIcon icon={faTrashAlt} />
                                    <small>∞</small>
                                  </Button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card.Body>
          </Card>
        </Tab>

        <Tab eventKey="certificates" title="📜 Certificates">
          <Card>
            <Card.Header>
              <h5 className="mb-0">Certificate Management</h5>
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
                    {certificates.slice(0, 20).map(cert => (
                      <tr key={cert.id}>
                        <td>
                          <code>{cert.certificate_id}</code>
                        </td>
                        <td>
                          <code>{cert.participant_id || 'N/A'}</code>
                        </td>
                        <td>
                          <div>
                            <strong>{cert.recipient_name}</strong>
                            {cert.recipient_email && (
                              <>
                                <br /><small className="text-muted">📧 {cert.recipient_email}</small>
                              </>
                            )}
                            {cert.recipient_phone && (
                              <>
                                <br /><small className="text-muted">📱 {cert.recipient_phone}</small>
                              </>
                            )}
                          </div>
                        </td>
                        <td>{cert.event?.name || 'N/A'}</td>
                        <td>{getStatusBadge(cert.status, 'certificate')}</td>
                        <td>{formatDate(cert.issued_at)}</td>
                        <td>
                          <div className="btn-group">
                            <Button 
                              size="sm" 
                              variant="outline-primary"
                              onClick={() => openCertificateUpdateModal(cert)}
                              title="Update certificate details"
                            >
                              ✏️ Edit
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline-success"
                              onClick={() => handleCertificateReissue(cert.id)}
                              title="Re-issue certificate with new ID"
                            >
                              🔄 Re-issue
                            </Button>
                            {cert.status !== 'revoked' && (
                              <Button 
                                size="sm" 
                                variant="outline-danger"
                                onClick={() => handleCertificateRevoke(cert.id)}
                              >
                                🚫 Revoke
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

        <Tab eventKey="activity-logs" title="📊 Activity Logs">
          <Card>
            <Card.Header>
              <h5 className="mb-0">System Activity Logs</h5>
            </Card.Header>
            <Card.Body>
              {activityLogs.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-muted">Loading activity logs...</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <Table hover size="sm">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>User</th>
                        <th>Action</th>
                        <th>Resource</th>
                        <th>IP Address</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activityLogs.slice(0, 50).map(log => (
                        <tr key={log.id}>
                          <td>
                            <small>{new Date(log.timestamp).toLocaleString()}</small>
                          </td>
                          <td>
                            {log.user_info ? (
                              <div>
                                <strong>{log.user_info.username}</strong>
                                <br />
                                <small className="text-muted">{log.user_info.role}</small>
                              </div>
                            ) : (
                              <span className="text-muted">System</span>
                            )}
                          </td>
                          <td>
                            <Badge bg="info">{log.action}</Badge>
                          </td>
                          <td>
                            {log.resource_type && (
                              <small>
                                {log.resource_type}
                                {log.resource_id && ` #${log.resource_id}`}
                              </small>
                            )}
                          </td>
                          <td>
                            <code>{log.ip_address || 'N/A'}</code>
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

        <Tab eventKey="tamper-logs" title="🚨 Tamper Detection">
          <Card>
            <Card.Header>
              <h5 className="mb-0">Tamper Detection Alerts</h5>
            </Card.Header>
            <Card.Body>
              {tamperLogs.length === 0 ? (
                <div className="text-center py-4">
                  <Alert variant="success">
                    <Alert.Heading>🛡️ No Tamper Attempts Detected</Alert.Heading>
                    <p className="mb-0">All certificates are secure and untampered.</p>
                  </Alert>
                </div>
              ) : (
                <div className="table-responsive">
                  <Table hover size="sm">
                    <thead>
                      <tr>
                        <th>Detection Time</th>
                        <th>Certificate ID</th>
                        <th>Tamper Type</th>
                        <th>Severity</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tamperLogs.map(log => (
                        <tr key={log.id}>
                          <td>
                            <small>{new Date(log.detected_at).toLocaleString()}</small>
                          </td>
                          <td>
                            <code>{log.certificate_id}</code>
                          </td>
                          <td>
                            <Badge bg="warning">{log.tamper_type}</Badge>
                          </td>
                          <td>
                            <Badge 
                              bg={log.severity === 'critical' ? 'danger' : 
                                  log.severity === 'high' ? 'warning' : 'info'}
                            >
                              {log.severity}
                            </Badge>
                          </td>
                          <td>
                            <small>{log.details || 'No details available'}</small>
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

        <Tab eventKey="notifications" title="🔔 Notification History">
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">System Notifications</h5>
              <Button
                variant="outline-danger"
                size="sm"
                onClick={clearAllNotifications}
                disabled={notificationHistory.length === 0}
              >
                <FontAwesomeIcon icon={faTrashAlt} className="me-1" />
                Clear All
              </Button>
            </Card.Header>
            <Card.Body>
              {notificationHistory.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-muted">Loading notification history...</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <Table hover size="sm">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Title</th>
                        <th>Message</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notificationHistory.slice(0, 50).map(notification => (
                        <tr key={notification.id}>
                          <td>
                            <small>{new Date(notification.created_at).toLocaleDateString()}</small>
                          </td>
                          <td>
                            <Badge 
                              bg={notification.notification_type === 'certificate' ? 'primary' : 
                                  notification.notification_type === 'tamper' ? 'danger' : 'info'}
                            >
                              {notification.notification_type}
                            </Badge>
                          </td>
                          <td>
                            <strong>{notification.title}</strong>
                          </td>
                          <td>
                            <small>{notification.message}</small>
                          </td>
                          <td>
                            <Badge bg={notification.is_read ? 'success' : 'secondary'}>
                              {notification.is_read ? 'Read' : 'Unread'}
                            </Badge>
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
      </Tabs>
      
      {/* Event Participant Management Modal */}
      {selectedEventForParticipants && (
        <EventParticipantModal
          show={showParticipantModal}
          onHide={() => {
            setShowParticipantModal(false);
            setSelectedEventForParticipants(null);
          }}
          eventId={selectedEventForParticipants.id}
          eventName={selectedEventForParticipants.name}
        />
      )}

      {/* Certificate Update Modal */}
      <Modal show={showCertUpdateModal} onHide={() => setShowCertUpdateModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>✏️ Update Certificate</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleCertificateUpdate}>
          <Modal.Body>
            {selectedCertificate && (
              <Alert variant="info">
                <strong>Certificate ID:</strong> <code>{selectedCertificate.certificate_id}</code>
                <br />
                <strong>Event:</strong> {selectedCertificate.event?.name || 'N/A'}
                <br />
                <strong>Current Status:</strong> {getStatusBadge(selectedCertificate.status, 'certificate')}
              </Alert>
            )}

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Recipient Name *</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="Enter recipient's full name"
                    value={certUpdateForm.recipient_name}
                    onChange={(e) => setCertUpdateForm({
                      ...certUpdateForm,
                      recipient_name: e.target.value
                    })}
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Certificate Status *</Form.Label>
                  <Form.Select
                    value={certUpdateForm.status}
                    onChange={(e) => setCertUpdateForm({
                      ...certUpdateForm,
                      status: e.target.value
                    })}
                    required
                  >
                    <option value="valid">✅ Valid</option>
                    <option value="pending">⏳ Pending</option>
                    <option value="revoked">🚫 Revoked</option>
                    <option value="expired">⏰ Expired</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Email Address</Form.Label>
                  <Form.Control
                    type="email"
                    placeholder="Enter recipient's email"
                    value={certUpdateForm.recipient_email}
                    onChange={(e) => setCertUpdateForm({
                      ...certUpdateForm,
                      recipient_email: e.target.value
                    })}
                  />
                  <Form.Text className="text-muted">
                    Optional: Used for certificate delivery notifications
                  </Form.Text>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Phone Number</Form.Label>
                  <Form.Control
                    type="tel"
                    placeholder="Enter recipient's phone number"
                    value={certUpdateForm.recipient_phone}
                    onChange={(e) => setCertUpdateForm({
                      ...certUpdateForm,
                      recipient_phone: e.target.value
                    })}
                  />
                  <Form.Text className="text-muted">
                    Optional: Contact information for the recipient
                  </Form.Text>
                </Form.Group>
              </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => {
              setShowCertUpdateModal(false);
              setSelectedCertificate(null);
              setCertUpdateForm({ recipient_name: '', recipient_email: '', recipient_phone: '', status: 'valid' });
            }}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              variant="primary"
              disabled={!certUpdateForm.recipient_name.trim()}
            >
              <i className="fas fa-save me-2"></i>
              Update Certificate
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
            {selectedEvent && (
              <Alert variant="info">
                <strong>Event:</strong> {selectedEvent.name}
                <br />
                <strong>Date:</strong> {formatDate(selectedEvent.date)}
                <br />
                <strong>Type:</strong> {certGenerationType === 'single' ? '📄 Single Certificate' : '📊 Bulk Generation'}
              </Alert>
            )}

            <Form.Group className="mb-3">
              <Form.Label>Generation Type *</Form.Label>
              <div className="d-flex gap-3">
                <Form.Check
                  type="radio"
                  id="single-cert-super"
                  name="certTypeSuperAdmin"
                  label="📄 Single Certificate"
                  checked={certGenerationType === 'single'}
                  onChange={() => setCertGenerationType('single')}
                />
                <Form.Check
                  type="radio"
                  id="bulk-cert-super"
                  name="certTypeSuperAdmin"
                  label="📊 Bulk Certificates"
                  checked={certGenerationType === 'bulk'}
                  onChange={() => setCertGenerationType('bulk')}
                />
              </div>
            </Form.Group>

            {certGenerationType === 'single' ? (
              <>
                <Row>
                  <Col md={6}>
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
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Participant ID (Optional)</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="Auto-generated: PART-001, CERT-002..."
                        value={singleCertForm.participant_id}
                        onChange={(e) => setSingleCertForm({
                          ...singleCertForm,
                          participant_id: e.target.value
                        })}
                      />
                      <Form.Text className="text-muted">
                        <strong>🆔 Auto-format Examples:</strong> PART-001, CERT-002, STU-003, ATT-004<br />
                        <strong>💡 Leave empty</strong> for automatic generation with rotating prefixes
                      </Form.Text>
                    </Form.Group>
                  </Col>
                </Row>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Email Address (Optional)</Form.Label>
                      <Form.Control
                        type="email"
                        placeholder="recipient@example.com"
                        value={singleCertForm.recipient_email || ''}
                        onChange={(e) => setSingleCertForm({
                          ...singleCertForm,
                          recipient_email: e.target.value
                        })}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Phone Number (Optional)</Form.Label>
                      <Form.Control
                        type="tel"
                        placeholder="+1234567890"
                        value={singleCertForm.recipient_phone || ''}
                        onChange={(e) => setSingleCertForm({
                          ...singleCertForm,
                          recipient_phone: e.target.value
                        })}
                      />
                    </Form.Group>
                  </Col>
                </Row>
              </>
            ) : (
              <Form.Group className="mb-3">
                <Form.Label>Participant List File *</Form.Label>
                
                {/* Enhanced Template Generator Component */}
                <CertificateTemplateGenerator />
                
                <Form.Control
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const file = e.target.files?.[0] || null;
                    setCsvFile(file);
                  }}
                  required
                  className="mt-3"
                />
                <Form.Text className="text-muted">
                  <div className="mt-2">
                    <strong>📋 Accepted formats:</strong> CSV (.csv), Excel (.xlsx, .xls)<br />
                    <strong>📝 Required columns:</strong> recipient_name<br />
                    <strong>📊 Optional columns:</strong> participant_id, email, phone_number<br />
                    <strong>🔄 Processing:</strong> Auto-generates missing participant IDs with prefixes (PART-001, STU-002, etc.)
                  </div>
                </Form.Text>
              </Form.Group>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => {
              setShowCertModal(false);
              setCertGenerationType('bulk');
              setSingleCertForm({ 
                recipient_name: '', 
                participant_id: '',
                recipient_email: '',
                recipient_phone: ''
              });
            }}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              variant="success"
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
    </Container>
  );
};

export default SuperAdminDashboard;
