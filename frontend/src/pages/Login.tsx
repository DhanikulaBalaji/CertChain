import React, { useState } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faEnvelope, faSignInAlt, faUserPlus, faKey, faInfoCircle, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';

const Login: React.FC = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Use the AuthContext login method
      await login(formData.email, formData.password);
      
      // Get user from localStorage (set by AuthContext)
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        
        // Redirect based on user role
        switch (user.role) {
          case 'super_admin':
            navigate('/super-admin-dashboard');
            break;
          case 'admin':
            navigate('/admin-dashboard');
            break;
          case 'user':
            navigate('/dashboard');
            break;
          default:
            navigate('/dashboard');
        }
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="py-5">
      <Row className="justify-content-center">
        <Col md={6} lg={4}>
          <Card className="shadow-lg">
            <Card.Header className="bg-primary text-white text-center py-4">
              <h3 className="mb-0">🔐 Login</h3>
              <p className="mb-0 mt-2">Secure Certificate System</p>
            </Card.Header>
            <Card.Body className="p-4">
              {error && (
                <Alert variant="danger" className="mb-3">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="me-2" />
                  {error}
                </Alert>
              )}
              
              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label>
                    <FontAwesomeIcon icon={faEnvelope} className="me-2" />Email Address
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

                <Form.Group className="mb-4">
                  <Form.Label>
                    <FontAwesomeIcon icon={faLock} className="me-2" />Password
                  </Form.Label>
                  <Form.Control
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Enter your password"
                    required
                    disabled={loading}
                  />
                </Form.Group>

                <Button
                  variant="primary"
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
                      Logging in...
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faSignInAlt} className="me-2" />
                      Login
                    </>
                  )}
                </Button>
              </Form>
              
              <div className="text-center mt-4">
                <p className="text-muted mb-2">Don't have an account?</p>
                <Link to="/register" className="btn btn-outline-secondary">
                  <FontAwesomeIcon icon={faUserPlus} className="me-2" />
                  Create Account
                </Link>
              </div>
              
              <div className="text-center mt-3">
                <Link to="/forgot-password" className="text-muted">
                  <FontAwesomeIcon icon={faKey} className="me-1" />
                  Forgot Password?
                </Link>
              </div>
            </Card.Body>
          </Card>
          
          {/* Demo Credentials */}
          <Card className="mt-3 bg-light">
            <Card.Body className="p-3">
              <h6 className="text-muted mb-2">
                <FontAwesomeIcon icon={faInfoCircle} className="me-2" />Demo Credentials:
              </h6>
              <div className="small text-muted">
                <strong>Super Admin:</strong> superadmin@certificate-system.com / SuperAdmin123!<br />
                <strong>Admin:</strong> admin@certificate-system.com / Admin123!<br />
                <strong>User:</strong> testuser@certificate-system.com / User123!
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default Login;
