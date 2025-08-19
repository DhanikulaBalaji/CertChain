import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Badge, Table, Modal } from 'react-bootstrap';
import { useAuth } from '../services/AuthContext';
import api from '../services/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faUser, 
  faEnvelope, 
  faCalendarAlt, 
  faKey, 
  faSave,
  faUserCircle,
  faCertificate,
  faEye,
  faCalendar,
  faClock
} from '@fortawesome/free-solid-svg-icons';

interface UserProfile {
  id: number;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  is_approved: boolean;
  created_at: string;
  updated_at: string;
}

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
  issued_at?: string;
  event?: {
    id: number;
    name: string;
    description: string;
    date: string;
  };
}

const Profile: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Form state
  const [fullName, setFullName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Certificate modal
  const [showCertModal, setShowCertModal] = useState(false);
  const [selectedCertificate, setSelectedCertificate] = useState<Certificate | null>(null);

  useEffect(() => {
    fetchProfileData();
  }, []);

  const fetchProfileData = async () => {
    try {
      setLoading(true);
      const [profileRes, certificatesRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/certificates/my-certificates')
      ]);
      
      setProfile(profileRes.data);
      setCertificates(certificatesRes.data);
      setFullName(profileRes.data.full_name);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch profile');
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Date not available';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'issued':
      case 'verified':
        return 'success';
      case 'pending':
        return 'warning';
      case 'revoked':
        return 'danger';
      default:
        return 'secondary';
    }
  };

  const handleViewCertificate = (certificate: Certificate) => {
    setSelectedCertificate(certificate);
    setShowCertModal(true);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Full name is required');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const response = await api.put('/auth/profile', {
        full_name: fullName
      });

      setProfile(response.data);
      setSuccess('Profile updated successfully!');
      
      // Update user context
      if (updateUser) {
        updateUser(response.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All password fields are required');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      });

      setSuccess('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const getRoleBadge = (role: string) => {
    const roleVariants: { [key: string]: string } = {
      super_admin: 'danger',
      admin: 'warning',
      user: 'primary'
    };
    
    return (
      <Badge bg={roleVariants[role] || 'secondary'}>
        {role.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const getStatusBadge = (isActive: boolean, isApproved: boolean) => {
    if (!isActive) {
      return <Badge bg="danger">Inactive</Badge>;
    }
    if (!isApproved) {
      return <Badge bg="warning">Pending Approval</Badge>;
    }
    return <Badge bg="success">Active</Badge>;
  };

  if (loading) {
    return (
      <Container className="py-5">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-3">Loading profile...</p>
        </div>
      </Container>
    );
  }

  if (!profile) {
    return (
      <Container className="py-5">
        <Alert variant="danger">
          Failed to load profile data. Please try refreshing the page.
        </Alert>
      </Container>
    );
  }

  return (
    <Container className="py-4">
      <Row className="justify-content-center">
        <Col lg={8}>
          <div className="text-center mb-4">
            <FontAwesomeIcon icon={faUserCircle} size="3x" className="text-primary mb-3" />
            <h2>My Profile</h2>
            <p className="text-muted">Manage your account settings</p>
          </div>

          {error && <Alert variant="danger">{error}</Alert>}
          {success && <Alert variant="success">{success}</Alert>}

          {/* Profile Information */}
          <Card className="mb-4">
            <Card.Header>
              <h5 className="mb-0">
                <FontAwesomeIcon icon={faUser} className="me-2" />
                Profile Information
              </h5>
            </Card.Header>
            <Card.Body>
              <Row className="mb-3">
                <Col sm={3}>
                  <strong>Email:</strong>
                </Col>
                <Col sm={9}>
                  <FontAwesomeIcon icon={faEnvelope} className="me-2 text-muted" />
                  {profile.email}
                </Col>
              </Row>
              <Row className="mb-3">
                <Col sm={3}>
                  <strong>Role:</strong>
                </Col>
                <Col sm={9}>
                  {getRoleBadge(profile.role)}
                </Col>
              </Row>
              <Row className="mb-3">
                <Col sm={3}>
                  <strong>Status:</strong>
                </Col>
                <Col sm={9}>
                  {getStatusBadge(profile.is_active, profile.is_approved)}
                </Col>
              </Row>
              <Row className="mb-3">
                <Col sm={3}>
                  <strong>Member Since:</strong>
                </Col>
                <Col sm={9}>
                  <FontAwesomeIcon icon={faCalendarAlt} className="me-2 text-muted" />
                  {new Date(profile.created_at).toLocaleDateString()}
                </Col>
              </Row>
            </Card.Body>
          </Card>

          {/* Update Profile Form */}
          <Card className="mb-4">
            <Card.Header>
              <h5 className="mb-0">
                <FontAwesomeIcon icon={faSave} className="me-2" />
                Update Profile
              </h5>
            </Card.Header>
            <Card.Body>
              <Form onSubmit={handleUpdateProfile}>
                <Form.Group className="mb-3">
                  <Form.Label>Full Name</Form.Label>
                  <Form.Control
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </Form.Group>
                <Button 
                  type="submit" 
                  variant="primary"
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faSave} className="me-2" />
                      Update Profile
                    </>
                  )}
                </Button>
              </Form>
            </Card.Body>
          </Card>

          {/* Change Password Form */}
          <Card>
            <Card.Header>
              <h5 className="mb-0">
                <FontAwesomeIcon icon={faKey} className="me-2" />
                Change Password
              </h5>
            </Card.Header>
            <Card.Body>
              <Form onSubmit={handleChangePassword}>
                <Form.Group className="mb-3">
                  <Form.Label>Current Password</Form.Label>
                  <Form.Control
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>New Password</Form.Label>
                  <Form.Control
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                  <Form.Text className="text-muted">
                    Password must be at least 6 characters long.
                  </Form.Text>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Confirm New Password</Form.Label>
                  <Form.Control
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </Form.Group>
                <Button 
                  type="submit" 
                  variant="warning"
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" />
                      Changing...
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faKey} className="me-2" />
                      Change Password
                    </>
                  )}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* My Certificates Section */}
      <Row className="mt-4">
        <Col>
          <Card>
            <Card.Header>
              <h5 className="mb-0">
                <FontAwesomeIcon icon={faCertificate} className="me-2" />
                My Certificates ({certificates.length})
              </h5>
            </Card.Header>
            <Card.Body>
              {certificates.length === 0 ? (
                <Alert variant="info">
                  <FontAwesomeIcon icon={faCertificate} className="me-2" />
                  No certificates found. Participate in events to earn certificates!
                </Alert>
              ) : (
                <Table responsive striped hover>
                  <thead>
                    <tr>
                      <th>Certificate ID</th>
                      <th>Event Name</th>
                      <th>Generated Date & Time</th>
                      <th>Event Date</th>
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
                        <td>
                          <strong>{cert.event?.name || cert.event_name}</strong>
                          {cert.event?.description && (
                            <div className="text-muted small">
                              {cert.event.description.length > 50 
                                ? `${cert.event.description.substring(0, 50)}...` 
                                : cert.event.description
                              }
                            </div>
                          )}
                        </td>
                        <td>
                          <FontAwesomeIcon icon={faClock} className="me-1 text-success" />
                          {formatDateTime(cert.issued_at || cert.issued_date)}
                        </td>
                        <td>
                          <FontAwesomeIcon icon={faCalendar} className="me-1 text-primary" />
                          {formatDateTime(cert.event?.date || cert.event_date)}
                        </td>
                        <td>
                          <Badge bg={getStatusBadgeColor(cert.status)}>
                            {cert.status}
                          </Badge>
                          {cert.is_verified && (
                            <Badge bg="success" className="ms-1">
                              ✓ Verified
                            </Badge>
                          )}
                        </td>
                        <td>
                          <Button
                            variant="outline-primary"
                            size="sm"
                            onClick={() => handleViewCertificate(cert)}
                          >
                            <FontAwesomeIcon icon={faEye} className="me-1" />
                            View Details
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Certificate Details Modal */}
      <Modal show={showCertModal} onHide={() => setShowCertModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            <FontAwesomeIcon icon={faCertificate} className="me-2" />
            Certificate Details
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedCertificate && (
            <Row>
              <Col md={6}>
                <h6 className="fw-bold mb-3">Certificate Information</h6>
                <p><strong>Certificate ID:</strong></p>
                <code className="d-block mb-3 p-2 bg-light rounded">{selectedCertificate.certificate_id}</code>
                
                <p><strong>Recipient:</strong> {selectedCertificate.recipient_name}</p>
                <p><strong>Email:</strong> {selectedCertificate.recipient_email || 'Email not provided'}</p>
                
                <p><strong>Status:</strong></p>
                <div className="mb-3">
                  <Badge bg={getStatusBadgeColor(selectedCertificate.status)} className="me-2">
                    {selectedCertificate.status}
                  </Badge>
                  {selectedCertificate.is_verified && (
                    <Badge bg="success">✓ Blockchain Verified</Badge>
                  )}
                </div>

                <p><strong>Generated Date & Time:</strong></p>
                <p className="text-success">
                  <FontAwesomeIcon icon={faClock} className="me-2" />
                  {formatDateTime(selectedCertificate.issued_at || selectedCertificate.issued_date)}
                </p>
              </Col>
              <Col md={6}>
                <h6 className="fw-bold mb-3">Event Information</h6>
                <p><strong>Event Name:</strong> {selectedCertificate.event?.name || selectedCertificate.event_name}</p>
                
                {selectedCertificate.event?.description && (
                  <p><strong>Description:</strong> {selectedCertificate.event.description}</p>
                )}
                
                <p><strong>Event Date & Time:</strong></p>
                <p className="text-primary">
                  <FontAwesomeIcon icon={faCalendar} className="me-2" />
                  {formatDateTime(selectedCertificate.event?.date || selectedCertificate.event_date)}
                </p>

                {selectedCertificate.participant_id && (
                  <p><strong>Participant ID:</strong> {selectedCertificate.participant_id}</p>
                )}

                {selectedCertificate.blockchain_tx_hash && (
                  <>
                    <p><strong>Blockchain Transaction:</strong></p>
                    <code className="d-block mb-3 p-2 bg-light rounded text-break">
                      {selectedCertificate.blockchain_tx_hash}
                    </code>
                  </>
                )}
              </Col>
            </Row>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowCertModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default Profile;
