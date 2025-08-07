from datetime import datetime
from sqlalchemy.ext.declarative import declared_attr
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin
from . import db

class BaseModel(db.Model):
    __abstract__ = True

    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @declared_attr
    def __tablename__(cls):
        return cls.__name__.lower() + 's'

class User(BaseModel, UserMixin):
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(128), nullable=False)
    full_name = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(50), default='user')
    is_active = db.Column(db.Boolean, default=True)
    is_approved = db.Column(db.Boolean, default=False)
    last_login = db.Column(db.DateTime, nullable=True)

    def set_password(self, password):
        self.password = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password, password)

    def get_id(self):
        return self.id

class Event(BaseModel):
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    date = db.Column(db.DateTime, nullable=False)
    is_approved = db.Column(db.Boolean, default=False)
    status = db.Column(db.String(50), default='upcoming')
    admin_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Relationships
    admin = db.relationship('User', backref='events', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'date': self.date.isoformat() if self.date else None,
            'is_approved': self.is_approved,
            'status': self.status,
            'admin_id': self.admin_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

class Certificate(db.Model):
    __tablename__ = 'certificates'
    
    id = db.Column(db.Integer, primary_key=True)
    certificate_id = db.Column(db.String(50), unique=True, nullable=False)
    participant_id = db.Column(db.String(50), nullable=True, index=True)
    recipient_name = db.Column(db.String(255), nullable=False)
    recipient_email = db.Column(db.String(255), nullable=True)
    recipient_phone = db.Column(db.String(20), nullable=True)
    event_id = db.Column(db.Integer, db.ForeignKey('events.id'), nullable=False)
    status = db.Column(db.String(20), default='valid', nullable=False)
    issued_at = db.Column(db.DateTime, default=datetime.utcnow)
    file_path = db.Column(db.String(500), nullable=True)
    certificate_hash = db.Column(db.String(64), nullable=True)
    is_template = db.Column(db.Boolean, default=False)
    metadata = db.Column(db.JSON, nullable=True)
    
    # Relationships
    event = db.relationship('Event', backref='certificates', lazy=True)

    @staticmethod
    def generate_participant_id(prefix='PART'):
        """Generate auto-incremented participant ID with prefix"""
        import random
        import string
        
        # Get the last participant ID with this prefix
        last_cert = Certificate.query.filter(
            Certificate.participant_id.like(f'{prefix}-%')
        ).order_by(Certificate.participant_id.desc()).first()
        
        if last_cert and last_cert.participant_id:
            try:
                # Extract number from last ID (e.g., PART-001 -> 1)
                last_num = int(last_cert.participant_id.split('-')[-1])
                new_num = last_num + 1
            except (ValueError, IndexError):
                new_num = 1
        else:
            new_num = 1
        
        return f"{prefix}-{new_num:03d}"  # Format as 001, 002, etc.

    @staticmethod
    def generate_certificate_id():
        """Generate unique certificate ID"""
        import uuid
        import hashlib
        
        # Generate a shorter, more readable certificate ID
        unique_str = str(uuid.uuid4())
        hash_obj = hashlib.md5(unique_str.encode())
        return f"CERT-{hash_obj.hexdigest()[:8].upper()}"