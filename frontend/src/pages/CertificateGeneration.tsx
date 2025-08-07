import React, { useState, useEffect, useCallback } from 'react';
import { Container, Row, Col, Card, Button, Form, Alert, Table, Modal, Spinner, ProgressBar, Badge } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPalette, faDownload, faEye, faPlus } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../services/AuthContext';
import TemplateManager from '../components/TemplateManager';
import api from '../services/api';

// Ensure this file is treated as a module
export {};

// TypeScript interfaces
interface CertificateTemplate {
  id: number;
  name: string;
  description: string;
  file_path: string;
  created_at: string;
}

interface Event {
  id: number;
  name: string;
  description: string;
  status: string;
}

interface CertificateRecord {
  full_name: string;
  email: string;
  employee_id?: string;
  department?: string;
  position?: string;
  phone?: string;
  company?: string;
}

interface GenerationJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  total: number;
  current: number;
  message: string;
}

// Utility function to safely convert errors to strings
const getErrorMessage = (error: any): string => {
  if (typeof error === 'string') {
    return error;
  }
  
  if (error?.response?.data?.detail) {
    const detail = error.response.data.detail;
    if (typeof detail === 'string') {
      return detail;
    }
    if (Array.isArray(detail)) {
      return detail.map((e: any) => {
        if (typeof e === 'string') return e;
        if (e?.msg) return e.msg;
        if (e?.message) return e.message;
        return String(e);
      }).join(', ');
    }
    return String(detail);
  }
  
  if (error?.message) {
    return error.message;
  }
  
  return String(error);
};

