"""
Enhanced Authentication Service with Security Features
"""

import re
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, status, Request
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import JWTError, jwt

from app.models.database import User
from app.core.config import settings
from app.core.security_config import get_security_settings
from app.core.security_middleware import auth_tracker, VALIDATION_RULES, validate_and_sanitize_input
from app.services.audit_service import log_authentication_attempt, log_admin_action, SecurityEventType, SecuritySeverity, audit_service

# Get security settings
security_settings = get_security_settings()

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class PasswordPolicy:
    """Password policy enforcement"""
    
    MIN_LENGTH = 8
    MAX_LENGTH = 128
    REQUIRE_UPPERCASE = True
    REQUIRE_LOWERCASE = True
    REQUIRE_DIGIT = True
    REQUIRE_SPECIAL = True
    
    SPECIAL_CHARS = "!@#$%^&*()_+-=[]{}|;:,.<>?"
    
    @classmethod
    def validate_password(cls, password: str) -> Dict[str, Any]:
        """
        Validate password against policy
        Returns validation result with details
        """
        errors = []
        
        if len(password) < cls.MIN_LENGTH:
            errors.append(f"Password must be at least {cls.MIN_LENGTH} characters long")
        
        if len(password) > cls.MAX_LENGTH:
            errors.append(f"Password must not exceed {cls.MAX_LENGTH} characters")
        
        if cls.REQUIRE_UPPERCASE and not re.search(r'[A-Z]', password):
            errors.append("Password must contain at least one uppercase letter")
        
        if cls.REQUIRE_LOWERCASE and not re.search(r'[a-z]', password):
            errors.append("Password must contain at least one lowercase letter")
        
        if cls.REQUIRE_DIGIT and not re.search(r'\d', password):
            errors.append("Password must contain at least one digit")
        
        if cls.REQUIRE_SPECIAL and not re.search(f'[{re.escape(cls.SPECIAL_CHARS)}]', password):
            errors.append("Password must contain at least one special character")
        
        # Check for common weak patterns
        if re.search(r'(.)\1{2,}', password):  # 3+ consecutive same characters
            errors.append("Password should not contain repeated characters")
        
        if re.search(r'(012|123|234|345|456|567|678|789|890)', password):
            errors.append("Password should not contain sequential numbers")
        
        if re.search(r'(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)', password.lower()):
            errors.append("Password should not contain sequential letters")
        
        # Check against common passwords
        common_passwords = [
            'password', '123456', '123456789', 'qwerty', 'abc123',
            'password123', 'admin', 'letmein', 'welcome', 'monkey'
        ]
        
        if password.lower() in common_passwords:
            errors.append("Password is too common")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "strength": cls._calculate_strength(password)
        }
    
    @classmethod
    def _calculate_strength(cls, password: str) -> str:
        """Calculate password strength"""
        score = 0
        
        # Length scoring
        if len(password) >= 8:
            score += 1
        if len(password) >= 12:
            score += 1
        if len(password) >= 16:
            score += 1
        
        # Character variety
        if re.search(r'[a-z]', password):
            score += 1
        if re.search(r'[A-Z]', password):
            score += 1
        if re.search(r'\d', password):
            score += 1
        if re.search(f'[{re.escape(cls.SPECIAL_CHARS)}]', password):
            score += 1
        
        # Complexity
        if len(set(password)) > len(password) * 0.7:  # Good character diversity
            score += 1
        
        if score <= 3:
            return "weak"
        elif score <= 5:
            return "medium"
        elif score <= 7:
            return "strong"
        else:
            return "very_strong"

