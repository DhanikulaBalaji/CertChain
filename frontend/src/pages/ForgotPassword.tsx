import React, { useState } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import api from '../services/api';

interface ForgotPasswordFormData {
  email: string;
}

const ForgotPassword: React.FC = () => {
  const [formData, setFormData] = useState<ForgotPasswordFormData>({
    email: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email) {
      setError('Please enter your email address');
      return;
    }

    if (!isValidEmail(formData.email)) {
      setError('Please enter a valid email address');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/forgot-password', {
        email: formData.email
      });

      if (response.data.success) {
        setSuccess(true);
        setFormData({ email: '' });
      } else {
        setError(response.data.message || 'Failed to send reset email');
      }
    } catch (err: any) {
      setError(
        err.response?.data?.detail || 
        err.response?.data?.message || 
        'Failed to send reset email. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  if (success) {
    return (
      <Container className="min-vh-100 d-flex align-items-center justify-content-center">
        <Row className="w-100">
          <Col md={6} lg={4} className="mx-auto">
            <Card className="shadow-sm">
              <Card.Body className="p-4">
                <div className="text-center mb-4">
                  <FontAwesomeIcon icon={faEnvelope} size="3x" className="text-success mb-3" />
                  <h3 className="text-success">Check Your Email</h3>
                  <p className="text-muted">
                    We've sent a password reset link to <strong>{formData.email}</strong>
                  </p>
                  <p className="text-muted small">
                    If you don't see the email, check your spam folder.
                  </p>
                </div>
                
                <div className="d-grid">
                  <Link to="/login" className="btn btn-primary">
                    <FontAwesomeIcon icon={faArrowLeft} className="me-2" />
                    Back to Login
                  </Link>
                </div>
                
                <div className="text-center mt-3">
                  <Button 
                    variant="link" 
                    className="text-decoration-none small"
                    onClick={() => setSuccess(false)}
                  >
                    Try a different email
                  </Button>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    );
  }

  return (
    <Container className="min-vh-100 d-flex align-items-center justify-content-center">
      <Row className="w-100">
        <Col md={6} lg={4} className="mx-auto">
          <Card className="shadow-sm">
            <Card.Body className="p-4">
              <div className="text-center mb-4">
                <h2 className="mb-1">Forgot Password?</h2>
                <p className="text-muted">
                  Enter your email address and we'll send you a link to reset your password.
                </p>
              </div>

              {error && (
                <Alert variant="danger" className="mb-3">
                  {error}
                </Alert>
              )}

              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label>
                    <FontAwesomeIcon icon={faEnvelope} className="me-2" />
                    Email Address
                  </Form.Label>
                  <Form.Control
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="Enter your email address"
                    required
                    disabled={loading}
                  />
                </Form.Group>

                <div className="d-grid mb-3">
                  <Button 
                    variant="primary" 
                    type="submit" 
                    disabled={loading}
                    size="lg"
                  >
                    {loading ? (
                      <>
                        <Spinner
                          as="span"
                          animation="border"
                          size="sm"
                          role="status"
                          aria-hidden="true"
                          className="me-2"
                        />
                        Sending Reset Link...
                      </>
                    ) : (
                      <>
                        <FontAwesomeIcon icon={faEnvelope} className="me-2" />
                        Send Reset Link
                      </>
                    )}
                  </Button>
                </div>
              </Form>

              <div className="text-center">
                <Link 
                  to="/login" 
                  className="text-decoration-none"
                >
                  <FontAwesomeIcon icon={faArrowLeft} className="me-2" />
                  Back to Login
                </Link>
              </div>

              <hr className="my-4" />

              <div className="text-center">
                <p className="text-muted small mb-0">
                  Don't have an account?{' '}
                  <Link to="/register" className="text-decoration-none">
                    Sign up here
                  </Link>
                </p>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default ForgotPassword;
