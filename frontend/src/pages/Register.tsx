import React, { useState } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import api from '../services/api';

interface RegisterFormData {
  email: string;
  password: string;
  confirmPassword: string;
  full_name: string;
}

const Register: React.FC = () => {
  const [formData, setFormData] = useState<RegisterFormData>({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const validateForm = (): boolean => {
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);

    try {
      const registrationData = {
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
        role: "user"
      };

      await api.post('/auth/register', registrationData);
      setSuccess(true);
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(
        err.response?.data?.detail || 
        err.response?.data?.message || 
        'Registration failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Container className="py-5">
        <Row className="justify-content-center">
          <Col md={6} lg={4}>
            <Card className="shadow-lg">
              <Card.Header className="bg-success text-white text-center py-4">
                <h3 className="mb-0">✅ Registration Successful</h3>
              </Card.Header>
              <Card.Body className="p-4 text-center">
                <Alert variant="success" className="mb-3">
                  <i className="fas fa-check-circle me-2"></i>
                  Your account has been created successfully!
                </Alert>
                <p className="text-muted mb-4">
                  Your account is pending approval from a Super Administrator. 
                  You will receive an email notification once your account is activated.
                </p>
                <Link to="/login" className="btn btn-primary">
                  <i className="fas fa-sign-in-alt me-2"></i>
                  Go to Login
                </Link>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    );
  }

  return (
    <Container className="py-5">
      <Row className="justify-content-center">
        <Col md={6} lg={5}>
          <Card className="shadow-lg">
            <Card.Header className="bg-success text-white text-center py-4">
              <h3 className="mb-0">👤 Create Account</h3>
              <p className="mb-0 mt-2">Join the Secure Certificate System</p>
            </Card.Header>
            <Card.Body className="p-4">
              {error && (
                <Alert variant="danger" className="mb-3">
                  <i className="fas fa-exclamation-triangle me-2"></i>
                  {error}
                </Alert>
              )}
              
              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label>
                    <i className="fas fa-user me-2"></i>Full Name
                  </Form.Label>
                  <Form.Control
                    type="text"
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleChange}
                    placeholder="Enter your full name"
                    required
                    disabled={loading}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>
                    <i className="fas fa-envelope me-2"></i>Email Address
                  </Form.Label>
                  <Form.Control
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Enter your email"
                    required
                    disabled={loading}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>
                    <i className="fas fa-lock me-2"></i>Password
                  </Form.Label>
                  <Form.Control
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Create a password (min 6 characters)"
                    required
                    disabled={loading}
                  />
                </Form.Group>

                <Form.Group className="mb-4">
                  <Form.Label>
                    <i className="fas fa-lock me-2"></i>Confirm Password
                  </Form.Label>
                  <Form.Control
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Confirm your password"
                    required
                    disabled={loading}
                  />
                </Form.Group>

                <Alert variant="info" className="mb-3">
                  <i className="fas fa-info-circle me-2"></i>
                  <small>
                    <strong>Note:</strong> New accounts require Super Administrator approval 
                    before you can log in. You'll receive an email when your account is activated.
                  </small>
                </Alert>

                <Button
                  variant="success"
                  type="submit"
                  className="w-100 py-2"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Spinner
                        as="span"
                        animation="border"
                        size="sm"
                        role="status"
                        className="me-2"
                      />
                      Creating Account...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-user-plus me-2"></i>
                      Create Account
                    </>
                  )}
                </Button>
              </Form>
              
              <div className="text-center mt-4">
                <p className="text-muted mb-2">Already have an account?</p>
                <Link to="/login" className="btn btn-outline-primary">
                  <i className="fas fa-sign-in-alt me-2"></i>
                  Login Instead
                </Link>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default Register;