class EnhancedAuthService:
    """Enhanced authentication service with security features"""
    
    def __init__(self):
        self.pwd_context = pwd_context
        self.password_policy = PasswordPolicy()
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify password against hash"""
        try:
            return self.pwd_context.verify(plain_password, hashed_password)
        except Exception as e:
            print(f"Password verification error: {str(e)}")
            return False
    
    def authenticate_user(
        self, 
        db: Session, 
        email: str, 
        password: str,
        request: Optional[Request] = None
    ) -> Optional[User]:
        """
        Authenticate user with enhanced security checks
        """
        # Get client IP and user agent
        ip_address = None
        user_agent = None
        if request:
            ip_address = self._get_client_ip(request)
            user_agent = request.headers.get("user-agent")
        
        # Check if account is locked
        if auth_tracker.is_locked(email):
            # Log the attempt on locked account
            audit_service.log_security_event(
                event_type=SecurityEventType.LOGIN_FAILED,
                user_email=email,
                ip_address=ip_address,
                user_agent=user_agent,
                details={"reason": "account_locked"},
                severity=SecuritySeverity.HIGH
            )
            
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="Account temporarily locked due to multiple failed login attempts. Please try again later."
            )
        
        # Validate input
        try:
            validated_data = validate_and_sanitize_input(
                {"email": email, "password": password},
                {"email": VALIDATION_RULES["email"], "password": VALIDATION_RULES["password"]}
            )
            email = validated_data["email"]
            password = validated_data["password"]
        except HTTPException as e:
            # Log validation failure
            log_authentication_attempt(
                success=False,
                user_email=email,
                ip_address=ip_address,
                user_agent=user_agent,
                details={"reason": "validation_failed", "error": str(e.detail)}
            )
            raise
        
        # Get user from database
        user = db.query(User).filter(User.email == email).first()
        
        if not user:
            # Record failed attempt for non-existent user
            auth_tracker.record_failed_attempt(email)
            log_authentication_attempt(
                success=False,
                user_email=email,
                ip_address=ip_address,
                user_agent=user_agent,
                details={"reason": "user_not_found"}
            )
            return None
        
        # Check if user is active and approved
        if not user.is_active:
            log_authentication_attempt(
                success=False,
                user_email=email,
                user_id=user.id,
                ip_address=ip_address,
                user_agent=user_agent,
                details={"reason": "account_inactive"}
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is inactive"
            )
        
        if not user.is_approved:
            log_authentication_attempt(
                success=False,
                user_email=email,
                user_id=user.id,
                ip_address=ip_address,
                user_agent=user_agent,
                details={"reason": "account_not_approved"}
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is pending approval"
            )
        
        # Verify password
        if not self.verify_password(password, user.hashed_password):
            # Record failed attempt
            should_lock = auth_tracker.record_failed_attempt(email)
            
            log_authentication_attempt(
                success=False,
                user_email=email,
                user_id=user.id,
                ip_address=ip_address,
                user_agent=user_agent,
                details={
                    "reason": "invalid_password",
                    "locked": should_lock
                }
            )
            
            if should_lock:
                audit_service.log_security_event(
                    event_type=SecurityEventType.ACCOUNT_LOCKED,
                    user_id=user.id,
                    user_email=email,
                    ip_address=ip_address,
                    details={"reason": "too_many_failed_attempts"},
                    severity=SecuritySeverity.HIGH
                )
            
            return None
        
        # Successful authentication
        auth_tracker.clear_failed_attempts(email)
        
        log_authentication_attempt(
            success=True,
            user_email=email,
            user_id=user.id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"login_method": "password"}
        )
        
        # Update last login time (you might want to add this field to User model)
        # user.last_login = datetime.utcnow()
        # db.commit()
        
        return user
    
    def create_user(
        self, 
        db: Session, 
        email: str, 
        password: str, 
        full_name: str,
        role: str = "USER",
        request: Optional[Request] = None
    ) -> User:
        """
        Create new user with enhanced validation
        """
        # Get client information
        ip_address = None
        user_agent = None
        if request:
            ip_address = self._get_client_ip(request)
            user_agent = request.headers.get("user-agent")
        
        # Validate input data
        validated_data = validate_and_sanitize_input(
            {
                "email": email,
                "password": password,
                "full_name": full_name
            },
            {
                "email": VALIDATION_RULES["email"],
                "password": VALIDATION_RULES["password"],
                "full_name": VALIDATION_RULES["full_name"]
            }
        )
        
        # Validate password policy
        password_validation = self.password_policy.validate_password(validated_data["password"])
        if not password_validation["valid"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "Password does not meet security requirements",
                    "errors": password_validation["errors"]
                }
            )
        
        # Check if user already exists
        existing_user = db.query(User).filter(User.email == validated_data["email"]).first()
        if existing_user:
            # Log potential account enumeration attempt
            audit_service.log_security_event(
                event_type=SecurityEventType.SUSPICIOUS_ACTIVITY,
                user_email=validated_data["email"],
                ip_address=ip_address,
                details={"reason": "duplicate_registration_attempt"},
                severity=SecuritySeverity.MEDIUM
            )
            
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        # Create user
        hashed_password = self.get_password_hash(validated_data["password"])
        
        user = User(
            email=validated_data["email"],
            full_name=validated_data["full_name"],
            hashed_password=hashed_password,
            role=role,
            is_active=True,
            is_approved=False  # Require admin approval
        )
        
        db.add(user)
        db.commit()
        db.refresh(user)
        
        # Log user creation
        audit_service.log_security_event(
            event_type=SecurityEventType.LOGIN_SUCCESS,  # User created successfully
            user_id=user.id,
            user_email=user.email,
            ip_address=ip_address,
            user_agent=user_agent,
            details={
                "action": "user_created",
                "role": role,
                "password_strength": password_validation["strength"]
            },
            severity=SecuritySeverity.LOW
        )
        
        return user
    
    def change_password(
        self,
        db: Session,
        user: User,
        current_password: str,
        new_password: str,
        request: Optional[Request] = None
    ) -> bool:
        """
        Change user password with security checks
        """
        # Get client information
        ip_address = None
        if request:
            ip_address = self._get_client_ip(request)
        
        # Verify current password
        if not self.verify_password(current_password, user.hashed_password):
            audit_service.log_security_event(
                event_type=SecurityEventType.SUSPICIOUS_ACTIVITY,
                user_id=user.id,
                user_email=user.email,
                ip_address=ip_address,
                details={"reason": "invalid_current_password_change_attempt"},
                severity=SecuritySeverity.MEDIUM
            )
            
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect"
            )
        
        # Validate new password
        password_validation = self.password_policy.validate_password(new_password)
        if not password_validation["valid"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "New password does not meet security requirements",
                    "errors": password_validation["errors"]
                }
            )
        
        # Check if new password is the same as current
        if self.verify_password(new_password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be different from current password"
            )
        
        # Update password
        user.hashed_password = self.get_password_hash(new_password)
        user.updated_at = datetime.utcnow()
        db.commit()
        
        # Log password change
        audit_service.log_security_event(
            event_type=SecurityEventType.PASSWORD_CHANGED,
            user_id=user.id,
            user_email=user.email,
            ip_address=ip_address,
            details={
                "new_password_strength": password_validation["strength"]
            },
            severity=SecuritySeverity.MEDIUM
        )
        
        return True
    
    def get_password_hash(self, password: str) -> str:
        """Hash password using bcrypt"""
        return self.pwd_context.hash(password)
    
    def create_access_token(self, data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """Create JWT access token"""
        to_encode = data.copy()
        
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        
        return encoded_jwt
    
    def verify_token(self, token: str) -> Optional[dict]:
        """Verify and decode JWT token"""
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            return payload
        except JWTError:
            return None
    
    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP from request"""
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        return request.client.host if request.client else "unknown"
    
    def get_security_report(self, days: int = 30) -> Dict[str, Any]:
        """Generate security report"""
        
        # Get failed login attempts
        failed_logins = audit_service.get_recent_events(
            event_type=SecurityEventType.LOGIN_FAILED,
            limit=1000
        )
        
        # Get suspicious activities
        suspicious_activities = audit_service.get_recent_events(
            event_type=SecurityEventType.SUSPICIOUS_ACTIVITY,
            limit=1000
        )
        
        # Get account lockouts
        account_lockouts = audit_service.get_recent_events(
            event_type=SecurityEventType.ACCOUNT_LOCKED,
            limit=1000
        )
        
        # Analyze patterns
        failed_ips = {}
        for event in failed_logins:
            ip = event.get("ip_address", "unknown")
            failed_ips[ip] = failed_ips.get(ip, 0) + 1
        
        return {
            "period_days": days,
            "total_failed_logins": len(failed_logins),
            "total_suspicious_activities": len(suspicious_activities),
            "total_account_lockouts": len(account_lockouts),
            "top_failed_ips": dict(sorted(failed_ips.items(), key=lambda x: x[1], reverse=True)[:10]),
            "anomalies": audit_service.detect_anomalous_behavior()
        }

# Global enhanced auth service instance
enhanced_auth_service = EnhancedAuthService()
