from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey, Enum, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.base import Base

class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    USER = "user"

class EventStatus(str, enum.Enum):
    ACTIVE = "active"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    REVOKED = "revoked"
    CLOSED = "closed"  # New status for events where certificates can be viewed

class CertificateStatus(str, enum.Enum):
    ACTIVE = "active"
    REVOKED = "revoked"
    SUSPENDED = "suspended"

class ValidationStatus(str, enum.Enum):
    VALID = "valid"
    TAMPERED = "tampered"
    SUSPICIOUS = "suspicious"
    NOT_FOUND = "not_found"

class NotificationType(str, enum.Enum):
    EVENT_APPROVED = "event_approved"
    EVENT_REJECTED = "event_rejected"
    CERTIFICATE_GENERATED = "certificate_generated"
    BULK_CERTIFICATES_GENERATED = "bulk_certificates_generated"
    EVENT_CREATED = "event_created"
    SYSTEM_ALERT = "system_alert"

class NotificationStatus(str, enum.Enum):
    UNREAD = "unread"
    READ = "read"
    ARCHIVED = "archived"

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.USER)
    is_active = Column(Boolean, default=True)
    is_approved = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    
    # Relationships
    certificates = relationship("Certificate", foreign_keys="Certificate.recipient_id", back_populates="recipient")
    admin_events = relationship("Event", foreign_keys="Event.admin_id", back_populates="admin")

class Event(Base):
    __tablename__ = "events"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    date = Column(DateTime, nullable=False)
    admin_id = Column(Integer, ForeignKey("users.id"))
    is_approved = Column(Boolean, default=False)
    status = Column(String, default="pending")
    approved_by = Column(Integer, ForeignKey("users.id"))
    approved_at = Column(DateTime)
    rejected_by = Column(Integer, ForeignKey("users.id"))
    rejected_at = Column(DateTime)
    rejection_reason = Column(Text)
    template_path = Column(String)
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    admin = relationship("User", foreign_keys=[admin_id], back_populates="admin_events")
    approver = relationship("User", foreign_keys=[approved_by])
    certificates = relationship("Certificate", back_populates="event")
    participants = relationship("EventParticipant", back_populates="event")

class EventParticipant(Base):
    __tablename__ = "event_participants"
    
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Optional for guest participants
    
    # Participant details
    participant_name = Column(String, nullable=False)
    participant_email = Column(String, nullable=False)
    participant_phone = Column(String)
    registration_date = Column(DateTime, server_default=func.now())
    attendance_status = Column(String, default="registered")  # registered, attended, absent
    is_certificate_generated = Column(Boolean, default=False)
    notes = Column(Text)
    
    # Relationships
    event = relationship("Event", back_populates="participants")
    user = relationship("User")
    
    # Composite unique constraint
    __table_args__ = (
        UniqueConstraint('event_id', 'participant_email', name='unique_event_participant'),
    )

class Certificate(Base):
    __tablename__ = "certificates"
    
    id = Column(Integer, primary_key=True, index=True)
    certificate_id = Column(String, unique=True, index=True, nullable=False)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Optional user reference
    event_id = Column(Integer, ForeignKey("events.id"))
    
    # Certificate details
    recipient_name = Column(String, nullable=False)
    participant_id = Column(String, nullable=True)  # Add participant/student ID field
    recipient_email = Column(String)  # Add email field for notifications
    sha256_hash = Column(String, nullable=False)
    blockchain_tx_hash = Column(String)
    qr_code_data = Column(Text)
    
    # File paths
    pdf_path = Column(String)
    qr_code_path = Column(String)
    
    # Status and validation
    status = Column(Enum(CertificateStatus), default=CertificateStatus.ACTIVE)
    is_verified = Column(Boolean, default=False)
    
    # Revocation details
    revoked_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # Who revoked it
    revocation_reason = Column(Text, nullable=True)  # Why it was revoked
    
    # Timestamps
    issued_at = Column(DateTime, server_default=func.now())
    revoked_at = Column(DateTime)
    
    # Relationships
    recipient = relationship("User", foreign_keys=[recipient_id], back_populates="certificates")
    event = relationship("Event", back_populates="certificates")
    validations = relationship("ValidationLog", back_populates="certificate")
    revoker = relationship("User", foreign_keys=[revoked_by])  # Who revoked the certificate

class ValidationLog(Base):
    __tablename__ = "validation_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    certificate_id = Column(Integer, ForeignKey("certificates.id"))
    validator_ip = Column(String)
    validation_method = Column(String)  # "qr_code" or "manual_id"
    validation_result = Column(Enum(ValidationStatus))
    details = Column(Text)  # JSON details about validation checks
    timestamp = Column(DateTime, server_default=func.now())
    
    # Relationships
    certificate = relationship("Certificate", back_populates="validations")

class TamperLog(Base):
    __tablename__ = "tamper_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    certificate_id = Column(Integer, ForeignKey("certificates.id"))
    tamper_type = Column(String)  # "hash_mismatch", "ocr_mismatch", "image_tampered"
    details = Column(Text)
    detected_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    certificate = relationship("Certificate", foreign_keys=[certificate_id])

class Notification(Base):
    __tablename__ = "notifications"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    notification_type = Column(Enum(NotificationType), nullable=False)
    status = Column(Enum(NotificationStatus), default=NotificationStatus.UNREAD)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id])

class BlockchainTransaction(Base):
    __tablename__ = "blockchain_transactions"
    
    id = Column(Integer, primary_key=True, index=True)
    certificate_id = Column(Integer, ForeignKey("certificates.id"))
    transaction_hash = Column(String, unique=True, nullable=False)
    block_number = Column(Integer)
    gas_used = Column(Integer)
    transaction_fee = Column(String)  # Wei amount as string
    status = Column(String)  # "pending", "confirmed", "failed"
    created_at = Column(DateTime, server_default=func.now())
    confirmed_at = Column(DateTime)
    
    # Relationships
    certificate = relationship("Certificate", foreign_keys=[certificate_id])


class ActivityLog(Base):
    __tablename__ = "activity_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)  # "login", "certificate_create", "certificate_validate", etc.
    resource_type = Column(String, nullable=True)  # "certificate", "event", "user", etc.
    resource_id = Column(String, nullable=True)
    details = Column(Text, nullable=True)  # JSON string with additional details
    ip_address = Column(String, nullable=True)
    user_agent = Column(Text, nullable=True)
    timestamp = Column(DateTime, server_default=func.now())
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id])

class CertificateTemplate(Base):
    __tablename__ = "certificate_templates"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    file_path = Column(String, nullable=False)  # Path to template background image
    preview_path = Column(String)  # Path to template preview image
    fields = Column(Text)  # JSON string defining dynamic fields and their positions
    width = Column(Integer, default=800)  # Template width in pixels
    height = Column(Integer, default=600)  # Template height in pixels
    is_active = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    
    # Relationships
    creator = relationship("User", foreign_keys=[created_by])
