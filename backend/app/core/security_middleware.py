"""
Security Middleware Module
Enhanced security features including rate limiting, input validation, and security headers
"""

import time
import hashlib
import re
from typing import Dict, Optional, List, Any
from collections import defaultdict, deque
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import logging
from datetime import datetime, timedelta
from app.core.security_config import get_security_settings

# Get security settings
security_settings = get_security_settings()

# Configure logging
logging.basicConfig(level=logging.INFO)
security_logger = logging.getLogger("security")

class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware to prevent brute force attacks and DDoS
    """
    
    def __init__(self, app):
        super().__init__(app)
        self.enabled = security_settings.RATE_LIMIT_ENABLED
        self.calls = security_settings.RATE_LIMIT_REQUESTS_PER_MINUTE
        self.period = security_settings.RATE_LIMIT_WINDOW_SIZE
        self.clients = defaultdict(lambda: deque())
    
    async def dispatch(self, request: Request, call_next):
        client_ip = self._get_client_ip(request)
        
        # Clean old entries
        now = time.time()
        client_calls = self.clients[client_ip]
        while client_calls and client_calls[0] <= now - self.period:
            client_calls.popleft()
        
        # Check rate limit
        if len(client_calls) >= self.calls:
            security_logger.warning(f"Rate limit exceeded for IP: {client_ip}")
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "detail": "Rate limit exceeded. Please try again later.",
                    "retry_after": self.period
                }
            )
        
        # Add current request
        client_calls.append(now)
        
        # Add rate limit headers
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.calls)
        response.headers["X-RateLimit-Remaining"] = str(self.calls - len(client_calls))
        response.headers["X-RateLimit-Reset"] = str(int(now + self.period))
        
        return response
    
    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP from request headers"""
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add security headers to all responses
    """
    
    def __init__(self, app):
        super().__init__(app)
        self.enabled = security_settings.SECURITY_HEADERS_ENABLED
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        if not self.enabled:
            return response
            
        # Security headers from configuration
        security_headers = dict(security_settings.SECURITY_HEADERS)

        # Static files (PDFs, images) must be embeddable in iframes on the
        # frontend.  Remove the hard frame-blocking headers for /static/ paths.
        if request.url.path.startswith("/static/"):
            security_headers.pop("X-Frame-Options", None)
            # Allow framing from our known frontend origins
            security_headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "img-src 'self' data:; "
                "frame-ancestors http://localhost:3000 http://10.109.242.73:3000 *;"
            )

        for header, value in security_headers.items():
            response.headers[header] = value
        
        return response

class InputValidationMiddleware(BaseHTTPMiddleware):
    """
    Middleware for input validation and sanitization
    """
    
    def __init__(self, app):
        super().__init__(app)
        self.enabled = security_settings.VALIDATION_ENABLED
        self.max_content_length = security_settings.MAX_CONTENT_LENGTH
        
        # Combine SQL injection and XSS patterns from security config
        self.SUSPICIOUS_PATTERNS = (
            security_settings.SQL_INJECTION_PATTERNS +
            security_settings.XSS_PATTERNS + [
                r"\.\./",          # Path traversal
                r"\.\.\\",         # Path traversal (Windows)
            ]
        )
    
    async def dispatch(self, request: Request, call_next):
        if not self.enabled:
            return await call_next(request)

        # Always pass OPTIONS preflight through — CORS middleware handles it
        if request.method == "OPTIONS":
            return await call_next(request)

        # Validate request size
        if request.headers.get("content-length"):
            content_length = int(request.headers["content-length"])
            if content_length > self.max_content_length:  # Use configured limit
                security_logger.warning(f"Request too large: {content_length} bytes from {request.client.host}")
                return JSONResponse(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    content={"detail": "Request entity too large"}
                )
        
        # Validate URL and query parameters
        if self._contains_suspicious_content(str(request.url)):
            security_logger.warning(f"Suspicious URL detected: {request.url} from {request.client.host}")
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"detail": "Invalid request"}
            )
        
        # Validate headers (excluding legitimate multipart content and auth headers)
        for header, value in request.headers.items():
            # Skip validation for legitimate multipart form data
            if header.lower() == "content-type" and "multipart/form-data" in value.lower():
                continue
            
            # Skip validation for authorization headers (JWT tokens are legitimate)
            if header.lower() == "authorization":
                continue
                
            if self._contains_suspicious_content(value):
                security_logger.warning(f"Suspicious header detected: {header}={value} from {request.client.host}")
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content={"detail": "Invalid request headers"}
                )
                
        # Validate request body for JSON requests
        if request.method in ["POST", "PUT", "PATCH"] and request.headers.get("content-type", "").lower().startswith("application/json"):
            try:
                # Save the request body for later use
                body = await request.body()
                
                # Check body content
                if self._contains_suspicious_content(body.decode('utf-8', errors='ignore')):
                    security_logger.warning(f"Suspicious JSON payload detected from {request.client.host}")
                    return JSONResponse(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        content={"detail": "Invalid request data"}
                    )
                
                # Restore the request body for downstream handlers
                async def receive():
                    return {"type": "http.request", "body": body}
                    
                request._receive = receive
            except Exception as e:
                security_logger.error(f"Error validating request body: {str(e)}")
                # Continue processing if there's an error
        
        return await call_next(request)
    
    def _contains_suspicious_content(self, content: str) -> bool:
        """Check if content contains suspicious patterns"""
        content_lower = content.lower()
        for pattern in self.SUSPICIOUS_PATTERNS:
            if re.search(pattern, content_lower, re.IGNORECASE):
                return True
        return False

class AuditMiddleware(BaseHTTPMiddleware):
    """
    Comprehensive audit and logging middleware
    """
    
    def __init__(self, app):
        super().__init__(app)
        self.enabled = security_settings.SECURITY_MONITORING_ENABLED
        self.audit_log_file = security_settings.AUDIT_LOG_FILE
        self.audit_log_level = security_settings.AUDIT_LOG_LEVEL
        self.audit_log_format = security_settings.AUDIT_LOG_FORMAT
        self.certificate_access_logging = security_settings.CERTIFICATE_ACCESS_LOGGING_ENABLED
        
        # Configure file handler for audit log if enabled
        if self.enabled and self.audit_log_file:
            file_handler = logging.FileHandler(self.audit_log_file)
            file_handler.setFormatter(logging.Formatter(self.audit_log_format))
            security_logger.addHandler(file_handler)
            security_logger.setLevel(getattr(logging, self.audit_log_level))
            
        self.sensitive_endpoints = {
            "/api/v1/auth/login",
            "/api/v1/auth/register",
            "/api/v1/certificates",
            "/api/v1/admin",
            "/api/v1/security_monitoring"
        }
    
    async def dispatch(self, request: Request, call_next):
        start_time = datetime.utcnow()
        client_ip = self._get_client_ip(request)
        
        # Log request details for sensitive endpoints
        if any(endpoint in str(request.url.path) for endpoint in self.sensitive_endpoints):
            security_logger.info(
                f"AUDIT: {request.method} {request.url.path} from {client_ip} "
                f"User-Agent: {request.headers.get('user-agent', 'Unknown')}"
            )
        
        response = await call_next(request)
        
        # Calculate response time
        end_time = datetime.utcnow()
        response_time = (end_time - start_time).total_seconds()
        
        # Log suspicious activities
        if response.status_code == 401:
            security_logger.warning(
                f"SECURITY: Unauthorized access attempt to {request.url.path} from {client_ip}"
            )
        elif response.status_code >= 400:
            security_logger.info(
                f"ERROR: {request.method} {request.url.path} -> {response.status_code} "
                f"from {client_ip} ({response_time:.3f}s)"
            )
        
        # Add audit headers
        response.headers["X-Request-ID"] = self._generate_request_id(request)
        response.headers["X-Response-Time"] = f"{response_time:.3f}s"
        
        return response
    
    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP from request headers"""
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        return request.client.host if request.client else "unknown"
    
    def _generate_request_id(self, request: Request) -> str:
        """Generate unique request ID for tracking"""
        unique_string = f"{time.time()}-{request.client.host if request.client else 'unknown'}-{request.url.path}"
        return hashlib.md5(unique_string.encode()).hexdigest()[:16]

