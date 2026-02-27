from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import json
import os
import csv
import pandas as pd
from io import StringIO, BytesIO
import random
import string
from datetime import datetime

from app.core.database import get_db
from app.core.auth import get_current_approved_user, require_admin, require_super_admin
from app.models.database import User as UserModel, Certificate as CertificateModel, Event as EventModel, EventParticipant as EventParticipantModel, CertificateStatus, UserRole
from app.models.schemas import Certificate, CertificateCreate, CertificateBulkCreate, ValidationRequest, ValidationResult, Response, CertificateWithEvent
from app.services.certificate_generator import certificate_generator
from app.services.certificate_validator import certificate_validator
from app.services.tamper_detection_service import tamper_detection_service
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/certificates", tags=["Certificates"])

# Admin certificate generation routes (with admin prefix for frontend compatibility)
admin_router = APIRouter(prefix="/admin/certificates", tags=["Admin Certificate Generation"])

def generate_participant_id():
    """Generate a random participant ID"""
    return f"PART-{random.randint(1000, 9999)}"


def _resolve_recipient_user_id(db: Session, email: Optional[str], recipient_id_or_email: Optional[str]) -> Optional[int]:
    """Resolve a registered user's id by email so certificates can be linked to user wallet."""
    email_to_use = email or (recipient_id_or_email if recipient_id_or_email and "@" in str(recipient_id_or_email) else None)
    if not email_to_use:
        return None
    user = db.query(UserModel).filter(UserModel.email == email_to_use.strip()).first()
    return user.id if user else None

def generate_certificate_id():
    """Generate a unique certificate ID"""
    return f"CERT-{''.join(random.choices(string.ascii_uppercase + string.digits, k=12))}"

@router.get("/download-template")
async def download_certificate_template():
    """Download sample Excel template for bulk certificate generation"""
    try:
        # Create sample data
        sample_data = [
            {
                "recipient_name": "John Doe",
                "participant_id": "PART-1001",
                "email": "john.doe@example.com"
            },
            {
                "recipient_name": "Jane Smith", 
                "participant_id": "PART-1002",
                "email": "jane.smith@example.com"
            },
            {
                "recipient_name": "Mike Johnson",
                "participant_id": "",  # Empty to show auto-generation
                "email": "mike.johnson@example.com"
            }
        ]
        
        # Create DataFrame and save to Excel
        df = pd.DataFrame(sample_data)
        
        # Ensure templates directory exists
        os.makedirs("templates", exist_ok=True)
        template_path = "templates/certificate_template.xlsx"
        
        with pd.ExcelWriter(template_path, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Recipients', index=False)
            
            # Add instructions sheet
            instructions = pd.DataFrame({
                'Instructions': [
                    "1. Fill in the recipient_name column with full names",
                    "2. participant_id is optional - leave empty for auto-generation", 
                    "3. email is optional but recommended for notifications",
                    "4. Save as Excel (.xlsx) or CSV (.csv) format",
                    "5. Upload the file when generating bulk certificates",
                    "",
                    "Required columns:",
                    "- recipient_name (required)",
                    "- participant_id (optional - auto-generated if empty)",
                    "- email (optional)",
                    "",
                    "Supported formats: .xlsx, .xls, .csv"
                ]
            })
            instructions.to_excel(writer, sheet_name='Instructions', index=False)
        
        return FileResponse(
            path=template_path,
            filename="certificate_template.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate template: {str(e)}"
        )

@admin_router.post("/generate-single", response_model=Response)
async def admin_generate_single_certificate(
    certificate_data: CertificateCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Generate a single certificate (Admin route for frontend compatibility)"""
    # Call the existing generate_single_certificate function
    return await generate_single_certificate(
        certificate_data=certificate_data,
        db=db,
        current_user=current_user
    )

@admin_router.post("/generate-bulk", response_model=Response)
async def admin_generate_bulk_certificates(
    event_id: int = Form(...),
    recipients_file: UploadFile = File(...),
    template_id: int = Form(None),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Generate bulk certificates (Admin route for frontend compatibility)"""
    # Delegate to the existing bulk generation endpoint
    return await generate_bulk_certificates(
        event_id=event_id,
        recipients_file=recipients_file,
        db=db,
        current_user=current_user
    )

@router.get("", response_model=List[CertificateWithEvent])
async def get_all_certificates(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_super_admin),
    limit: int = 100,
    offset: int = 0
):
    """Get all certificates (Super Admin only)"""
    try:
        certificates = db.query(CertificateModel).join(
            EventModel, CertificateModel.event_id == EventModel.id, isouter=True
        ).offset(offset).limit(limit).all()
        
        result = []
        for cert in certificates:
            event_name = cert.event.name if cert.event else "Unknown Event"
            event_date = cert.event.date.strftime('%Y-%m-%d') if cert.event and cert.event.date else "Unknown Date"
            issued_date = cert.issued_at.strftime('%Y-%m-%d') if cert.issued_at else "Unknown Date"
            
            cert_dict = {
                "id": cert.id,
                "certificate_id": cert.certificate_id,
                "recipient_name": cert.recipient_name,
                "event_name": event_name,
                "event_date": event_date,
                "status": cert.status,
                "issued_date": issued_date
            }
            result.append(cert_dict)
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch certificates: {str(e)}"
        )

