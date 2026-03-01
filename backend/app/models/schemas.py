from pydantic import BaseModel, EmailStr, field_serializer
from typing import Optional, List
from datetime import datetime
from enum import Enum

# Enums
class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    USER = "user"

class CertificateStatus(str, Enum):
    ACTIVE = "active"
    REVOKED = "revoked"
    SUSPENDED = "suspended"

class ValidationStatus(str, Enum):
    VALID = "valid"
    TAMPERED = "tampered"
    SUSPICIOUS = "suspicious"
    NOT_FOUND = "not_found"

# User Schemas
class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.USER

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    is_approved: Optional[bool] = None

class User(UserBase):
    id: int
    is_active: bool
    is_approved: bool
    did_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
    
    @field_serializer('role')
    def serialize_role(self, role):
        """Convert database role to frontend-compatible format"""
        if isinstance(role, str):
            # Map uppercase database values to lowercase frontend values
            role_mapping = {
                'SUPER_ADMIN': 'super_admin',
                'ADMIN': 'admin',
                'USER': 'user'
            }
            return role_mapping.get(role, role.lower())
        elif hasattr(role, 'value'):
            return role.value
        return str(role).lower()

# Authentication Schemas
class TokenUser(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    is_approved: bool
    did_id: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str
    user: Optional[TokenUser] = None

class TokenData(BaseModel):
    email: Optional[str] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

# Event Schemas
class EventBase(BaseModel):
    name: str
    description: str
    date: datetime

class EventCreate(EventBase):
    pass

class EventUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    date: Optional[datetime] = None
    is_approved: Optional[bool] = None

class Event(EventBase):
    id: int
    admin_id: Optional[int] = None
    is_approved: bool
    approved_by: Optional[int] = None
    template_path: Optional[str] = None
    status: Optional[str] = "pending"
    created_at: datetime

    class Config:
        from_attributes = True

class EventWithAdmin(EventBase):
    """Event with admin details for frontend display"""
    id: int
    admin_id: Optional[int] = None
    admin_name: Optional[str] = None
    is_approved: bool
    approved_by: Optional[int] = None
    template_path: Optional[str] = None
    status: Optional[str] = "pending"
    created_at: datetime

    class Config:
        from_attributes = True

# Certificate Schemas
class CertificateBase(BaseModel):
    recipient_name: str
    participant_id: Optional[str] = None  # Add participant ID field

class CertificateCreate(CertificateBase):
    event_id: int
    recipient_id: Optional[str] = None  # Optional: email or user identifier for linking to wallet
    recipient_email: Optional[str] = None  # Recipient email (used to set recipient_id for wallet)

class CertificateResponse(CertificateBase):
    certificate_id: str

class CertificateBulkCreate(BaseModel):
    event_id: int
    recipients: List[dict]  # List of recipient data from CSV

class Certificate(CertificateResponse):
    id: int
    event_id: int
    recipient_id: Optional[int] = None
    sha256_hash: str
    blockchain_tx_hash: Optional[str] = None
    qr_code_data: Optional[str] = None
    pdf_path: Optional[str] = None
    status: CertificateStatus
    is_verified: bool
    issued_at: datetime
    revoked_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Frontend-specific schemas
class CertificateWithEvent(BaseModel):
    """Certificate with event details for frontend display"""
    id: int
    certificate_id: str
    recipient_name: str
    recipient_email: Optional[str] = None
    participant_id: Optional[str] = None
    event_name: str
    event_date: str
    event_description: Optional[str] = None
    status: str
    issued_date: str
    sha256_hash: Optional[str] = None
    is_verified: bool = False
    blockchain_tx_hash: Optional[str] = None

    class Config:
        from_attributes = True

class NotificationResponse(BaseModel):
    """Notification response for frontend"""
    id: int
    title: str
    message: str
    notification_type: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Validation Schemas
class ValidationRequest(BaseModel):
    certificate_id: Optional[str] = None
    qr_code_data: Optional[str] = None

class ValidationResult(BaseModel):
    status: ValidationStatus
    certificate: Optional[Certificate] = None
    details: dict
    timestamp: datetime
    message: Optional[str] = None  # Human-readable message for frontend
    certificate_id: Optional[str] = None  # For frontend display when certificate is present
    validation_timestamp: Optional[datetime] = None  # Alias for frontend (same as timestamp)

class ValidationLogCreate(BaseModel):
    certificate_id: int
    validator_ip: str
    validation_method: str
    validation_result: ValidationStatus
    details: dict

# Notification Schemas
class NotificationBase(BaseModel):
    title: str
    message: str
    notification_type: str

class NotificationCreate(NotificationBase):
    user_id: int

class Notification(NotificationBase):
    id: int
    user_id: int
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Blockchain Schemas
class BlockchainTransactionCreate(BaseModel):
    certificate_id: int
    transaction_hash: str
    gas_used: Optional[int] = None
    transaction_fee: Optional[str] = None

class BlockchainTransaction(BaseModel):
    id: int
    certificate_id: int
    transaction_hash: str
    block_number: Optional[int] = None
    gas_used: Optional[int] = None
    transaction_fee: Optional[str] = None
    status: str
    created_at: datetime
    confirmed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Dashboard Schemas
class UserDashboard(BaseModel):
    user: User
    certificates_count: int
    recent_certificates: List[Certificate]
    notifications_count: int
    recent_notifications: List[Notification]

class AdminDashboard(BaseModel):
    user: User
    events_count: int
    certificates_generated: int
    pending_approvals: int
    recent_events: List[Event]

class SuperAdminDashboard(BaseModel):
    user: User
    total_users: int
    total_admins: int
    total_certificates: int
    pending_approvals: int
    recent_tamper_attempts: int
    system_stats: dict

# File Upload Schemas
class FileUploadResponse(BaseModel):
    filename: str
    file_path: str
    file_size: int
    upload_timestamp: datetime

# System Response Schemas
class Response(BaseModel):
    success: bool
    message: str
    data: Optional[dict] = None

class ErrorResponse(BaseModel):
    success: bool = False
    message: str
    error_code: Optional[str] = None

# Event Participant Schemas
class EventParticipantBase(BaseModel):
    participant_name: str
    participant_email: EmailStr
    participant_phone: Optional[str] = None
    notes: Optional[str] = None

class EventParticipantCreate(EventParticipantBase):
    event_id: int
    attendance_status: Optional[str] = "registered"

class EventParticipantUpdate(BaseModel):
    participant_name: Optional[str] = None
    participant_email: Optional[EmailStr] = None
    participant_phone: Optional[str] = None
    attendance_status: Optional[str] = None
    notes: Optional[str] = None

class EventParticipant(EventParticipantBase):
    id: int
    event_id: int
    user_id: Optional[int] = None
    registration_date: datetime
    attendance_status: str
    is_certificate_generated: bool

    class Config:
        from_attributes = True

class EventParticipantWithEvent(EventParticipant):
    event_name: Optional[str] = None
    event_date: Optional[datetime] = None
