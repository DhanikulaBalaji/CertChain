"""
Security Configuration Module

This module centralizes security settings and configurations for the application.
"""

from typing import List, Dict, Any
import os
from pydantic_settings import BaseSettings

class SecuritySettings(BaseSettings):
    """Security-specific settings"""
    
    # Rate limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS_PER_MINUTE: int = 100
    RATE_LIMIT_WINDOW_SIZE: int = 60  # seconds
    
    # Account lockout
    FAILED_LOGIN_MAX_ATTEMPTS: int = 5
    ACCOUNT_LOCKOUT_DURATION: int = 900  # 15 minutes
    
    # Security headers
    SECURITY_HEADERS_ENABLED: bool = True
    CSP_POLICY_ENABLED: bool = True
    
    # CORS settings
    CORS_ALLOW_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8080",
        "https://certificate-system.example.com"
    ]
    CORS_ALLOW_METHODS: List[str] = ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]
    CORS_ALLOW_HEADERS: List[str] = ["*"]
    CORS_ALLOW_CREDENTIALS: bool = True
    
    # Input validation
    VALIDATION_ENABLED: bool = True
    MAX_CONTENT_LENGTH: int = 10 * 1024 * 1024  # 10MB
    
    # SQL injection protection
    SQL_INJECTION_PATTERNS: List[str] = [
        r"(?i)SELECT.*FROM",
        r"(?i)INSERT.*INTO",
        r"(?i)UPDATE.*SET",
        r"(?i)DELETE.*FROM",
        r"(?i)DROP.*TABLE",
        r"(?i)ALTER.*TABLE",
        r"(?i)EXEC.*sp_",
        r"(?i)WAITFOR.*DELAY",
        r"(?i)--",
        r"(?i)/\*.*\*/",
    ]
    
    # XSS protection
    XSS_PATTERNS: List[str] = [
        r"<script.*?>",
        r"javascript:",
        r"onerror=",
        r"onload=",
        r"onmouseover=",
        r"onclick=",
        r"onsubmit=",
        r"<iframe",
        r"<object",
        r"<embed",
    ]
    
    # Security headers configuration
    SECURITY_HEADERS: Dict[str, str] = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; form-action 'self';",
        "Referrer-Policy": "strict-origin-when-cross-origin"
    }
    
    # Audit logging
    AUDIT_LOG_FILE: str = "audit.log"
    AUDIT_LOG_LEVEL: str = "INFO"
    AUDIT_LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    
    # Certificate access logging
    CERTIFICATE_ACCESS_LOGGING_ENABLED: bool = True
    
    # Security Monitoring
    SECURITY_MONITORING_ENABLED: bool = True
    SECURITY_REPORT_DAYS_DEFAULT: int = 30
    
    class Config:
        env_prefix = "SECURITY_"
        case_sensitive = True

# Create a global instance
security_settings = SecuritySettings()

def get_security_settings() -> SecuritySettings:
    """Get security settings singleton"""
    return security_settings