@router.get("/my-certificates", response_model=List[CertificateWithEvent])
async def get_user_certificates(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_approved_user),
    limit: int = 100,
    offset: int = 0
):
    """Get certificates for the current user (wallet: issued to them by recipient_id or participant match)"""
    try:
        # Auto-link any certificates that match user's email but don't have recipient_id set
        if current_user.email:
            unlinked = db.query(CertificateModel).filter(
                CertificateModel.recipient_email == current_user.email,
                CertificateModel.recipient_id.is_(None)
            ).all()
            for cert in unlinked:
                cert.recipient_id = current_user.id
            if unlinked:
                db.commit()

        # 1) Certificates issued to this user (recipient_id = current user) - stored in wallet
        by_recipient_id = db.query(CertificateModel).filter(
            CertificateModel.recipient_id == current_user.id
        ).all()
        # 2) Certificates for events where the user was a participant (name/email match)
        by_participant = db.query(CertificateModel).join(
            EventModel, CertificateModel.event_id == EventModel.id
        ).join(
            EventParticipantModel, EventModel.id == EventParticipantModel.event_id
        ).filter(
            EventParticipantModel.participant_email == current_user.email,
            (CertificateModel.recipient_name == current_user.full_name)
            | (CertificateModel.recipient_name == current_user.email)
            | (CertificateModel.recipient_name == EventParticipantModel.participant_name)
        ).all()
        # Union by certificate id to avoid duplicates
        seen_ids = set()
        certificates = []
        for cert in by_recipient_id + by_participant:
            if cert.id not in seen_ids:
                seen_ids.add(cert.id)
                certificates.append(cert)
        certificates = certificates[offset : offset + limit]

        result = []
        for cert in certificates:
            event_name = cert.event.name if cert.event else "Unknown Event"
            event_description = cert.event.description if cert.event else None
            event_date = cert.event.date.strftime('%Y-%m-%d') if cert.event and cert.event.date else "Unknown Date"
            issued_date = cert.issued_at.strftime('%Y-%m-%d') if cert.issued_at else "Unknown Date"
            
            cert_dict = {
                "id": cert.id,
                "certificate_id": cert.certificate_id,
                "recipient_name": cert.recipient_name,
                "recipient_email": cert.recipient_email or "Not provided",
                "participant_id": cert.participant_id or f"PART-{cert.id:04d}",
                "event_name": event_name,
                "event_description": event_description,
                "event_date": event_date,
                "status": cert.status,
                "issued_date": issued_date,
                "sha256_hash": cert.sha256_hash[:16] + "..." if cert.sha256_hash else "Not available",
                "is_verified": cert.is_verified,
                "blockchain_tx_hash": cert.blockchain_tx_hash or "Pending blockchain verification"
            }
            result.append(cert_dict)
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch user certificates: {str(e)}"
        )

