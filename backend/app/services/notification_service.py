"""
Notification Service - Handle system alerts and notifications (Email functionality disabled)
"""
import logging
from typing import List, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.database import Notification, User, NotificationType, NotificationStatus
from app.core.config import settings

logger = logging.getLogger(__name__)

class NotificationService:
    def __init__(self, db: Session):
        self.db = db
        logger.info("Notification service initialized - Email functionality disabled")

    def create_admin_notification(
        self,
        admin_id: int,
        title: str,
        message: str,
        notification_type: str = "admin_alert",
        priority: str = "normal",
        metadata: Optional[dict] = None
    ) -> bool:
        """Create notifications specifically for admin users"""
        try:
            notification = Notification(
                user_id=admin_id,
                title=title,
                message=message,
                notification_type=notification_type,
                priority=priority,
                status=NotificationStatus.UNREAD,
                metadata=metadata or {},
                created_at=datetime.utcnow()
            )
            
            self.db.add(notification)
            self.db.commit()
            
            logger.info(f"Admin notification created: {title}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to create admin notification: {e}")
            self.db.rollback()
            return False

    def create_user_notification(
        self,
        user_id: int,
        title: str,
        message: str,
        notification_type: str = "info",
        priority: str = "normal",
        metadata: Optional[dict] = None
    ) -> bool:
        """Create notifications for regular users"""
        try:
            notification = Notification(
                user_id=user_id,
                title=title,
                message=message,
                notification_type=notification_type,
                priority=priority,
                status=NotificationStatus.UNREAD,
                metadata=metadata or {},
                created_at=datetime.utcnow()
            )
            
            self.db.add(notification)
            self.db.commit()
            
            logger.info(f"User notification created for user {user_id}: {title}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to create user notification: {e}")
            self.db.rollback()
            return False

    def send_certificate_issued_notification(self, certificate_data: dict, recipient_email: str = None) -> bool:
        """Log certificate issuance (email functionality disabled)"""
        try:
            logger.info(f"Certificate issued: {certificate_data.get('certificate_id', 'Unknown')}")
            logger.info(f"Recipient: {recipient_email or 'Not specified'}")
            return True
        except Exception as e:
            logger.error(f"Failed to log certificate notification: {e}")
            return False

    def send_certificate_revoked_notification(self, certificate_data: dict, recipient_email: str = None) -> bool:
        """Log certificate revocation (email functionality disabled)"""
        try:
            logger.info(f"Certificate revoked: {certificate_data.get('certificate_id', 'Unknown')}")
            logger.info(f"Recipient: {recipient_email or 'Not specified'}")
            return True
        except Exception as e:
            logger.error(f"Failed to log revocation notification: {e}")
            return False

    def send_security_alert(self, alert_data: dict, admin_emails: List[str] = None) -> bool:
        """Log security alert (email functionality disabled)"""
        try:
            logger.warning(f"Security alert: {alert_data.get('type', 'Unknown type')}")
            logger.warning(f"Details: {alert_data.get('message', 'No details')}")
            return True
        except Exception as e:
            logger.error(f"Failed to log security alert: {e}")
            return False

    def get_user_notifications(self, user_id: int, limit: int = 50) -> List[dict]:
        """Get notifications for a user"""
        try:
            notifications = self.db.query(Notification).filter(
                Notification.user_id == user_id
            ).order_by(Notification.created_at.desc()).limit(limit).all()
            
            return [
                {
                    "id": n.id,
                    "title": n.title,
                    "message": n.message,
                    "type": n.notification_type,
                    "priority": n.priority,
                    "status": n.status.value if n.status else "unread",
                    "created_at": n.created_at,
                    "metadata": n.metadata or {}
                }
                for n in notifications
            ]
        except Exception as e:
            logger.error(f"Failed to get user notifications: {e}")
            return []

    def mark_notification_read(self, notification_id: int, user_id: int) -> bool:
        """Mark a notification as read"""
        try:
            notification = self.db.query(Notification).filter(
                Notification.id == notification_id,
                Notification.user_id == user_id
            ).first()
            
            if notification:
                notification.status = NotificationStatus.READ
                notification.read_at = datetime.utcnow()
                self.db.commit()
                return True
            return False
            
        except Exception as e:
            logger.error(f"Failed to mark notification as read: {e}")
            self.db.rollback()
            return False
