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

from app.core.database import get_db
from app.core.auth import get_current_approved_user, require_admin, require_super_admin
from app.models.database import User as UserModel, Certificate as CertificateModel, Event as EventModel, EventParticipant as EventParticipantModel, CertificateStatus
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
    """Get certificates for the current user (only for events they participated in)"""
    try:
        # Find certificates for events where the user was a participant
        certificates = db.query(CertificateModel).join(
            EventModel, CertificateModel.event_id == EventModel.id
        ).join(
            EventParticipantModel, EventModel.id == EventParticipantModel.event_id
        ).filter(
            # User was a participant in the event
            EventParticipantModel.participant_email == current_user.email,
            # Certificate recipient matches participant
            (CertificateModel.recipient_name == current_user.full_name) |
            (CertificateModel.recipient_name == current_user.email) |
            (CertificateModel.recipient_name == EventParticipantModel.participant_name)
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
        
        # Check if certificate file exists
        import os
        pdf_path = certificate.certificate_path
        if not pdf_path or not os.path.exists(pdf_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Certificate file not found on server"
            )
        
        # Return the file
        return FileResponse(
            path=pdf_path,
            filename=f"certificate_{certificate_id}.pdf",
            media_type="application/pdf"
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
        
        # Store in database
        new_certificate = CertificateModel(
            certificate_id=generated_cert['certificate_id'],
            recipient_name=certificate_data.recipient_name,
            participant_id=participant_id,  # Store the participant ID
            recipient_id=None,  # Set to None since this is not a user reference
            event_id=certificate_data.event_id,
            pdf_path=generated_cert['pdf_path'],
            qr_code_path=generated_cert['qr_code_path'],
            qr_code_data=generated_cert.get('qr_code_data'),  # Store QR code data
            blockchain_tx_hash=generated_cert.get('blockchain_tx'),
            sha256_hash=generated_cert.get('hash'),
            status=CertificateStatus.ACTIVE
        )
        
        db.add(new_certificate)
        db.commit()
        db.refresh(new_certificate)
        
        # Send notification to user (if email is provided)
        if certificate_data.recipient_id:  # Assuming this is an email or user identifier
            notification_service = NotificationService(db)
            await notification_service.send_certificate_notification(
                new_certificate.id,
                certificate_data.recipient_id
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
                    # Store in database
                    new_certificate = CertificateModel(
                        certificate_id=generated_cert['certificate_id'],
                        recipient_name=recipient['recipient_name'],
                        participant_id=recipient['participant_id'],
                        recipient_email=recipient['email'],
                        recipient_id=None,  # Set to None since this is not a user reference
                        event_id=event_id,
                        pdf_path=generated_cert['pdf_path'],
                        qr_code_path=generated_cert['qr_code_path'],
                        qr_code_data=generated_cert.get('qr_code_data'),  # Store QR code data
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
            result.append({
                "id": cert.id,
                "certificate_id": cert.certificate_id,
                "recipient_name": cert.recipient_name,
                "event_name": cert.event.name if cert.event else "Unknown Event",
                "event_date": cert.event.date.isoformat() if cert.event and cert.event.date else "",
                "status": cert.status.value if cert.status else "active",
                "issued_date": cert.issued_at.isoformat() if cert.issued_at else ""
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
    
    if not certificate.certificate_path or not os.path.exists(certificate.certificate_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate file not found"
        )
    
    return FileResponse(
        certificate.certificate_path,
        media_type="application/pdf",
        filename=f"certificate_{certificate_id}.pdf"
    )

@router.post("/validate", response_model=ValidationResult)
async def validate_certificate(
    validation_request: ValidationRequest,
    db: Session = Depends(get_db)
):
    """Validate certificate authenticity"""
    try:
        # Get certificate from database
        certificate = db.query(CertificateModel).filter(
            CertificateModel.certificate_id == validation_request.certificate_id
        ).first()
        
        if not certificate:
            return ValidationResult(
                is_valid=False,
                message="Certificate not found",
                details={}
            )
        
        # Check certificate status
        if certificate.status != CertificateStatus.ACTIVE:
            return ValidationResult(
                is_valid=False,
                message=f"Certificate is {certificate.status}",
                details={"status": certificate.status}
            )
        
        # Validate using certificate validator service
        validation_result = await certificate_validator.validate_certificate(
            certificate_id=validation_request.certificate_id,
            expected_hash=validation_request.expected_hash
        )
        
        # Check for tampering
        tampering_result = await tamper_detection_service.check_certificate_integrity(
            certificate.certificate_path,
            certificate.blockchain_hash
        )
        
        if not tampering_result['is_valid']:
            return ValidationResult(
                is_valid=False,
                message="Certificate has been tampered with",
                details=tampering_result
            )
        
        return ValidationResult(
            is_valid=validation_result['is_valid'],
            message=validation_result['message'],
            details={
                "recipient_name": certificate.recipient_name,
                "event_id": certificate.event_id,
                "issued_at": certificate.issued_at.strftime('%Y-%m-%d %H:%M:%S') if certificate.issued_at else None,
                "blockchain_hash": certificate.blockchain_hash,
                "status": certificate.status
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Validation failed: {str(e)}"
        )

@router.put("/{certificate_id}/revoke", response_model=Response)
async def revoke_certificate(
    certificate_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Revoke a certificate (Admin only)"""
    certificate = db.query(CertificateModel).filter(
        CertificateModel.certificate_id == certificate_id
    ).first()
    
    if not certificate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate not found"
        )
    
    certificate.status = CertificateStatus.REVOKED
    db.commit()
    
    return Response(
        success=True,
        message="Certificate revoked successfully"
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
    if certificate.certificate_path and os.path.exists(certificate.certificate_path):
        os.remove(certificate.certificate_path)
    
    if certificate.qr_code_path and os.path.exists(certificate.qr_code_path):
        os.remove(certificate.qr_code_path)
    
    db.delete(certificate)
    db.commit()
    
    return Response(
        success=True,
        message="Certificate deleted successfully"
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
