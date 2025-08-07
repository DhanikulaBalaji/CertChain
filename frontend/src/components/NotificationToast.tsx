import React, { useState, useEffect } from 'react';
import { Toast, ToastContainer } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faCheckCircle, 
  faExclamationTriangle, 
  faInfoCircle,
  faTimesCircle,
  faBell
} from '@fortawesome/free-solid-svg-icons';
import api from '../services/api';
import { useAuth } from '../services/AuthContext';

interface NotificationData {
  id: number;
  title: string;
  message: string;
  type: 'success' | 'warning' | 'info' | 'error';
  user_id: number;
  is_read: boolean;
  created_at: string;
}

interface ToastNotification extends NotificationData {
  show: boolean;
  timestamp: Date;
}

const NotificationToast: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    // Initial load
    checkForNewNotifications();

    // Set up polling for new notifications every 30 seconds
    const interval = setInterval(() => {
      checkForNewNotifications();
    }, 30000);

    return () => clearInterval(interval);
  }, [isAuthenticated, user]);

  const checkForNewNotifications = async () => {
    try {
      const response = await api.get('/notifications?unread_only=true');
      const newNotifications = response.data.filter((notif: NotificationData) => 
        new Date(notif.created_at) > lastChecked
      );

      if (newNotifications.length > 0) {
        const toastNotifications: ToastNotification[] = newNotifications.map((notif: NotificationData) => ({
          ...notif,
          show: true,
          timestamp: new Date(notif.created_at)
        }));

        setNotifications(prev => [...toastNotifications, ...prev]);
        setLastChecked(new Date());
      }
    } catch (error) {
      console.error('Failed to check notifications:', error);
    }
  };

  const hideNotification = (id: number) => {
    setNotifications(prev => 
      prev.map(notif => 
        notif.id === id ? { ...notif, show: false } : notif
      )
    );
  };

  const markAsRead = async (id: number) => {
    try {
      await api.post(`/notifications/${id}/read`);
      hideNotification(id);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return faCheckCircle;
      case 'warning':
        return faExclamationTriangle;
      case 'error':
        return faTimesCircle;
      case 'info':
      default:
        return faInfoCircle;
    }
  };

  const getNotificationVariant = (type: string) => {
    switch (type) {
      case 'success':
        return 'success';
      case 'warning':
        return 'warning';
      case 'error':
        return 'danger';
      case 'info':
      default:
        return 'info';
    }
  };

  if (!isAuthenticated) return null;

  return (
    <ToastContainer 
      position="top-end" 
      className="p-3"
      style={{ zIndex: 9999 }}
    >
      {notifications.filter(notif => notif.show).map((notification) => (
        <Toast
          key={`${notification.id}-${notification.timestamp.getTime()}`}
          show={notification.show}
          onClose={() => hideNotification(notification.id)}
          delay={8000}
          autohide
          bg={getNotificationVariant(notification.type)}
          className="text-white"
        >
          <Toast.Header className={`bg-${getNotificationVariant(notification.type)} text-white border-0`}>
            <FontAwesomeIcon 
              icon={getNotificationIcon(notification.type)} 
              className="me-2" 
            />
            <strong className="me-auto">{notification.title}</strong>
            <small className="text-white opacity-75">
              {new Date(notification.created_at).toLocaleTimeString()}
            </small>
          </Toast.Header>
          <Toast.Body className="d-flex justify-content-between align-items-start">
            <span>{notification.message}</span>
            <button
              className="btn btn-sm btn-link text-white opacity-75 p-0 ms-2"
              onClick={() => markAsRead(notification.id)}
              style={{ textDecoration: 'none', minWidth: 'auto' }}
            >
              Mark Read
            </button>
          </Toast.Body>
        </Toast>
      ))}
    </ToastContainer>
  );
};

// Notification Center Hook for dropdown
export const useNotificationCenter = () => {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      loadNotifications();
      
      // Poll for updates every 30 seconds
      const interval = setInterval(loadNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const response = await api.get('/notifications');
      setNotifications(response.data);
      
      const unread = response.data.filter((notif: NotificationData) => !notif.is_read).length;
      setUnreadCount(unread);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: number) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === id ? { ...notif, is_read: true } : notif
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter(n => !n.is_read);
      
      // Mark all unread notifications as read
      await Promise.all(
        unreadNotifications.map(notif => 
          api.post(`/notifications/${notif.id}/read`)
        )
      );
      
      setNotifications(prev => 
        prev.map(notif => ({ ...notif, is_read: true }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  if (!isAuthenticated) return null;

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refresh: loadNotifications
  };
};

export default NotificationToast;