const CertificateGeneration: React.FC = () => {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Single certificate form
  const [singleForm, setSingleForm] = useState({
    eventId: '',
    templateId: '',
    recipientName: '',
    recipientEmail: '',
    employeeId: '',
    department: '',
    position: '',
    company: ''
  });
  
  // Bulk certificate form
  const [bulkForm, setBulkForm] = useState({
    eventId: '',
    templateId: '',
    csvFile: null as File | null
  });
  
  const [csvData, setCsvData] = useState<CertificateRecord[]>([]);
  const [csvPreview, setCsvPreview] = useState<CertificateRecord[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [generationJob, setGenerationJob] = useState<GenerationJob | null>(null);
  const [showProgressModal, setShowProgressModal] = useState(false);

  const loadInitialData = useCallback(async () => {
    try {
      const [templatesRes, eventsRes] = await Promise.all([
        api.get('/admin/templates', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        api.get('/admin/events?for_certificates=true', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      
      setTemplates(templatesRes.data);
      setEvents(eventsRes.data);
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError(getErrorMessage(err) || 'Failed to load initial data');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const handleSingleFormChange = (field: string, value: string) => {
    setSingleForm(prev => ({ ...prev, [field]: value }));
  };

  const handleBulkFormChange = (field: string, value: string) => {
    setBulkForm(prev => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv') && 
        !file.name.toLowerCase().endsWith('.xlsx') && 
        !file.name.toLowerCase().endsWith('.xls')) {
      setError('Please select a CSV or Excel file');
      return;
    }

    setBulkForm(prev => ({ ...prev, csvFile: file }));
    
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await api.post('/admin/certificates/upload-csv', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data.valid) {
        setCsvData(response.data.records);
        setCsvPreview(response.data.preview);
        setSuccess(`File uploaded successfully! Found ${response.data.total_records} records.`);
        
        if (response.data.warnings && response.data.warnings.length > 0) {
          const warningMessages = response.data.warnings.map((w: any) => 
            typeof w === 'string' ? w : String(w)
          );
          setError(`Warnings: ${warningMessages.join(', ')}`);
        }
      } else {
        const errorMessages = response.data.errors?.map((e: any) => 
          typeof e === 'string' ? e : String(e)
        ) || ['Unknown validation error'];
        setError(`File validation failed: ${errorMessages.join(', ')}`);
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(getErrorMessage(err) || 'Failed to upload CSV file');
    } finally {
      setLoading(false);
    }
  };

  const generateSingleCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    if (!singleForm.eventId || !singleForm.recipientName || !singleForm.recipientEmail) {
      setError('Please fill in all required fields');
      return;
    }
    
    try {
      setLoading(true);
      
      const response = await api.post('/admin/certificates/generate-single', {
        event_id: parseInt(singleForm.eventId),
        recipient_name: singleForm.recipientName,
        recipient_id: null
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setSuccess(`Certificate generated successfully! Certificate ID: ${response.data.certificate_id || 'Generated'}`);
      
      // Reset form
      setSingleForm({
        eventId: '',
        templateId: '',
        recipientName: '',
        recipientEmail: '',
        employeeId: '',
        department: '',
        position: '',
        company: ''
      });
      
    } catch (err: any) {
      console.error('Generation error:', err);
      setError(getErrorMessage(err) || 'Failed to generate certificate');
    } finally {
      setLoading(false);
    }
  };

  const generateBulkCertificates = async () => {
    if (!bulkForm.eventId || !bulkForm.templateId || csvData.length === 0) {
      setError('Please select event, template, and upload CSV file');
      return;
    }
    
    try {
      setLoading(true);
      setShowProgressModal(true);
      
      const response = await api.post('/admin/certificates/generate-bulk', {
        event_id: parseInt(bulkForm.eventId),
        template_id: parseInt(bulkForm.templateId),
        recipients: csvData
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const jobId = response.data.job_id;
      setGenerationJob({
        id: jobId,
        status: 'processing',
        progress: 0,
        total: csvData.length,
        current: 0,
        message: 'Starting bulk generation...'
      });
      
      // Poll for job status
      pollJobStatus(jobId);
      
    } catch (err: any) {
      console.error('Bulk generation error:', err);
      setError(getErrorMessage(err) || 'Failed to start bulk generation');
      setShowProgressModal(false);
    } finally {
      setLoading(false);
    }
  };

  const pollJobStatus = async (jobId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await api.get(`/admin/certificates/job-status/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        setGenerationJob(response.data);
        
        if (response.data.status === 'completed') {
          setSuccess(`Bulk certificate generation completed! Generated ${response.data.total} certificates.`);
          clearInterval(pollInterval);
          setShowProgressModal(false);
          
          // Reset form
          setBulkForm({ eventId: '', templateId: '', csvFile: null });
          setCsvData([]);
          setCsvPreview([]);
          
        } else if (response.data.status === 'failed') {
          setError(`Bulk generation failed: ${response.data.message}`);
          clearInterval(pollInterval);
          setShowProgressModal(false);
        }
        
      } catch (err) {
        console.error('Error polling job status:', err);
        clearInterval(pollInterval);
        setShowProgressModal(false);
      }
    }, 2000); // Poll every 2 seconds
  };

  const showCsvPreview = () => {
    setShowPreviewModal(true);
  };

  if (loading && templates.length === 0) {
    return (
      <Container className="mt-4">
        <div className="text-center">
          <Spinner animation="border" role="status" />
          <p className="mt-2">Loading...</p>
        </div>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      <Row>
        <Col>
          <h2>
            <i className="fas fa-certificate me-2"></i>
            Certificate Generation
          </h2>
          <p className="text-muted">Generate individual or bulk certificates for events</p>
        </Col>
      </Row>

      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* Tab Selection */}
      <Row className="mb-4">
        <Col>
          <div className="d-flex gap-2">
            <Button
              variant={activeTab === 'single' ? 'primary' : 'outline-primary'}
              onClick={() => setActiveTab('single')}
            >
              <i className="fas fa-user me-2"></i>Single Certificate
            </Button>
            <Button
              variant={activeTab === 'bulk' ? 'primary' : 'outline-primary'}
              onClick={() => setActiveTab('bulk')}
            >
              <i className="fas fa-users me-2"></i>Bulk Generation
            </Button>
          </div>
        </Col>
      </Row>

      {/* Single Certificate Generation */}
      {activeTab === 'single' && (
        <Row>
          <Col md={8}>
            <Card>
              <Card.Header>
                <h5><i className="fas fa-user me-2"></i>Generate Single Certificate</h5>
              </Card.Header>
              <Card.Body>
                <Form onSubmit={generateSingleCertificate}>
                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Event *</Form.Label>
                        <Form.Select
                          value={singleForm.eventId}
                          onChange={(e) => handleSingleFormChange('eventId', e.target.value)}
                          required
                        >
                          <option value="">Select Event</option>
                          {events.filter(e => e.status === 'approved').map(event => (
                            <option key={event.id} value={event.id}>
                              {event.name}
                            </option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Certificate Template *</Form.Label>
                        <div className="d-flex gap-2">
                          <Form.Select
                            value={singleForm.templateId}
                            onChange={(e) => handleSingleFormChange('templateId', e.target.value)}
                            required
                            className="flex-grow-1"
                          >
                            <option value="">Select Template</option>
                            {templates.map(template => (
                              <option key={template.id} value={template.id}>
                                {template.name}
                              </option>
                            ))}
                          </Form.Select>
                          <Button 
                            variant="outline-primary" 
                            onClick={() => setShowTemplateManager(true)}
                            title="Manage Templates"
                          >
                            <FontAwesomeIcon icon={faPalette} />
                          </Button>
                        </div>
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Recipient Name *</Form.Label>
                        <Form.Control
                          type="text"
                          value={singleForm.recipientName}
                          onChange={(e) => handleSingleFormChange('recipientName', e.target.value)}
                          required
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Recipient Email *</Form.Label>
                        <Form.Control
                          type="email"
                          value={singleForm.recipientEmail}
                          onChange={(e) => handleSingleFormChange('recipientEmail', e.target.value)}
                          required
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Employee ID</Form.Label>
                        <Form.Control
                          type="text"
                          value={singleForm.employeeId}
                          onChange={(e) => handleSingleFormChange('employeeId', e.target.value)}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Department</Form.Label>
                        <Form.Control
                          type="text"
                          value={singleForm.department}
                          onChange={(e) => handleSingleFormChange('department', e.target.value)}
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Position</Form.Label>
                        <Form.Control
                          type="text"
                          value={singleForm.position}
                          onChange={(e) => handleSingleFormChange('position', e.target.value)}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Company</Form.Label>
                        <Form.Control
                          type="text"
                          value={singleForm.company}
                          onChange={(e) => handleSingleFormChange('company', e.target.value)}
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Button type="submit" variant="primary" disabled={loading}>
                    {loading ? (
                      <>
                        <Spinner size="sm" animation="border" className="me-2" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-certificate me-2"></i>Generate Certificate
                      </>
                    )}
                  </Button>
                </Form>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

      {/* Bulk Certificate Generation */}
      {activeTab === 'bulk' && (
        <Row>
          <Col md={8}>
            <Card>
              <Card.Header>
                <h5><i className="fas fa-users me-2"></i>Bulk Certificate Generation</h5>
              </Card.Header>
              <Card.Body>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Event *</Form.Label>
                      <Form.Select
                        value={bulkForm.eventId}
                        onChange={(e) => handleBulkFormChange('eventId', e.target.value)}
                        required
                      >
                        <option value="">Select Event</option>
                        {events.filter(e => e.status === 'approved').map(event => (
                          <option key={event.id} value={event.id}>
                            {event.name}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Certificate Template *</Form.Label>
                      <div className="d-flex gap-2">
                        <Form.Select
                          value={bulkForm.templateId}
                          onChange={(e) => handleBulkFormChange('templateId', e.target.value)}
                          required
                          className="flex-grow-1"
                        >
                          <option value="">Select Template</option>
                          {templates.map(template => (
                            <option key={template.id} value={template.id}>
                              {template.name}
                            </option>
                          ))}
                        </Form.Select>
                        <Button 
                          variant="outline-primary" 
                          onClick={() => setShowTemplateManager(true)}
                          title="Manage Templates"
                        >
                          <FontAwesomeIcon icon={faPalette} />
                        </Button>
                      </div>
                    </Form.Group>
                  </Col>
                </Row>

                <Form.Group className="mb-3">
                  <Form.Label>Upload CSV File *</Form.Label>
                  <Form.Control
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileUpload}
                  />
                  <Form.Text className="text-muted">
                    Upload a CSV or Excel file with columns: full_name, email, employee_id (optional), department (optional), position (optional), company (optional)
                  </Form.Text>
                </Form.Group>

                {csvData.length > 0 && (
                  <div className="mb-3">
                    <p>
                      <i className="fas fa-check-circle text-success me-2"></i>
                      File uploaded successfully! Found <strong>{csvData.length} records</strong>
                    </p>
                    <div className="d-flex gap-2">
                      <Button variant="outline-primary" size="sm" onClick={showCsvPreview}>
                        <i className="fas fa-eye me-2"></i>Preview Data
                      </Button>
                      <Button variant="primary" onClick={generateBulkCertificates} disabled={loading}>
                        {loading ? (
                          <>
                            <Spinner size="sm" animation="border" className="me-2" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <i className="fas fa-certificate me-2"></i>Generate {csvData.length} Certificates
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>

          <Col md={4}>
            <Card>
              <Card.Header>
                <h6><i className="fas fa-info-circle me-2"></i>CSV File Requirements</h6>
              </Card.Header>
              <Card.Body>
                <p className="small mb-2"><strong>Required Columns:</strong></p>
                <ul className="small mb-3">
                  <li><code>full_name</code> - Recipient's full name</li>
                  <li><code>email</code> - Recipient's email address</li>
                </ul>
                
                <p className="small mb-2"><strong>Optional Columns:</strong></p>
                <ul className="small mb-3">
                  <li><code>employee_id</code> - Employee ID</li>
                  <li><code>department</code> - Department name</li>
                  <li><code>position</code> - Job position</li>
                  <li><code>company</code> - Company name</li>
                </ul>
                
                <p className="small text-muted">
                  <i className="fas fa-lightbulb me-1"></i>
                  Make sure email addresses are unique and valid to avoid generation errors.
                </p>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

      {/* CSV Preview Modal */}
      <Modal show={showPreviewModal} onHide={() => setShowPreviewModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>CSV Data Preview</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Showing first 5 records from your CSV file:</p>
          {csvPreview.length > 0 && (
            <Table striped bordered hover responsive size="sm">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Employee ID</th>
                  <th>Department</th>
                  <th>Position</th>
                  <th>Company</th>
                </tr>
              </thead>
              <tbody>
                {csvPreview.map((record, index) => (
                  <tr key={index}>
                    <td>{record.full_name}</td>
                    <td>{record.email}</td>
                    <td>{record.employee_id || '-'}</td>
                    <td>{record.department || '-'}</td>
                    <td>{record.position || '-'}</td>
                    <td>{record.company || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowPreviewModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Progress Modal */}
      <Modal show={showProgressModal} backdrop="static" keyboard={false}>
        <Modal.Header>
          <Modal.Title>Generating Certificates</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {generationJob && (
            <div>
              <p className="mb-3">{generationJob.message}</p>
              <ProgressBar 
                now={generationJob.progress} 
                label={`${generationJob.current}/${generationJob.total}`}
                className="mb-3"
              />
              <div className="d-flex justify-content-between">
                <small className="text-muted">Status: </small>
                <Badge bg={generationJob.status === 'processing' ? 'primary' : 'success'}>
                  {generationJob.status}
                </Badge>
              </div>
            </div>
          )}
        </Modal.Body>
      </Modal>

      {/* Template Manager Modal */}
      <TemplateManager
        show={showTemplateManager}
        onHide={() => setShowTemplateManager(false)}
        onTemplateSelect={(template) => {
          // Update both forms with the selected template
          setSingleForm(prev => ({ ...prev, templateId: template.id.toString() }));
          setBulkForm(prev => ({ ...prev, templateId: template.id.toString() }));
          setShowTemplateManager(false);
          // Refresh templates list
          loadInitialData();
        }}
      />
    </Container>
  );
};

export default CertificateGeneration;