@router.get("/download/{certificate_id}")
async def download_certificate(
    certificate_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_approved_user)
):
    """Download certificate PDF (for certificate owners or admins)"""
    try:
        # Find the certificate
        certificate = db.query(CertificateModel).join(
            EventModel, CertificateModel.event_id == EventModel.id, isouter=True
        ).filter(CertificateModel.certificate_id == certificate_id).first()
        
        if not certificate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Certificate not found"
            )
        
        # Check if user can access this certificate
        can_access = False
        
        # Admins and super admins can download any certificate
        if current_user.role.value in ["admin", "super_admin"]:
            can_access = True
        # Regular users can only download their own certificates from closed events
        elif (certificate.event.status == "closed" and 
              (certificate.recipient_name == current_user.full_name or 
               certificate.recipient_name == current_user.email)):
            can_access = True
        
        if not can_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to access this certificate"
            )
        
        # Check if certificate file exists - try multiple paths and formats
        import os
        file_path = None
        filename = None
        media_type = None
        
        # Try PDF first (preferred format)
        possible_pdf_paths = [
            certificate.pdf_path,
            f"./certificates/cert_{certificate_id}.pdf",
            f"certificates/cert_{certificate_id}.pdf",
            f"backend/certificates/cert_{certificate_id}.pdf"
        ]
        
        for path in possible_pdf_paths:
            if path and os.path.exists(path):
                file_path = path
                filename = f"certificate_{certificate_id}.pdf"
                media_type = "application/pdf"
                break
        
        # If PDF not found, try PNG as fallback
        if not file_path:
            possible_png_paths = [
                f"./certificates/cert_{certificate_id}.png",
                f"certificates/cert_{certificate_id}.png",
                f"backend/certificates/cert_{certificate_id}.png"
            ]
            
            for path in possible_png_paths:
                if os.path.exists(path):
                    file_path = path
                    filename = f"certificate_{certificate_id}.png"
                    media_type = "image/png"
                    break
        
        if not file_path:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Certificate file not found for ID: {certificate_id}. Checked both PDF and PNG formats."
            )
        
        # Return the file
        return FileResponse(
            path=file_path,
            filename=filename,
            media_type=media_type
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Certificate download failed: {str(e)}"
        )

