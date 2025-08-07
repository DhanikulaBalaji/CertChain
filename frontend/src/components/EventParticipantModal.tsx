import React, { useState, useEffect } from 'react';
import { 
  Modal, 
  Button, 
  Table, 
  Form, 
  Row, 
  Col, 
  Alert, 
  Badge, 
  Spinner,
  Tab,
  Tabs,
  InputGroup,
  DropdownButton,
  Dropdown
} from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faUsers, 
  faUserPlus, 
  faEdit, 
  faTrash, 
  faFileUpload,
  faSearch,
  faCheck,
  faTimes,
  faUserCheck,
  faSpinner
} from '@fortawesome/free-solid-svg-icons';
import api from '../services/api';

interface EventParticipant {
  id: number;
  event_id: number;
  user_id?: number;
  participant_name: string;
  participant_email: string;
  participant_phone?: string;
  registration_date: string;
  attendance_status: string;
  is_certificate_generated: boolean;
  notes?: string;
}

interface EventParticipantModalProps {
  show: boolean;
  onHide: () => void;
  eventId: number;
  eventName: string;
}

const EventParticipantModal: React.FC<EventParticipantModalProps> = ({ 
  show, 
  onHide, 
  eventId, 
  eventName 
}) => {
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('list');
  
  // Search and filter
  const [searchTerm, setSearchTerm] = useState('');
  const [attendanceFilter, setAttendanceFilter] = useState('all');
  
  // Add participant form
  const [newParticipant, setNewParticipant] = useState({
    participant_name: '',
    participant_email: '',
    participant_phone: '',
    attendance_status: 'registered',
    notes: ''
  });
  
  // Edit participant
  const [editingParticipant, setEditingParticipant] = useState<EventParticipant | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  
  // Bulk upload
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (show && eventId) {
      fetchParticipants();
    }
  }, [show, eventId]);

  const fetchParticipants = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/events/${eventId}/participants`);
      setParticipants(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch participants');
    } finally {
      setLoading(false);
    }
  };

  const addParticipant = async () => {
    try {
      setLoading(true);
      await api.post(`/events/${eventId}/participants`, {
        ...newParticipant,
        event_id: eventId
      });
      
      setSuccess('Participant added successfully');
      setNewParticipant({
        participant_name: '',
        participant_email: '',
        participant_phone: '',
        attendance_status: 'registered',
        notes: ''
      });
      
      await fetchParticipants();
      setActiveTab('list');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add participant');
    } finally {
      setLoading(false);
    }
  };

  const updateParticipant = async () => {
    if (!editingParticipant) return;
    
    try {
      setLoading(true);
      await api.put(`/events/${eventId}/participants/${editingParticipant.id}`, {
        participant_name: editingParticipant.participant_name,
        participant_email: editingParticipant.participant_email,
        participant_phone: editingParticipant.participant_phone,
        attendance_status: editingParticipant.attendance_status,
        notes: editingParticipant.notes
      });
      
      setSuccess('Participant updated successfully');
      setShowEditModal(false);
      setEditingParticipant(null);
      await fetchParticipants();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update participant');
    } finally {
      setLoading(false);
    }
  };

  const removeParticipant = async (participantId: number, participantName: string) => {
    if (!window.confirm(`Are you sure you want to remove ${participantName} from this event?`)) {
      return;
    }
    
    try {
      setLoading(true);
      await api.delete(`/events/${eventId}/participants/${participantId}`);
      setSuccess('Participant removed successfully');
      await fetchParticipants();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to remove participant');
    } finally {
      setLoading(false);
    }
  };

  const updateAttendanceStatus = async (participantId: number, status: string) => {
    try {
      await api.put(`/events/${eventId}/participants/${participantId}/attendance`, null, {
        params: { attendance_status: status }
      });
      setSuccess(`Attendance status updated to ${status}`);
      await fetchParticipants();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update attendance');
    }
  };

  const handleBulkUpload = async () => {
    if (!uploadFile) return;
    
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('participants_file', uploadFile);
      
      const response = await api.post(`/events/${eventId}/participants/bulk-upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setSuccess(response.data.message);
      setUploadFile(null);
      await fetchParticipants();
      setActiveTab('list');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Bulk upload failed');
    } finally {
      setUploading(false);
    }
  };

  const getAttendanceBadge = (status: string) => {
    switch (status) {
      case 'attended':
        return <Badge bg="success">Attended</Badge>;
      case 'absent':
        return <Badge bg="danger">Absent</Badge>;
      default:
        return <Badge bg="secondary">Registered</Badge>;
    }
  };

  const filteredParticipants = participants.filter(participant => {
    const matchesSearch = participant.participant_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         participant.participant_email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = attendanceFilter === 'all' || participant.attendance_status === attendanceFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <>
      <Modal show={show} onHide={onHide} size="xl" backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title>
            <FontAwesomeIcon icon={faUsers} className="me-2" />
            Event Participants - {eventName}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
          {success && <Alert variant="success" dismissible onClose={() => setSuccess('')}>{success}</Alert>}

          <Tabs activeKey={activeTab} onSelect={(k) => setActiveTab(k || 'list')} className="mb-3">
            <Tab eventKey="list" title={
              <span>
                <FontAwesomeIcon icon={faUsers} className="me-1" />
                Participants ({participants.length})
              </span>
            }>
              <Row className="mb-3">
                <Col md={6}>
                  <InputGroup>
                    <InputGroup.Text>
                      <FontAwesomeIcon icon={faSearch} />
                    </InputGroup.Text>
                    <Form.Control
                      type="text"
                      placeholder="Search participants..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </InputGroup>
                </Col>
                <Col md={4}>
                  <Form.Select
                    value={attendanceFilter}
                    onChange={(e) => setAttendanceFilter(e.target.value)}
                  >
                    <option value="all">All Status</option>
                    <option value="registered">Registered</option>
                    <option value="attended">Attended</option>
                    <option value="absent">Absent</option>
                  </Form.Select>
                </Col>
                <Col md={2}>
                  <Button 
                    variant="primary" 
                    onClick={() => setActiveTab('add')}
                    className="w-100"
                  >
                    <FontAwesomeIcon icon={faUserPlus} className="me-1" />
                    Add
                  </Button>
                </Col>
              </Row>

              {loading ? (
                <div className="text-center py-4">
                  <Spinner animation="border" />
                  <p className="mt-2">Loading participants...</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <Table striped bordered hover>
                    <thead className="table-dark">
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Registration Date</th>
                        <th>Attendance</th>
                        <th>Certificate</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredParticipants.map((participant) => (
                        <tr key={participant.id}>
                          <td>{participant.participant_name}</td>
                          <td>{participant.participant_email}</td>
                          <td>{participant.participant_phone || '-'}</td>
                          <td>{new Date(participant.registration_date).toLocaleDateString()}</td>
                          <td>
                            <DropdownButton
                              variant="outline-secondary"
                              size="sm"
                              title={getAttendanceBadge(participant.attendance_status)}
                            >
                              <Dropdown.Item 
                                onClick={() => updateAttendanceStatus(participant.id, 'registered')}
                              >
                                Registered
                              </Dropdown.Item>
                              <Dropdown.Item 
                                onClick={() => updateAttendanceStatus(participant.id, 'attended')}
                              >
                                Attended
                              </Dropdown.Item>
                              <Dropdown.Item 
                                onClick={() => updateAttendanceStatus(participant.id, 'absent')}
                              >
                                Absent
                              </Dropdown.Item>
                            </DropdownButton>
                          </td>
                          <td>
                            {participant.is_certificate_generated ? (
                              <Badge bg="success">Generated</Badge>
                            ) : (
                              <Badge bg="secondary">Not Generated</Badge>
                            )}
                          </td>
                          <td>
                            <Button
                              variant="outline-primary"
                              size="sm"
                              className="me-1"
                              onClick={() => {
                                setEditingParticipant(participant);
                                setShowEditModal(true);
                              }}
                            >
                              <FontAwesomeIcon icon={faEdit} />
                            </Button>
                            <Button
                              variant="outline-danger"
                              size="sm"
                              onClick={() => removeParticipant(participant.id, participant.participant_name)}
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  
                  {filteredParticipants.length === 0 && (
                    <div className="text-center py-4">
                      <p className="text-muted">No participants found matching your criteria.</p>
                    </div>
                  )}
                </div>
              )}
            </Tab>

            <Tab eventKey="add" title={
              <span>
                <FontAwesomeIcon icon={faUserPlus} className="me-1" />
                Add Participant
              </span>
            }>
              <Form>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Participant Name *</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="Enter participant name"
                        value={newParticipant.participant_name}
                        onChange={(e) => setNewParticipant({
                          ...newParticipant,
                          participant_name: e.target.value
                        })}
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Email Address *</Form.Label>
                      <Form.Control
                        type="email"
                        placeholder="Enter email address"
                        value={newParticipant.participant_email}
                        onChange={(e) => setNewParticipant({
                          ...newParticipant,
                          participant_email: e.target.value
                        })}
                        required
                      />
                    </Form.Group>
                  </Col>
                </Row>
                
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Phone Number</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="Enter phone number"
                        value={newParticipant.participant_phone}
                        onChange={(e) => setNewParticipant({
                          ...newParticipant,
                          participant_phone: e.target.value
                        })}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Attendance Status</Form.Label>
                      <Form.Select
                        value={newParticipant.attendance_status}
                        onChange={(e) => setNewParticipant({
                          ...newParticipant,
                          attendance_status: e.target.value
                        })}
                      >
                        <option value="registered">Registered</option>
                        <option value="attended">Attended</option>
                        <option value="absent">Absent</option>
                      </Form.Select>
                    </Form.Group>
                  </Col>
                </Row>
                
                <Form.Group className="mb-3">
                  <Form.Label>Notes</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    placeholder="Enter any additional notes"
                    value={newParticipant.notes}
                    onChange={(e) => setNewParticipant({
                      ...newParticipant,
                      notes: e.target.value
                    })}
                  />
                </Form.Group>
                
                <div className="d-flex gap-2">
                  <Button
                    variant="primary"
                    onClick={addParticipant}
                    disabled={loading || !newParticipant.participant_name || !newParticipant.participant_email}
                  >
                    {loading ? (
                      <>
                        <FontAwesomeIcon icon={faSpinner} spin className="me-1" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <FontAwesomeIcon icon={faUserPlus} className="me-1" />
                        Add Participant
                      </>
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setActiveTab('list')}
                  >
                    Cancel
                  </Button>
                </div>
              </Form>
            </Tab>

            <Tab eventKey="bulk" title={
              <span>
                <FontAwesomeIcon icon={faFileUpload} className="me-1" />
                Bulk Upload
              </span>
            }>
              <Alert variant="info">
                <strong>CSV Format:</strong> Upload a CSV file with columns: 
                participant_name, participant_email, participant_phone (optional), 
                attendance_status (optional), notes (optional)
              </Alert>
              
              <Form.Group className="mb-3">
                <Form.Label>Select CSV File</Form.Label>
                <Form.Control
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    const files = (e.target as HTMLInputElement).files;
                    setUploadFile(files ? files[0] : null);
                  }}
                />
              </Form.Group>
              
              <div className="d-flex gap-2">
                <Button
                  variant="primary"
                  onClick={handleBulkUpload}
                  disabled={uploading || !uploadFile}
                >
                  {uploading ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin className="me-1" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faFileUpload} className="me-1" />
                      Upload Participants
                    </>
                  )}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setActiveTab('list')}
                >
                  Cancel
                </Button>
              </div>
            </Tab>
          </Tabs>
        </Modal.Body>
      </Modal>

      {/* Edit Participant Modal */}
      <Modal show={showEditModal} onHide={() => setShowEditModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Edit Participant</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {editingParticipant && (
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>Participant Name</Form.Label>
                <Form.Control
                  type="text"
                  value={editingParticipant.participant_name}
                  onChange={(e) => setEditingParticipant({
                    ...editingParticipant,
                    participant_name: e.target.value
                  })}
                />
              </Form.Group>
              
              <Form.Group className="mb-3">
                <Form.Label>Email Address</Form.Label>
                <Form.Control
                  type="email"
                  value={editingParticipant.participant_email}
                  onChange={(e) => setEditingParticipant({
                    ...editingParticipant,
                    participant_email: e.target.value
                  })}
                />
              </Form.Group>
              
              <Form.Group className="mb-3">
                <Form.Label>Phone Number</Form.Label>
                <Form.Control
                  type="text"
                  value={editingParticipant.participant_phone || ''}
                  onChange={(e) => setEditingParticipant({
                    ...editingParticipant,
                    participant_phone: e.target.value
                  })}
                />
              </Form.Group>
              
              <Form.Group className="mb-3">
                <Form.Label>Attendance Status</Form.Label>
                <Form.Select
                  value={editingParticipant.attendance_status}
                  onChange={(e) => setEditingParticipant({
                    ...editingParticipant,
                    attendance_status: e.target.value
                  })}
                >
                  <option value="registered">Registered</option>
                  <option value="attended">Attended</option>
                  <option value="absent">Absent</option>
                </Form.Select>
              </Form.Group>
              
              <Form.Group className="mb-3">
                <Form.Label>Notes</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={editingParticipant.notes || ''}
                  onChange={(e) => setEditingParticipant({
                    ...editingParticipant,
                    notes: e.target.value
                  })}
                />
              </Form.Group>
            </Form>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={updateParticipant}
            disabled={loading}
          >
            {loading ? (
              <>
                <FontAwesomeIcon icon={faSpinner} spin className="me-1" />
                Updating...
              </>
            ) : (
              'Update Participant'
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default EventParticipantModal;
