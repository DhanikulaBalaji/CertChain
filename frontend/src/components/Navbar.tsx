import React, { useState, useEffect } from 'react';
import { Navbar, Nav, NavDropdown, Container, Badge } from 'react-bootstrap';
import { LinkContainer } from 'react-router-bootstrap';
import { useAuth } from '../services/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faCertificate, 
  faTachometerAlt, 
  faUser, 
  faSignOutAlt, 
  faCog, 
  faCalendarAlt, 
  faUsersCog, 
  faShieldAlt, 
  faUsers, 
  faCheckDouble,
  faServer,
  faUserCircle,
  faSignInAlt,
  faUserPlus,
  faBell
} from '@fortawesome/free-solid-svg-icons';
import NotificationCenter from './NotificationCenter';
import api from '../services/api';

const NavigationBar: React.FC = () => {
  const { user, logout } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bellAnimation, setBellAnimation] = useState(false);

  useEffect(() => {
    if (user) {
      fetchUnreadCount();
      // Set up polling for new notifications - reduced frequency
      const interval = setInterval(fetchUnreadCount, 120000); // Check every 2 minutes
      return () => clearInterval(interval);
    }
  }, [user]);

  const fetchUnreadCount = async () => {
    try {
      const response = await api.get('/notifications/unread-count');
      const newCount = response.data?.unread_count || 0;
      
      // Animate bell if new notifications arrived
      if (newCount > unreadCount) {
        setBellAnimation(true);
        setTimeout(() => setBellAnimation(false), 500);
      }
      
      setUnreadCount(newCount);
    } catch (error) {
      // Silently fail - don't spam console in production
      setUnreadCount(0);
    }
  };

  const handleNotificationUpdate = () => {
    fetchUnreadCount();
  };

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <Navbar bg="dark" variant="dark" expand="lg" className="animated-navbar">
      <Container>
        <LinkContainer to="/">
          <Navbar.Brand>
            <FontAwesomeIcon icon={faCertificate} className="me-2" />
            Certificate System
          </Navbar.Brand>
        </LinkContainer>
        
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="me-auto">
            <LinkContainer to="/dashboard">
              <Nav.Link>
                <FontAwesomeIcon icon={faTachometerAlt} className="me-1" />
                Dashboard
              </Nav.Link>
            </LinkContainer>
            
            <LinkContainer to="/validate-certificate">
              <Nav.Link>
                <FontAwesomeIcon icon={faShieldAlt} className="me-1" />
                Validate Certificate
              </Nav.Link>
            </LinkContainer>

            {user && user.role === 'user' && (
              <LinkContainer to="/my-certificates">
                <Nav.Link>
                  <FontAwesomeIcon icon={faCertificate} className="me-1" />
                  My Certificates
                </Nav.Link>
              </LinkContainer>
            )}

            {user && (user.role === 'admin' || user.role === 'super_admin') && (
              <>
                <NavDropdown title={
                  <span>
                    <FontAwesomeIcon icon={faCog} className="me-1" />
                    Management
                  </span>
                } id="admin-nav-dropdown">
                  <LinkContainer to="/create-event">
                    <NavDropdown.Item>
                      <FontAwesomeIcon icon={faCalendarAlt} className="me-2" />
                      Create Event
                    </NavDropdown.Item>
                  </LinkContainer>
                  <LinkContainer to="/generate-certificates">
                    <NavDropdown.Item>
                      <FontAwesomeIcon icon={faCertificate} className="me-2" />
                      Generate Certificates
                    </NavDropdown.Item>
                  </LinkContainer>
                  <LinkContainer to="/bulk-certificates">
                    <NavDropdown.Item>
                      <FontAwesomeIcon icon={faCheckDouble} className="me-2" />
                      Bulk Certificate Generation
                    </NavDropdown.Item>
                  </LinkContainer>
                </NavDropdown>
              </>
            )}

            {user && user.role === 'super_admin' && (
              <NavDropdown title={
                <span>
                  <FontAwesomeIcon icon={faUsersCog} className="me-1" />
                  Admin
                </span>
              } id="super-admin-nav-dropdown">
                <LinkContainer to="/users">
                  <NavDropdown.Item>
                    <FontAwesomeIcon icon={faUsers} className="me-2" />
                    User Management
                  </NavDropdown.Item>
                </LinkContainer>
                <LinkContainer to="/approvals">
                  <NavDropdown.Item>
                    <FontAwesomeIcon icon={faCheckDouble} className="me-2" />
                    Approvals
                  </NavDropdown.Item>
                </LinkContainer>
                <LinkContainer to="/system">
                  <NavDropdown.Item>
                    <FontAwesomeIcon icon={faServer} className="me-2" />
                    System Info
                  </NavDropdown.Item>
                </LinkContainer>
              </NavDropdown>
            )}
          </Nav>

          <Nav>
            {user ? (
              <>
                {/* Notification Bell */}
                <Nav.Link 
                  onClick={() => setShowNotifications(true)}
                  className="position-relative me-3 notification-bell"
                  style={{ zIndex: 1029 }}
                >
                  <FontAwesomeIcon 
                    icon={faBell} 
                    className={`me-1 ${bellAnimation ? 'notification-bell-animation' : ''}`}
                  />
                  {unreadCount > 0 && (
                    <Badge 
                      bg="danger" 
                      pill 
                      className="position-absolute top-0 start-100 translate-middle"
                      style={{ fontSize: '0.6rem', zIndex: 1030 }}
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Badge>
                  )}
                </Nav.Link>

                <NavDropdown 
                  title={
                    <span>
                      <FontAwesomeIcon icon={faUserCircle} className="me-1" />
                      {user.full_name}
                    </span>
                  } 
                  id="user-nav-dropdown" 
                  align="end"
                  className="user-dropdown"
                >
                  <NavDropdown.Header>
                    <small className="text-muted">{user.email}</small><br />
                    <span className={`badge ${
                      user.role === 'super_admin' ? 'bg-danger' :
                      user.role === 'admin' ? 'bg-warning' : 'bg-primary'
                    }`}>
                      {user.role.replace('_', ' ').toUpperCase()}
                    </span>
                  </NavDropdown.Header>
                  <NavDropdown.Divider />
                  <LinkContainer to="/profile">
                    <NavDropdown.Item>
                      <FontAwesomeIcon icon={faUser} className="me-2" />
                      Profile
                    </NavDropdown.Item>
                  </LinkContainer>
                  <LinkContainer to="/personal-certificates">
                    <NavDropdown.Item>
                      <FontAwesomeIcon icon={faCertificate} className="me-2" />
                      My Certificates
                    </NavDropdown.Item>
                  </LinkContainer>
                  <NavDropdown.Divider />
                  <NavDropdown.Item onClick={handleLogout} className="logout-item">
                    <FontAwesomeIcon icon={faSignOutAlt} className="me-2" />
                    Logout
                  </NavDropdown.Item>
                </NavDropdown>
              </>
            ) : (
              <>
                <LinkContainer to="/login">
                  <Nav.Link>
                    <FontAwesomeIcon icon={faSignInAlt} className="me-1" />
                    Login
                  </Nav.Link>
                </LinkContainer>
                <LinkContainer to="/register">
                  <Nav.Link>
                    <FontAwesomeIcon icon={faUserPlus} className="me-1" />
                    Register
                  </Nav.Link>
                </LinkContainer>
              </>
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>
      
      {/* Notification Center Modal */}
      {user && (
        <NotificationCenter
          show={showNotifications}
          onHide={() => setShowNotifications(false)}
          onNotificationUpdate={handleNotificationUpdate}
        />
      )}
    </Navbar>
  );
};

export default NavigationBar;