@router.post("/generate", response_model=Response)
async def generate_single_certificate(
    certificate_data: CertificateCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Generate a single certificate (Admin only)"""
    try:
        # Verify event exists and is approved
        event = db.query(EventModel).filter(
            EventModel.id == certificate_data.event_id,
            EventModel.is_approved == True
        ).first()
        
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found or not approved"
            )
        
        # Auto-generate participant_id if not provided
        participant_id = certificate_data.participant_id or generate_participant_id()
        
        # Check if certificate already exists for this recipient and event
        existing_cert = db.query(CertificateModel).filter(
            CertificateModel.event_id == certificate_data.event_id,
            CertificateModel.recipient_name == certificate_data.recipient_name
        ).first()
        
        if existing_cert:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Certificate already exists for this recipient and event"
            )
        
        # Prepare certificate generation data
        cert_gen_data = {
            'recipient_name': certificate_data.recipient_name,
            'participant_id': participant_id,
            'event_name': event.name,
            'event_date': event.date.strftime('%Y-%m-%d'),
            'event_id': event.id,
            'template_path': event.template_path
        }
        
        # Generate certificate
        generated_cert = certificate_generator.generate_single_certificate(cert_gen_data)
        
        if not generated_cert:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Certificate generation failed"
            )
        
        # Resolve recipient user so certificate appears in user wallet
        recipient_email = getattr(certificate_data, "recipient_email", None) or (
            certificate_data.recipient_id if certificate_data.recipient_id and "@" in str(certificate_data.recipient_id) else None
        )
        recipient_user_id = _resolve_recipient_user_id(db, recipient_email, certificate_data.recipient_id)

        # Store in database (recipient_id links cert to user wallet)
        new_certificate = CertificateModel(
            certificate_id=generated_cert['certificate_id'],
            recipient_name=certificate_data.recipient_name,
            participant_id=participant_id,
            recipient_id=recipient_user_id,
            recipient_email=recipient_email,
            event_id=certificate_data.event_id,
            pdf_path=generated_cert['pdf_path'],
            qr_code_path=generated_cert['qr_code_path'],
            qr_code_data=generated_cert.get('qr_code_data'),
            blockchain_tx_hash=generated_cert.get('blockchain_tx'),
            sha256_hash=generated_cert.get('hash'),
            status=CertificateStatus.ACTIVE
        )
        
        db.add(new_certificate)
        db.commit()
        db.refresh(new_certificate)
        
        # Send notification to user (if email is provided)
        if certificate_data.recipient_id or recipient_email:
            notification_service = NotificationService(db)
            await notification_service.send_certificate_notification(
                new_certificate.id,
                recipient_email or certificate_data.recipient_id or ""
            )
        
        return Response(
            success=True,
            message="Certificate generated successfully",
            data={
                "certificate_id": new_certificate.certificate_id,
                "download_url": f"/certificates/{new_certificate.certificate_id}/download"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate certificate: {str(e)}"
        )

@router.post("/generate-bulk", response_model=Response)
async def generate_bulk_certificates(
    event_id: int = Form(...),
    recipients_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Generate bulk certificates (Admin only)"""
    try:
        # Verify event exists and is approved
        event = db.query(EventModel).filter(
            EventModel.id == event_id,
            EventModel.is_approved == True
        ).first()
        
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found or not approved"
            )
        
        # Read and process CSV/Excel file
        content = await recipients_file.read()
        filename = recipients_file.filename or ""
        
        recipients = []
        
        try:
            if filename.endswith('.csv'):
                # Process CSV file
                csv_content = content.decode('utf-8')
                csv_reader = csv.DictReader(StringIO(csv_content))
                for row in csv_reader:
                    if 'recipient_name' in row and row['recipient_name'].strip():
                        participants_id = row.get('participant_id', '').strip() or generate_participant_id()
                        recipients.append({
                            'recipient_name': row['recipient_name'].strip(),
                            'participant_id': participants_id,
                            'email': row.get('email', '').strip() or None
                        })
            elif filename.endswith(('.xlsx', '.xls')):
                # Process Excel file
                df = pd.read_excel(BytesIO(content))
                for _, row in df.iterrows():
                    if 'recipient_name' in row and pd.notna(row['recipient_name']) and str(row['recipient_name']).strip():
                        participant_id_val = str(row.get('participant_id', '')).strip() if pd.notna(row.get('participant_id')) else ''
                        participant_id_val = participant_id_val or generate_participant_id()
                        recipients.append({
                            'recipient_name': str(row['recipient_name']).strip(),
                            'participant_id': participant_id_val,
                            'email': str(row.get('email', '')).strip() if pd.notna(row.get('email')) else None
                        })
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Unsupported file format. Please upload CSV (.csv) or Excel (.xlsx, .xls) files."
                )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Error processing file: {str(e)}. Make sure the file contains 'recipient_name' column."
            )
        
        if not recipients:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid recipients found in file. Make sure your file contains a 'recipient_name' column with valid names."
            )
        
        generated_certificates = []
        failed_certificates = []
        
        for recipient in recipients:
            try:
                # Check if certificate already exists
                existing_cert = db.query(CertificateModel).filter(
                    CertificateModel.event_id == event_id,
                    CertificateModel.recipient_name == recipient['recipient_name']
                ).first()
                
                if existing_cert:
                    failed_certificates.append({
                        'recipient_name': recipient['recipient_name'],
                        'error': 'Certificate already exists'
                    })
                    continue
                
                # Prepare certificate generation data
                cert_gen_data = {
                    'recipient_name': recipient['recipient_name'],
                    'participant_id': recipient['participant_id'],
                    'event_name': event.name,
                    'event_date': event.date.strftime('%Y-%m-%d'),
                    'event_id': event.id,
                    'template_path': event.template_path
                }
                
                # Generate certificate
                generated_cert = certificate_generator.generate_single_certificate(cert_gen_data)
                
                if generated_cert:
                    # Resolve recipient user so certificate appears in user wallet
                    recipient_user_id = _resolve_recipient_user_id(db, recipient.get('email'), None)
                    # Store in database (recipient_id links cert to user wallet)
                    new_certificate = CertificateModel(
                        certificate_id=generated_cert['certificate_id'],
                        recipient_name=recipient['recipient_name'],
                        participant_id=recipient['participant_id'],
                        recipient_email=recipient.get('email'),
                        recipient_id=recipient_user_id,
                        event_id=event_id,
                        pdf_path=generated_cert['pdf_path'],
                        qr_code_path=generated_cert['qr_code_path'],
                        qr_code_data=generated_cert.get('qr_code_data'),
                        blockchain_tx_hash=generated_cert.get('blockchain_tx'),
                        sha256_hash=generated_cert.get('hash'),
                        status=CertificateStatus.ACTIVE
                    )
                    
                    db.add(new_certificate)
                    generated_certificates.append(new_certificate.certificate_id)
                else:
                    failed_certificates.append({
                        'recipient_name': recipient['recipient_name'],
                        'error': 'Certificate generation failed'
                    })
                    
            except Exception as e:
                failed_certificates.append({
                    'recipient_name': recipient['recipient_name'],
                    'error': str(e)
                })
        
        db.commit()
        
        return Response(
            success=True,
            message=f"Bulk certificate generation completed. Generated: {len(generated_certificates)}, Failed: {len(failed_certificates)}",
            data={
                "generated_count": len(generated_certificates),
                "failed_count": len(failed_certificates),
                "generated_certificates": generated_certificates,
                "failed_certificates": failed_certificates
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process bulk certificate generation: {str(e)}"
        )

# Frontend-compatible endpoints (what the frontend actually calls)
@router.post("/generate-single", response_model=Response)
async def generate_single_certificate_frontend(
    certificate_data: CertificateCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Generate a single certificate (Frontend-compatible endpoint)"""
    return await generate_single_certificate(
        certificate_data=certificate_data,
        db=db,
        current_user=current_user
    )

@router.post("/bulk-generate", response_model=Response)
async def bulk_generate_certificates_frontend(
    event_id: int = Form(...),
    recipients_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Generate bulk certificates (Frontend-compatible endpoint)"""
    return await generate_bulk_certificates(
        event_id=event_id,
        recipients_file=recipients_file,
        db=db,
        current_user=current_user
    )

@router.get("/admin-certificates", response_model=List[CertificateWithEvent])
async def get_admin_certificates(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Get all certificates created by the current admin"""
    try:
        # Get all events created by this admin
        admin_events = db.query(EventModel).filter(
            EventModel.admin_id == current_user.id
        ).all()
        
        if not admin_events:
            return []
        
        # Get all certificates for these events
        event_ids = [event.id for event in admin_events]
        certificates = db.query(CertificateModel).filter(
            CertificateModel.event_id.in_(event_ids)
        ).order_by(CertificateModel.issued_at.desc()).all()
        
        # Format the response
        result = []
        for cert in certificates:
            # Get revocation details if certificate is revoked
            revoked_by_name = None
            if cert.status == CertificateStatus.REVOKED and cert.revoked_by:
                revoker = db.query(UserModel).filter(UserModel.id == cert.revoked_by).first()
                revoked_by_name = revoker.full_name if revoker else "Unknown"
            
            result.append({
                "id": cert.id,
                "certificate_id": cert.certificate_id,
                "recipient_name": cert.recipient_name,
                "participant_id": cert.participant_id or cert.recipient_name or "Unknown",
                "event_name": cert.event.name if cert.event else "Unknown Event",
                "event_date": cert.event.date.isoformat() if cert.event and cert.event.date else "",
                "status": cert.status.value if cert.status else "active",
                "issued_date": cert.issued_at.isoformat() if cert.issued_at else "",
                "revoked_by": revoked_by_name,
                "revocation_reason": cert.revocation_reason,
                "revoked_at": cert.revoked_at.isoformat() if cert.revoked_at else None
            })
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch admin certificates: {str(e)}"
        )

@router.get("/{certificate_id}", response_model=Certificate)
async def get_certificate(
    certificate_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_approved_user)
):
    """Get certificate by ID"""
    certificate = db.query(CertificateModel).filter(
        CertificateModel.certificate_id == certificate_id
    ).first()
    
    if not certificate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate not found"
        )
    
    return certificate

@router.get("/{certificate_id}/download")
async def download_certificate(
    certificate_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_approved_user)
):
    """Download certificate file"""
    certificate = db.query(CertificateModel).filter(
        CertificateModel.certificate_id == certificate_id
    ).first()
    
    if not certificate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate not found"
        )
    
    # Use pdf_path field (not certificate_path)
    if not certificate.pdf_path or not os.path.exists(certificate.pdf_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate file not found"
        )
    
    return FileResponse(
        certificate.pdf_path,
        media_type="application/pdf",
        filename=f"certificate_{certificate_id}.pdf"
    )

@router.post("/validate", response_model=ValidationResult)
async def validate_certificate(
    validation_request: ValidationRequest,
    db: Session = Depends(get_db)
):
    """Validate certificate authenticity (admin portal)."""
    from app.models.schemas import ValidationStatus as ValidationStatusEnum

    try:
        now = datetime.utcnow()
        if not validation_request.certificate_id and not validation_request.qr_code_data:
            return ValidationResult(
                status=ValidationStatusEnum.NOT_FOUND,
                certificate=None,
                details={"message": "Certificate ID or QR code data is required"},
                timestamp=now,
                validation_timestamp=now,
                message="Certificate ID or QR code data is required",
            )

        # Build validation_data dict (validator expects dict, not keyword args)
        validation_data = {}
        if validation_request.certificate_id:
            validation_data["certificate_id"] = validation_request.certificate_id
        if validation_request.qr_code_data:
            validation_data["qr_code_data"] = validation_request.qr_code_data

        # Validate using certificate validator service (hash comes from DB inside validator)
        validation_result = certificate_validator.validate_certificate(validation_data)

        # Get certificate from database for response
        certificate = None
        if validation_request.certificate_id:
            certificate = db.query(CertificateModel).filter(
                CertificateModel.certificate_id == validation_request.certificate_id
            ).first()

        if not certificate:
            msg = validation_result.get("message", "Certificate not found")
            return ValidationResult(
                status=ValidationStatusEnum.NOT_FOUND,
                certificate=None,
                details={"message": msg},
                timestamp=now,
                validation_timestamp=now,
                message=msg,
            )

        # Check certificate status
        if certificate.status != CertificateStatus.ACTIVE:
            msg = f"Certificate is {certificate.status}"
            return ValidationResult(
                status=ValidationStatusEnum.SUSPICIOUS,
                certificate=None,
                details={"message": msg, "status": str(certificate.status)},
                timestamp=now,
                validation_timestamp=now,
                message=msg,
            )

        issued_at_str = certificate.issued_at.strftime("%Y-%m-%d %H:%M:%S") if certificate.issued_at else None
        event_name = certificate.event.name if certificate.event else None
        details = {
            "recipient_name": certificate.recipient_name,
            "event_id": certificate.event_id,
            "event_name": event_name,
            "issued_at": issued_at_str,
            "issue_date": issued_at_str,
            "blockchain_tx_hash": certificate.blockchain_tx_hash,
            "blockchain_verified": bool(certificate.blockchain_tx_hash),
            "status": str(certificate.status),
            "message": validation_result.get("message", ""),
            "checks": validation_result.get("checks", {}),
        }

        # Map validator status string to enum
        status_str = validation_result.get("status", "valid")
        if status_str == "valid":
            status_enum = ValidationStatusEnum.VALID
        elif status_str == "tampered":
            status_enum = ValidationStatusEnum.TAMPERED
        elif status_str == "suspicious":
            status_enum = ValidationStatusEnum.SUSPICIOUS
        else:
            status_enum = ValidationStatusEnum.SUSPICIOUS

        return ValidationResult(
            status=status_enum,
            certificate=certificate,
            details=details,
            timestamp=now,
            validation_timestamp=now,
            message=validation_result.get("message", ""),
            certificate_id=certificate.certificate_id,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Validation failed: {str(e)}",
        )

@router.post("/{certificate_id}/revoke", response_model=Response)
async def revoke_certificate(
    certificate_id: str,
    reason: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Revoke a certificate (Admin only)"""
    try:
        certificate = db.query(CertificateModel).filter(
            CertificateModel.certificate_id == certificate_id
        ).first()
        
        if not certificate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Certificate not found"
            )
        
        # Check if certificate is already revoked
        if certificate.status == CertificateStatus.REVOKED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Certificate is already revoked"
            )
        
        # Update certificate status and revocation details
        certificate.status = CertificateStatus.REVOKED
        certificate.revoked_by = current_user.id
        certificate.revocation_reason = reason or "Revoked by administrator"
        certificate.revoked_at = datetime.utcnow()
        
        db.commit()
        
        # Send notification
        notification_service = NotificationService(db)
        await notification_service.send_notification(
            user_id=current_user.id,
            title="Certificate Revoked",
            message=f"Certificate for {certificate.recipient_name} has been revoked",
            notification_type="certificate_revoked"
        )
        
        return Response(
            success=True,
            message="Certificate revoked successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to revoke certificate: {str(e)}"
        )

@router.delete("/{certificate_id}", response_model=Response)
async def delete_certificate(
    certificate_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_super_admin)
):
    """Delete a certificate (Super Admin only)"""
    certificate = db.query(CertificateModel).filter(
        CertificateModel.certificate_id == certificate_id
    ).first()
    
    if not certificate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate not found"
        )
    
    # Delete certificate files
    if certificate.pdf_path and os.path.exists(certificate.pdf_path):
        os.remove(certificate.pdf_path)
    
    if certificate.qr_code_path and os.path.exists(certificate.qr_code_path):
        os.remove(certificate.qr_code_path)
    
    db.delete(certificate)
    db.commit()
    
    return Response(
        success=True,
        message="Certificate deleted successfully"
    )

