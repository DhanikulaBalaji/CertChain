"""
Enhanced Audit and Security Event Monitoring Service
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from enum import Enum
from sqlalchemy.orm import Session
from app.models.database import User, ActivityLog
from app.core.database import get_db
from app.core.security_config import get_security_settings

# Get security settings
security_settings = get_security_settings()

# Configure audit logger
audit_logger = logging.getLogger("audit")
audit_logger.setLevel(getattr(logging, security_settings.AUDIT_LOG_LEVEL))

# File handler for audit logs
audit_handler = logging.FileHandler(security_settings.AUDIT_LOG_FILE)
audit_formatter = logging.Formatter(security_settings.AUDIT_LOG_FORMAT)
audit_handler.setFormatter(audit_formatter)
audit_logger.addHandler(audit_handler)

class SecurityEventType(str, Enum):
    """Types of security events to monitor"""
    LOGIN_SUCCESS = "login_success"
    LOGIN_FAILED = "login_failed"
    LOGOUT = "logout"
    PASSWORD_CHANGED = "password_changed"
    ACCOUNT_LOCKED = "account_locked"
    PERMISSION_DENIED = "permission_denied"
    CERTIFICATE_GENERATED = "certificate_generated"
    CERTIFICATE_VALIDATED = "certificate_validated"
    CERTIFICATE_TAMPERED = "certificate_tampered"
    DATA_EXPORT = "data_export"
    ADMIN_ACTION = "admin_action"
    SUSPICIOUS_ACTIVITY = "suspicious_activity"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    FILE_UPLOAD = "file_upload"
    BULK_OPERATION = "bulk_operation"

class SecuritySeverity(str, Enum):
    """Severity levels for security events"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class AuditService:
    """
    Comprehensive audit service for security monitoring
    """
    
    def __init__(self):
        self.recent_events = []  # In-memory cache for recent events
        self.max_recent_events = 1000
    
    def log_security_event(
        self,
        event_type: SecurityEventType,
        user_id: Optional[int] = None,
        user_email: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        severity: SecuritySeverity = SecuritySeverity.MEDIUM,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None
    ):
        """Log a security event with comprehensive details"""
        
        event_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "event_type": event_type,
            "user_id": user_id,
            "user_email": user_email,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "severity": severity,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "details": details or {}
        }
        
        # Log to file
        audit_logger.info(f"SECURITY_EVENT: {json.dumps(event_data)}")
        
        # Store in database if database session available
        try:
            db = next(get_db())
            self._store_in_database(db, event_data)
        except Exception as e:
            audit_logger.error(f"Failed to store security event in database: {e}")
        
        # Keep in memory cache
        self.recent_events.append(event_data)
        if len(self.recent_events) > self.max_recent_events:
            self.recent_events.pop(0)
        
        # Alert on critical events
        if severity == SecuritySeverity.CRITICAL:
            self._handle_critical_event(event_data)
    
    def _store_in_database(self, db: Session, event_data: Dict[str, Any]):
        """Store security event in database"""
        try:
            # Parse timestamp with error handling
            timestamp = event_data["timestamp"]
            try:
                parsed_timestamp = datetime.fromisoformat(timestamp)
            except ValueError:
                # Fallback: try to parse manually or use current time
                try:
                    # Remove 'Z' suffix if present and parse
                    if timestamp.endswith('Z'):
                        timestamp = timestamp[:-1]
                    parsed_timestamp = datetime.fromisoformat(timestamp)
                except ValueError:
                    # Use current time as fallback
                    parsed_timestamp = datetime.utcnow()
                    audit_logger.warning(f"Could not parse timestamp '{event_data['timestamp']}', using current time")
            
            activity_log = ActivityLog(
                user_id=event_data.get("user_id"),
                action=event_data["event_type"],
                resource_type=event_data.get("resource_type"),
                resource_id=event_data.get("resource_id"),
                details=json.dumps(event_data["details"]),
                ip_address=event_data.get("ip_address"),
                user_agent=event_data.get("user_agent"),
                timestamp=parsed_timestamp
            )
            db.add(activity_log)
            db.commit()
        except Exception as e:
            audit_logger.error(f"Database storage error: {e}")
            db.rollback()
        finally:
            db.close()
    
    def _handle_critical_event(self, event_data: Dict[str, Any]):
        """Handle critical security events with immediate alerts"""
        
        critical_msg = f"CRITICAL SECURITY EVENT: {event_data['event_type']} "
        if event_data.get('user_email'):
            critical_msg += f"User: {event_data['user_email']} "
        if event_data.get('ip_address'):
            critical_msg += f"IP: {event_data['ip_address']} "
        
        # Log with highest priority
        audit_logger.critical(critical_msg)
        
        # Here you could add additional alerting mechanisms like:
        # - Email notifications to security team
        # - Slack/Discord webhooks
        # - SMS alerts
        # - Integration with security monitoring tools
    
    def get_recent_events(
        self, 
        limit: int = 100, 
        event_type: Optional[SecurityEventType] = None,
        severity: Optional[SecuritySeverity] = None
    ) -> List[Dict[str, Any]]:
        """Get recent security events with filtering"""
        
        events = self.recent_events.copy()
        
        # Filter by event type
        if event_type:
            events = [e for e in events if e["event_type"] == event_type]
        
        # Filter by severity
        if severity:
            events = [e for e in events if e["severity"] == severity]
        
        # Sort by timestamp (most recent first)
        events.sort(key=lambda x: x["timestamp"], reverse=True)
        
        return events[:limit]
    
    def get_failed_login_attempts(
        self, 
        hours: int = 24,
        min_attempts: int = 3
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Get IP addresses with suspicious login activity"""
        
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)
        
        failed_attempts = {}
        for event in self.recent_events:
            try:
                event_timestamp = datetime.fromisoformat(event["timestamp"])
            except ValueError:
                # Skip events with invalid timestamps
                continue
                
            if (event["event_type"] == SecurityEventType.LOGIN_FAILED and 
                event_timestamp > cutoff_time):
                
                ip = event.get("ip_address", "unknown")
                if ip not in failed_attempts:
                    failed_attempts[ip] = []
                failed_attempts[ip].append(event)
        
        # Filter by minimum attempts
        suspicious_ips = {
            ip: attempts for ip, attempts in failed_attempts.items()
            if len(attempts) >= min_attempts
        }
        
        return suspicious_ips
    
    def get_user_activity_summary(
        self, 
        user_id: int, 
        days: int = 7
    ) -> Dict[str, Any]:
        """Get activity summary for a specific user"""
        
        cutoff_time = datetime.utcnow() - timedelta(days=days)
        
        user_events = []
        for event in self.recent_events:
            try:
                event_timestamp = datetime.fromisoformat(event["timestamp"])
            except ValueError:
                # Skip events with invalid timestamps
                continue
                
            if (event.get("user_id") == user_id and event_timestamp > cutoff_time):
                user_events.append(event)
        
        # Group by event type
        event_counts = {}
        for event in user_events:
            event_type = event["event_type"]
            event_counts[event_type] = event_counts.get(event_type, 0) + 1
        
        # Get unique IP addresses
        ip_addresses = list(set(
            event.get("ip_address") for event in user_events
            if event.get("ip_address")
        ))
        
        return {
            "user_id": user_id,
            "total_events": len(user_events),
            "event_types": event_counts,
            "unique_ips": ip_addresses,
            "period_days": days,
            "recent_events": user_events[:10]  # Last 10 events
        }
    
    def detect_anomalous_behavior(self) -> List[Dict[str, Any]]:
        """Detect potentially anomalous user behavior"""
        
        anomalies = []
        
        # Check for rapid-fire requests from same IP
        ip_activity = {}
        for event in self.recent_events[-100:]:  # Check last 100 events
            ip = event.get("ip_address")
            if ip:
                if ip not in ip_activity:
                    ip_activity[ip] = []
                ip_activity[ip].append(event)
        
        for ip, events in ip_activity.items():
            if len(events) > 20:  # More than 20 requests in recent history
                anomalies.append({
                    "type": "high_request_rate",
                    "ip_address": ip,
                    "event_count": len(events),
                    "severity": SecuritySeverity.HIGH
                })
        
        # Check for failed login attempts followed by successful login
        for event in self.recent_events:
            if event["event_type"] == SecurityEventType.LOGIN_SUCCESS:
                user_email = event.get("user_email")
                if user_email:
                    # Look for recent failed attempts for same user
                    recent_fails = []
                    try:
                        event_timestamp = datetime.fromisoformat(event["timestamp"])
                        for e in self.recent_events:
                            if (e["event_type"] == SecurityEventType.LOGIN_FAILED and
                                e.get("user_email") == user_email):
                                try:
                                    e_timestamp = datetime.fromisoformat(e["timestamp"])
                                    if abs(e_timestamp - event_timestamp).total_seconds() < 300:
                                        recent_fails.append(e)
                                except ValueError:
                                    # Skip events with invalid timestamps
                                    continue
                    except ValueError:
                        # Skip if event timestamp is invalid
                        continue
                    
                    if len(recent_fails) >= 3:
                        anomalies.append({
                            "type": "brute_force_success",
                            "user_email": user_email,
                            "failed_attempts": len(recent_fails),
                            "severity": SecuritySeverity.CRITICAL
                        })
        
        return anomalies

# Global audit service instance
audit_service = AuditService()

def log_authentication_attempt(
    success: bool,
    user_email: str,
    user_id: Optional[int] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
):
    """Convenience function to log authentication attempts"""
    
    event_type = SecurityEventType.LOGIN_SUCCESS if success else SecurityEventType.LOGIN_FAILED
    severity = SecuritySeverity.LOW if success else SecuritySeverity.MEDIUM
    
    audit_service.log_security_event(
        event_type=event_type,
        user_id=user_id,
        user_email=user_email,
        ip_address=ip_address,
        user_agent=user_agent,
        details=details,
        severity=severity
    )

def log_certificate_access(
    action: str,
    certificate_id: str,
    user_id: Optional[int] = None,
    user_email: Optional[str] = None,
    ip_address: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
):
    """Convenience function to log certificate access"""
    
    event_mapping = {
        "generated": SecurityEventType.CERTIFICATE_GENERATED,
        "validated": SecurityEventType.CERTIFICATE_VALIDATED,
        "tampered": SecurityEventType.CERTIFICATE_TAMPERED
    }
    
    event_type = event_mapping.get(action, SecurityEventType.SUSPICIOUS_ACTIVITY)
    severity = SecuritySeverity.HIGH if action == "tampered" else SecuritySeverity.LOW
    
    audit_service.log_security_event(
        event_type=event_type,
        user_id=user_id,
        user_email=user_email,
        ip_address=ip_address,
        resource_type="certificate",
        resource_id=certificate_id,
        details=details,
        severity=severity
    )

def log_admin_action(
    action: str,
    admin_user_id: int,
    admin_email: str,
    target_resource: Optional[str] = None,
    target_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
):
    """Convenience function to log administrative actions"""
    
    audit_service.log_security_event(
        event_type=SecurityEventType.ADMIN_ACTION,
        user_id=admin_user_id,
        user_email=admin_email,
        ip_address=ip_address,
        resource_type=target_resource,
        resource_id=target_id,
        details={**details, "action": action} if details else {"action": action},
        severity=SecuritySeverity.MEDIUM
    )
