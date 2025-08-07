import React, { useState, useEffect } from 'react';
import { 
  Modal, 
  Tab, 
  Tabs, 
  Badge, 
  ListGroup, 
  Button, 
  Spinner, 
  Alert,
  Row,
  Col,
  Card
} from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faBell,
  faEnvelope,
  faEnvelopeOpen,
  faTrash,
  faCheckCircle,
  faExclamationTriangle,
  faInfoCircle,
  faTimes,
  faClock,
  faCertificate,
  faCalendarAlt,
  faUserShield
} from '@fortawesome/free-solid-svg-icons';
import api from '../services/api';
import './NotificationCenter.css';

interface Notification {
  id: number;
  title: string;
  message: string;
  notification_type: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationCenterProps {
  show: boolean;
  onHide: () => void;
  onNotificationUpdate?: () => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ show, onHide, onNotificationUpdate }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    if (show) {
      fetchNotifications();
    }
  }, [show]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const [allRes, unreadRes] = await Promise.all([
        api.get('/notifications/'),
        api.get('/notifications/?unread_only=true')
      ]);
      
      setNotifications(allRes.data);
      setUnreadNotifications(unreadRes.data);
    } catch (err: any) {
      setError('Failed to load notifications');
      console.error('Notification error:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: number) => {
    try {
      await api.put(`/notifications/${notificationId}/mark-read`);
      await fetchNotifications();
      onNotificationUpdate?.();
    } catch (err: any) {
      console.error('Error marking notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/mark-all-read');
      await fetchNotifications();
      onNotificationUpdate?.();
    } catch (err: any) {
      console.error('Error marking all as read:', err);
    }
  };

  const deleteNotification = async (notificationId: number) => {
    try {
      await api.delete(`/notifications/${notificationId}`);
      await fetchNotifications();
      onNotificationUpdate?.();
    } catch (err: any) {
      console.error('Error deleting notification:', err);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'certificate_issued':
        return faCertificate;
      case 'certificate_revoked':
        return faExclamationTriangle;
      case 'event_approved':
        return faCheckCircle;
      case 'event_rejected':
        return faTimes;
      case 'event_created':
        return faCalendarAlt;
      case 'admin_approved':
        return faUserShield;
      default:
        return faInfoCircle;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'certificate_issued':
        return 'success';
      case 'certificate_revoked':
        return 'danger';
      case 'event_approved':
        return 'success';
      case 'event_rejected':
        return 'danger';
      case 'event_created':
        return 'info';
      case 'admin_approved':
        return 'primary';
      default:
        return 'secondary';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
    }
  };

  const renderNotificationList = (notificationList: Notification[]) => {
    if (loading) {
      return (
        <div className="text-center p-4">
          <Spinner animation="border" variant="primary" />
          <p className="mt-2">Loading notifications...</p>
        </div>
      );
    }

    if (notificationList.length === 0) {
      return (
        <div className="text-center p-4">
          <FontAwesomeIcon icon={faBell} size="3x" className="text-muted mb-3" />
          <p className="text-muted">No notifications found</p>
        </div>
      );
    }

    return (
      <ListGroup variant="flush" className="notification-list">
        {notificationList.map((notification) => (
          <ListGroup.Item
            key={notification.id}
            className={`notification-item ${!notification.is_read ? 'unread' : ''}`}
          >
            <Row className="align-items-start">
              <Col xs={2} className="text-center">
                <div className={`notification-icon notification-icon-${getNotificationColor(notification.notification_type)}`}>
                  <FontAwesomeIcon 
                    icon={getNotificationIcon(notification.notification_type)} 
                    className="fa-lg"
                  />
                </div>
              </Col>
              <Col xs={8}>
                <div className="notification-content">
                  <h6 className="mb-1 fw-bold">{notification.title}</h6>
                  <p className="mb-1 text-muted small">{notification.message}</p>
                  <small className="text-muted">
                    <FontAwesomeIcon icon={faClock} className="me-1" />
                    {formatDate(notification.created_at)}
                  </small>
                </div>
              </Col>
              <Col xs={2} className="text-end">
                <div className="notification-actions">
                  {!notification.is_read && (
                    <Button
                      size="sm"
                      variant="outline-primary"
                      onClick={() => markAsRead(notification.id)}
                      className="me-1 mb-1"
                      title="Mark as read"
                    >
                      <FontAwesomeIcon icon={faEnvelopeOpen} />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline-danger"
                    onClick={() => deleteNotification(notification.id)}
                    title="Delete notification"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </Button>
                </div>
              </Col>
            </Row>
            {!notification.is_read && (
              <div className="unread-indicator">
                <Badge bg="primary" pill>New</Badge>
              </div>
            )}
          </ListGroup.Item>
        ))}
      </ListGroup>
    );
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" className="notification-center-modal">
      <Modal.Header closeButton className="notification-header">
        <Modal.Title>
          <FontAwesomeIcon icon={faBell} className="me-2" />
          Notification Center
          {unreadNotifications.length > 0 && (
            <Badge bg="danger" className="ms-2">
              {unreadNotifications.length}
            </Badge>
          )}
        </Modal.Title>
      </Modal.Header>
      
      <Modal.Body className="p-0">
        {error && (
          <Alert variant="danger" className="m-3 mb-0">
            {error}
          </Alert>
        )}
        
        <div className="notification-controls p-3 border-bottom">
          <Row>
            <Col>
              <Button
                variant="outline-primary"
                size="sm"
                onClick={markAllAsRead}
                disabled={unreadNotifications.length === 0}
              >
                <FontAwesomeIcon icon={faCheckCircle} className="me-2" />
                Mark All Read
              </Button>
            </Col>
            <Col className="text-end">
              <Badge bg="secondary">
                Total: {notifications.length}
              </Badge>
              {unreadNotifications.length > 0 && (
                <Badge bg="danger" className="ms-2">
                  Unread: {unreadNotifications.length}
                </Badge>
              )}
            </Col>
          </Row>
        </div>

        <Tabs
          activeKey={activeTab}
          onSelect={(k) => setActiveTab(k || 'all')}
          className="notification-tabs"
        >
          <Tab 
            eventKey="all" 
            title={
              <span>
                <FontAwesomeIcon icon={faEnvelope} className="me-2" />
                All Notifications
                <Badge bg="secondary" className="ms-2">{notifications.length}</Badge>
              </span>
            }
          >
            {renderNotificationList(notifications)}
          </Tab>
          
          <Tab 
            eventKey="unread" 
            title={
              <span>
                <FontAwesomeIcon icon={faEnvelopeOpen} className="me-2" />
                Unread
                {unreadNotifications.length > 0 && (
                  <Badge bg="danger" className="ms-2">{unreadNotifications.length}</Badge>
                )}
              </span>
            }
          >
            {renderNotificationList(unreadNotifications)}
          </Tab>
        </Tabs>
      </Modal.Body>
      
      <Modal.Footer className="notification-footer">
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default NotificationCenter;