@router.post("/{certificate_id}/reissue", response_model=Response)
async def reissue_certificate(
    certificate_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Re-issue a certificate (Admin only)"""
    try:
        # Find the certificate
        certificate = db.query(CertificateModel).filter(
            CertificateModel.certificate_id == certificate_id
        ).first()
        
        if not certificate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Certificate not found"
            )
        
        # Check if admin owns the event OR if user is SuperAdmin
        if certificate.event.admin_id != current_user.id and current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only re-issue certificates for your events"
            )
        
        # Create a new certificate with the same details but new ID
        new_certificate_id = generate_certificate_id()
        
        # Prepare certificate generation data
        cert_gen_data = {
            'recipient_name': certificate.recipient_name,
            'participant_id': certificate.participant_id or generate_participant_id(),
            'event_name': certificate.event.name,
            'event_date': certificate.event.date.strftime('%Y-%m-%d'),
            'event_id': certificate.event.id,
            'template_path': certificate.event.template_path
        }
        
        # Generate new certificate files
        generated_cert = certificate_generator.generate_single_certificate(cert_gen_data)
        
        if not generated_cert:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Certificate generation failed"
            )
        
        # Update the certificate record with new details
        certificate.certificate_id = generated_cert['certificate_id']
        certificate.pdf_path = generated_cert['pdf_path']
        certificate.qr_code_path = generated_cert['qr_code_path']
        certificate.qr_code_data = generated_cert.get('qr_code_data')
        certificate.blockchain_tx_hash = generated_cert.get('blockchain_tx')
        certificate.sha256_hash = generated_cert.get('hash')
        certificate.status = CertificateStatus.ACTIVE
        certificate.issued_at = datetime.utcnow()
        
        # Clear revocation details since it's being re-issued
        certificate.revoked_by = None
        certificate.revocation_reason = None
        certificate.revoked_at = None
        
        db.commit()
        
        # Send notification
        notification_service = NotificationService(db)
        await notification_service.send_notification(
            user_id=current_user.id,
            title="Certificate Re-issued",
            message=f"Certificate for {certificate.recipient_name} has been re-issued",
            notification_type="certificate_reissued"
        )
        
        return Response(
            success=True,
            message="Certificate re-issued successfully",
            data={
                "new_certificate_id": certificate.certificate_id,
                "download_url": f"/certificates/{certificate.certificate_id}/download"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to re-issue certificate: {str(e)}"
        )

@router.get("/{certificate_id}/tamper-check")
async def check_certificate_tampering(
    certificate_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_approved_user)
):
    """Check certificate for tampering (for certificate owners or admins)"""
    try:
        # Find the certificate
        certificate = db.query(CertificateModel).filter(
            CertificateModel.certificate_id == certificate_id
        ).first()
        
        if not certificate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Certificate not found"
            )
        
        # Check if user has permission to access this certificate
        if current_user.role not in ["admin", "super_admin"]:
            # For regular users, only allow access to their own certificates
            if certificate.recipient_name not in [current_user.full_name, current_user.email]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied to this certificate"
                )
        
        # Check if certificate file exists
        if not certificate.pdf_path or not os.path.exists(certificate.pdf_path):
            return {
                "certificate_id": certificate_id,
                "tamper_detected": False,
                "status": "no_file",
                "message": "Certificate file not found for tamper detection",
                "details": {}
            }
        
        # Perform tamper detection
        tamper_result = tamper_detection_service.detect_tampering(
            certificate_id=certificate_id,
            file_path=certificate.pdf_path,
            db=db,
            original_hash=certificate.sha256_hash
        )
        
        return {
            "certificate_id": certificate_id,
            "tamper_detected": tamper_result.get("tamper_detected", False),
            "confidence_score": tamper_result.get("confidence_score", 0.0),
            "status": "tampered" if tamper_result.get("tamper_detected") else "clean",
            "message": tamper_result.get("report_summary", "Tamper detection completed"),
            "details": tamper_result.get("detection_methods", {}),
            "timestamp": tamper_result.get("timestamp")
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Tamper detection failed: {str(e)}"
        )