class FailedAuthenticationTracker:
    """
    Track failed authentication attempts and implement temporary lockouts
    """
    
    def __init__(self, max_attempts: int = 5, lockout_duration: int = 300):
        self.max_attempts = max_attempts
        self.lockout_duration = lockout_duration  # 5 minutes
        self.failed_attempts = defaultdict(list)
        self.locked_accounts = {}
    
    def record_failed_attempt(self, identifier: str) -> bool:
        """
        Record a failed authentication attempt
        Returns True if account should be locked
        """
        now = datetime.utcnow()
        attempts = self.failed_attempts[identifier]
        
        # Clean old attempts (older than lockout duration)
        attempts[:] = [attempt for attempt in attempts 
                      if (now - attempt).total_seconds() < self.lockout_duration]
        
        # Add new attempt
        attempts.append(now)
        
        # Check if should lock
        if len(attempts) >= self.max_attempts:
            self.locked_accounts[identifier] = now + timedelta(seconds=self.lockout_duration)
            security_logger.warning(f"Account temporarily locked due to failed attempts: {identifier}")
            return True
        
        return False
    
    def is_locked(self, identifier: str) -> bool:
        """Check if account is currently locked"""
        if identifier not in self.locked_accounts:
            return False
        
        lock_until = self.locked_accounts[identifier]
        if datetime.utcnow() > lock_until:
            # Lock expired, remove it
            del self.locked_accounts[identifier]
            return False
        
        return True
    
    def clear_failed_attempts(self, identifier: str):
        """Clear failed attempts for successful authentication"""
        if identifier in self.failed_attempts:
            del self.failed_attempts[identifier]
        if identifier in self.locked_accounts:
            del self.locked_accounts[identifier]

