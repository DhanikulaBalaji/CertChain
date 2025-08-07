"""
Security Monitoring API Endpoints
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.dependencies import get_current_active_user, require_role
from app.models.database import User
from app.services.audit_service import audit_service, SecurityEventType, SecuritySeverity
from app.services.enhanced_auth_service import enhanced_auth_service
from app.core.security_middleware import auth_tracker

router = APIRouter(prefix="/security", tags=["security"])

@router.get("/events", response_model=List[Dict[str, Any]])
async def get_security_events(
    limit: int = Query(100, ge=1, le=1000),
    event_type: Optional[SecurityEventType] = None,
    severity: Optional[SecuritySeverity] = None,
    current_user: User = Depends(require_role(["super_admin"]))
):
    """
    Get recent security events (Super Admin only)
    """
    events = audit_service.get_recent_events(
        limit=limit,
        event_type=event_type,
        severity=severity
    )
    
    return events

@router.get("/report", response_model=Dict[str, Any])
async def get_security_report(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(require_role(["super_admin"]))
):
    """
    Generate comprehensive security report (Super Admin only)
    """
    report = enhanced_auth_service.get_security_report(days=days)
    return report

@router.get("/failed-logins", response_model=Dict[str, List[Dict[str, Any]]])
async def get_failed_login_attempts(
    hours: int = Query(24, ge=1, le=168),  # Max 1 week
    min_attempts: int = Query(3, ge=1, le=100),
    current_user: User = Depends(require_role(["super_admin"]))
):
    """
    Get IP addresses with suspicious login activity (Super Admin only)
    """
    failed_attempts = audit_service.get_failed_login_attempts(
        hours=hours,
        min_attempts=min_attempts
    )
    
    return failed_attempts

@router.get("/user-activity/{user_id}", response_model=Dict[str, Any])
async def get_user_activity(
    user_id: int,
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["super_admin", "admin"]))
):
    """
    Get activity summary for specific user
    """
    # Check if target user exists
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    activity = audit_service.get_user_activity_summary(
        user_id=user_id,
        days=days
    )
    
    # Add user information
    activity["user_email"] = target_user.email
    activity["user_name"] = target_user.full_name
    
    return activity

@router.get("/anomalies", response_model=List[Dict[str, Any]])
async def get_security_anomalies(
    current_user: User = Depends(require_role(["super_admin"]))
):
    """
    Detect and return security anomalies (Super Admin only)
    """
    anomalies = audit_service.detect_anomalous_behavior()
    return anomalies

@router.get("/locked-accounts", response_model=Dict[str, Any])
async def get_locked_accounts(
    current_user: User = Depends(require_role(["super_admin"]))
):
    """
    Get currently locked accounts (Super Admin only)
    """
    locked_accounts = {}
    
    # Get locked accounts from auth tracker
    for identifier, lock_time in auth_tracker.locked_accounts.items():
        if datetime.utcnow() < lock_time:  # Still locked
            locked_accounts[identifier] = {
                "locked_until": lock_time.isoformat(),
                "remaining_seconds": int((lock_time - datetime.utcnow()).total_seconds())
            }
    
    return {
        "locked_accounts": locked_accounts,
        "total_locked": len(locked_accounts)
    }

@router.post("/unlock-account", response_model=Dict[str, str])
async def unlock_account(
    email: str,
    current_user: User = Depends(require_role(["super_admin"])),
    request: Request = None
):
    """
    Manually unlock an account (Super Admin only)
    """
    # Clear failed attempts and unlock
    auth_tracker.clear_failed_attempts(email)
    
    # Log admin action
    from app.services.audit_service import log_admin_action
    
    ip_address = None
    if request:
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            ip_address = forwarded_for.split(",")[0].strip()
        else:
            ip_address = request.client.host if request.client else "unknown"
    
    log_admin_action(
        action="account_unlocked",
        admin_user_id=current_user.id,
        admin_email=current_user.email,
        target_resource="user_account",
        target_id=email,
        ip_address=ip_address,
        details={"unlocked_by": current_user.email}
    )
    
    return {"message": f"Account {email} has been unlocked"}

@router.get("/login-statistics", response_model=Dict[str, Any])
async def get_login_statistics(
    days: int = Query(7, ge=1, le=90),
    current_user: User = Depends(require_role(["super_admin", "admin"]))
):
    """
    Get login statistics for the specified period
    """
    # Get recent events
    all_events = audit_service.get_recent_events(limit=10000)
    
    # Filter events from the specified period
    cutoff_time = datetime.utcnow() - timedelta(days=days)
    
    login_events = []
    for event in all_events:
        event_time = datetime.fromisoformat(event["timestamp"])
        if (event_time > cutoff_time and 
            event["event_type"] in [SecurityEventType.LOGIN_SUCCESS, SecurityEventType.LOGIN_FAILED]):
            login_events.append(event)
    
    # Calculate statistics
    successful_logins = [e for e in login_events if e["event_type"] == SecurityEventType.LOGIN_SUCCESS]
    failed_logins = [e for e in login_events if e["event_type"] == SecurityEventType.LOGIN_FAILED]
    
    # Group by day
    daily_stats = {}
    for event in login_events:
        event_date = datetime.fromisoformat(event["timestamp"]).date()
        date_str = event_date.isoformat()
        
        if date_str not in daily_stats:
            daily_stats[date_str] = {"successful": 0, "failed": 0}
        
        if event["event_type"] == SecurityEventType.LOGIN_SUCCESS:
            daily_stats[date_str]["successful"] += 1
        else:
            daily_stats[date_str]["failed"] += 1
    
    # Top IP addresses
    ip_stats = {}
    for event in login_events:
        ip = event.get("ip_address", "unknown")
        if ip not in ip_stats:
            ip_stats[ip] = {"successful": 0, "failed": 0}
        
        if event["event_type"] == SecurityEventType.LOGIN_SUCCESS:
            ip_stats[ip]["successful"] += 1
        else:
            ip_stats[ip]["failed"] += 1
    
    return {
        "period_days": days,
        "total_successful_logins": len(successful_logins),
        "total_failed_logins": len(failed_logins),
        "success_rate": len(successful_logins) / len(login_events) * 100 if login_events else 0,
        "daily_statistics": daily_stats,
        "top_ips": dict(sorted(
            ip_stats.items(), 
            key=lambda x: x[1]["successful"] + x[1]["failed"], 
            reverse=True
        )[:10])
    }

@router.get("/certificate-access", response_model=List[Dict[str, Any]])
async def get_certificate_access_logs(
    limit: int = Query(100, ge=1, le=1000),
    certificate_id: Optional[str] = None,
    current_user: User = Depends(require_role(["super_admin", "admin"]))
):
    """
    Get certificate access and validation logs
    """
    # Filter certificate-related events
    certificate_events = []
    
    for event in audit_service.get_recent_events(limit=limit * 2):  # Get more to filter
        if event.get("resource_type") == "certificate":
            if certificate_id is None or event.get("resource_id") == certificate_id:
                certificate_events.append(event)
                if len(certificate_events) >= limit:
                    break
    
    return certificate_events

@router.get("/system-health", response_model=Dict[str, Any])
async def get_system_health(
    current_user: User = Depends(require_role(["super_admin"]))
):
    """
    Get system security health overview
    """
    # Get recent events for analysis
    recent_events = audit_service.get_recent_events(limit=1000)
    
    # Count events by type in last 24 hours
    last_24h = datetime.utcnow() - timedelta(hours=24)
    recent_24h = [
        e for e in recent_events 
        if datetime.fromisoformat(e["timestamp"]) > last_24h
    ]
    
    event_counts = {}
    for event in recent_24h:
        event_type = event["event_type"]
        event_counts[event_type] = event_counts.get(event_type, 0) + 1
    
    # Security health score calculation
    health_score = 100
    
    # Deduct points for security issues
    failed_logins = event_counts.get(SecurityEventType.LOGIN_FAILED, 0)
    if failed_logins > 10:
        health_score -= min(20, failed_logins - 10)
    
    suspicious_activities = event_counts.get(SecurityEventType.SUSPICIOUS_ACTIVITY, 0)
    health_score -= suspicious_activities * 5
    
    locked_accounts = len([
        email for email, lock_time in auth_tracker.locked_accounts.items()
        if datetime.utcnow() < lock_time
    ])
    health_score -= locked_accounts * 2
    
    health_score = max(0, health_score)  # Ensure non-negative
    
    return {
        "health_score": health_score,
        "status": "healthy" if health_score >= 80 else "warning" if health_score >= 60 else "critical",
        "last_24h_events": event_counts,
        "locked_accounts_count": locked_accounts,
        "recommendations": [
            "Monitor failed login attempts" if failed_logins > 5 else None,
            "Investigate suspicious activities" if suspicious_activities > 0 else None,
            "Review locked accounts" if locked_accounts > 0 else None
        ],
        "timestamp": datetime.utcnow().isoformat()
    }
