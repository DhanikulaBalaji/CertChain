import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Row, Col, Card, Alert, Spinner, Image } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPlus, 
  faUpload, 
  faEdit, 
  faTrash, 
  faEye, 
  faImage,
  faFileImage,
  faPalette,
  faCheckCircle,
  faTimesCircle
} from '@fortawesome/free-solid-svg-icons';
import api from '../services/api';

interface Template {
  id: number;
  name: string;
  description?: string;
  background_image_path?: string;
  logo_path?: string;
  created_at: string;
  updated_at: string;
}

interface TemplateManagerProps {
  show: boolean;
  onHide: () => void;
  onTemplateSelect?: (template: Template) => void;
  selectedTemplateId?: number;
}

const TemplateManager: React.FC<TemplateManagerProps> = ({ 
  show, 
  onHide, 
  onTemplateSelect,
  selectedTemplateId 
}) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });
  const [backgroundImage, setBackgroundImage] = useState<File | null>(null);
  const [logoImage, setLogoImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (show) {
      fetchTemplates();
    }
  }, [show]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const response = await api.get('/templates/');
      setTemplates(response.data);
    } catch (err: any) {
      setError('Failed to fetch templates');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!formData.name.trim()) {
      setError('Template name is required');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      if (formData.description) {
        formDataToSend.append('description', formData.description);
      }
      if (backgroundImage) {
        formDataToSend.append('background_image', backgroundImage);
      }
      if (logoImage) {
        formDataToSend.append('logo_image', logoImage);
      }

      await api.post('/templates/', formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      // Reset form
      setFormData({ name: '', description: '' });
      setBackgroundImage(null);
      setLogoImage(null);
      setShowCreateForm(false);
      
      // Refresh templates
      await fetchTemplates();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create template');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditTemplate = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || ''
    });
    setShowCreateForm(true);
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate || !formData.name.trim()) {
      setError('Template name is required');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      if (formData.description) {
        formDataToSend.append('description', formData.description);
      }
      if (backgroundImage) {
        formDataToSend.append('background_image', backgroundImage);
      }
      if (logoImage) {
        formDataToSend.append('logo_image', logoImage);
      }

      await api.put(`/templates/${editingTemplate.id}`, formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      // Reset form
      setFormData({ name: '', description: '' });
      setBackgroundImage(null);
      setLogoImage(null);
      setShowCreateForm(false);
      setEditingTemplate(null);
      
      // Refresh templates
      await fetchTemplates();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update template');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTemplate = async (templateId: number) => {
    if (!window.confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      await api.delete(`/templates/${templateId}`);
      await fetchTemplates();
    } catch (err: any) {
      setError('Failed to delete template');
    }
  };

  const handlePreviewTemplate = async (templateId: number) => {
    try {
      const response = await api.get(`/templates/${templateId}/preview`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      window.open(url, '_blank');
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError('Failed to preview template');
    }
  };

  const resetForm = () => {
    setFormData({ name: '', description: '' });
    setBackgroundImage(null);
    setLogoImage(null);
    setShowCreateForm(false);
    setEditingTemplate(null);
    setError(null);
  };

  return (
    <Modal show={show} onHide={onHide} size="xl" scrollable>
      <Modal.Header closeButton>
        <Modal.Title>
          <FontAwesomeIcon icon={faPalette} className="me-2" />
          Template Manager
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && (
          <Alert variant="danger" dismissible onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Create/Edit Form */}
        {showCreateForm && (
          <Card className="mb-4">
            <Card.Header>
              <h6 className="mb-0">
                <FontAwesomeIcon icon={editingTemplate ? faEdit : faPlus} className="me-2" />
                {editingTemplate ? 'Edit Template' : 'Create New Template'}
              </h6>
            </Card.Header>
            <Card.Body>
              <Form>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Template Name *</Form.Label>
                      <Form.Control
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Enter template name"
                        required
                      />
                    </Form.Group>
                    
                    <Form.Group className="mb-3">
                      <Form.Label>Description</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={3}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Enter template description"
                      />
                    </Form.Group>
                  </Col>
                  
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Background Image</Form.Label>
                      <Form.Control
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          setBackgroundImage(file || null);
                        }}
                      />
                      <Form.Text className="text-muted">
                        Upload a background image for the certificate
                      </Form.Text>
                    </Form.Group>
                    
                    <Form.Group className="mb-3">
                      <Form.Label>Logo Image</Form.Label>
                      <Form.Control
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          setLogoImage(file || null);
                        }}
                      />
                      <Form.Text className="text-muted">
                        Upload a logo to be placed on the certificate
                      </Form.Text>
                    </Form.Group>
                  </Col>
                </Row>
                
                <div className="d-flex gap-2">
                  <Button 
                    variant="primary" 
                    onClick={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Spinner animation="border" size="sm" className="me-2" />
                        {editingTemplate ? 'Updating...' : 'Creating...'}
                      </>
                    ) : (
                      <>
                        <FontAwesomeIcon icon={editingTemplate ? faEdit : faPlus} className="me-2" />
                        {editingTemplate ? 'Update Template' : 'Create Template'}
                      </>
                    )}
                  </Button>
                  <Button variant="secondary" onClick={resetForm}>
                    Cancel
                  </Button>
                </div>
              </Form>
            </Card.Body>
          </Card>
        )}

        {/* Templates Grid */}
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6>Available Templates</h6>
          {!showCreateForm && (
            <Button variant="primary" onClick={() => setShowCreateForm(true)}>
              <FontAwesomeIcon icon={faPlus} className="me-2" />
              Create New Template
            </Button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-4">
            <Spinner animation="border" variant="primary" />
            <p className="mt-2">Loading templates...</p>
          </div>
        ) : (
          <Row>
            {templates.length === 0 ? (
              <Col>
                <Alert variant="info">
                  <FontAwesomeIcon icon={faImage} className="me-2" />
                  No templates found. Create your first template to get started.
                </Alert>
              </Col>
            ) : (
              templates.map((template) => (
                <Col md={6} lg={4} key={template.id} className="mb-3">
                  <Card 
                    className={`h-100 ${selectedTemplateId === template.id ? 'border-primary' : ''}`}
                    style={{ cursor: onTemplateSelect ? 'pointer' : 'default' }}
                    onClick={() => onTemplateSelect?.(template)}
                  >
                    <Card.Header className="d-flex justify-content-between align-items-center">
                      <div className="d-flex align-items-center">
                        <FontAwesomeIcon icon={faFileImage} className="me-2 text-primary" />
                        <strong>{template.name}</strong>
                      </div>
                      {selectedTemplateId === template.id && (
                        <FontAwesomeIcon icon={faCheckCircle} className="text-success" />
                      )}
                    </Card.Header>
                    <Card.Body>
                      <p className="text-muted small">
                        {template.description || 'No description available'}
                      </p>
                      
                      <div className="mb-3">
                        <small className="text-muted">
                          Created: {new Date(template.created_at).toLocaleDateString()}
                        </small>
                      </div>
                      
                      <div className="d-flex gap-2">
                        <Button 
                          variant="outline-primary" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreviewTemplate(template.id);
                          }}
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </Button>
                        <Button 
                          variant="outline-secondary" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditTemplate(template);
                          }}
                        >
                          <FontAwesomeIcon icon={faEdit} />
                        </Button>
                        <Button 
                          variant="outline-danger" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTemplate(template.id);
                          }}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </Button>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              ))
            )}
          </Row>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
        {onTemplateSelect && selectedTemplateId && (
          <Button variant="primary" onClick={onHide}>
            Use Selected Template
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default TemplateManager;