# Global instance for tracking failed authentication
auth_tracker = FailedAuthenticationTracker()

def validate_and_sanitize_input(data: dict, field_rules: dict) -> dict:
    """
    Validate and sanitize input data based on field rules
    
    Args:
        data: Input data to validate
        field_rules: Dict of field_name -> validation rules
    
    Returns:
        Sanitized data
    
    Raises:
        HTTPException: If validation fails
    """
    sanitized = {}
    
    for field, value in data.items():
        if field in field_rules:
            rule = field_rules[field]
            
            # Check required fields
            if rule.get('required', False) and (value is None or str(value).strip() == ''):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Field '{field}' is required"
                )
            
            # Skip validation for None values if not required
            if value is None and not rule.get('required', False):
                sanitized[field] = None
                continue
            
            # Type validation
            expected_type = rule.get('type', str)
            if not isinstance(value, expected_type):
                try:
                    value = expected_type(value)
                except (ValueError, TypeError):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Field '{field}' must be of type {expected_type.__name__}"
                    )
            
            # Length validation
            if isinstance(value, str):
                min_len = rule.get('min_length', 0)
                max_len = rule.get('max_length', 1000)
                if len(value) < min_len or len(value) > max_len:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Field '{field}' must be between {min_len} and {max_len} characters"
                    )
                
                # Pattern validation
                if 'pattern' in rule:
                    if not re.match(rule['pattern'], value):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Field '{field}' format is invalid"
                        )
                
                # XSS sanitization
                value = sanitize_html(value)
            
            sanitized[field] = value
    
    return sanitized

def sanitize_html(text: str) -> str:
    """
    Basic HTML sanitization to prevent XSS attacks
    """
    if not isinstance(text, str):
        return text
    
    # Remove potentially dangerous HTML tags and JavaScript
    dangerous_patterns = [
        r'<script[^>]*>.*?</script>',
        r'<iframe[^>]*>.*?</iframe>',
        r'<object[^>]*>.*?</object>',
        r'<embed[^>]*>',
        r'<link[^>]*>',
        r'<meta[^>]*>',
        r'javascript:',
        r'on\w+\s*=',
    ]
    
    for pattern in dangerous_patterns:
        text = re.sub(pattern, '', text, flags=re.IGNORECASE | re.DOTALL)
    
    # Encode remaining HTML entities
    text = text.replace('&', '&amp;')
    text = text.replace('<', '&lt;')
    text = text.replace('>', '&gt;')
    text = text.replace('"', '&quot;')
    text = text.replace("'", '&#x27;')
    
    return text

# Validation rules for common inputs
VALIDATION_RULES = {
    'email': {
        'required': True,
        'type': str,
        'max_length': 254,
        'pattern': r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    },
    'password': {
        'required': True,
        'type': str,
        'min_length': 8,
        'max_length': 128
    },
    'full_name': {
        'required': True,
        'type': str,
        'min_length': 2,
        'max_length': 100,
        'pattern': r'^[a-zA-Z\s\-\.\']+$'
    },
    'event_name': {
        'required': True,
        'type': str,
        'min_length': 3,
        'max_length': 100
    },
    'event_description': {
        'required': False,
        'type': str,
        'max_length': 1000
    },
    'certificate_name': {
        'required': True,
        'type': str,
        'min_length': 2,
        'max_length': 100
    }
}
