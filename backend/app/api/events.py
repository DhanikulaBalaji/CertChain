from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import shutil
from datetime import datetime

from app.core.database import get_db
from app.core.auth import get_current_approved_user, require_admin, require_super_admin
from app.core.config import settings
from app.models.database import User as UserModel, Event as EventModel
from app.models.schemas import Event, EventCreate, EventUpdate, EventWithAdmin, Response
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/events", tags=["Events"])

@router.post("/", response_model=Response)
async def create_event(
    name: str = Form(...),
    description: str = Form(...),
    date: str = Form(...),
    template_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Create a new event (Admin only)"""
    try:
        from datetime import datetime
        
        # Parse the date string
        try:
            event_date = datetime.fromisoformat(date)
        except ValueError:
            # Try alternative date formats
            try:
                event_date = datetime.strptime(date, '%Y-%m-%d')
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date format. Use YYYY-MM-DD or ISO format."
                )
        
        # Create new event
        new_event = EventModel(
            name=name,
            description=description,
            date=event_date,
            admin_id=current_user.id,
            is_approved=False,  # Requires Super Admin approval
            status="pending"    # Set explicit status
        )
        
        db.add(new_event)
        db.commit()
        db.refresh(new_event)
        
        # Handle template file upload if provided
        if template_file and template_file.filename:
            # Create upload directory if it doesn't exist
            upload_dir = os.path.join(settings.UPLOAD_DIR, "templates")
            os.makedirs(upload_dir, exist_ok=True)
            
            # Save the template file
            file_path = os.path.join(upload_dir, f"event_{new_event.id}_{template_file.filename}")
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(template_file.file, buffer)
            
            # Update event with template path
            new_event.template_path = file_path
            db.commit()
        
        return Response(
            success=True,
            message="Event created successfully. Waiting for Super Admin approval.",
            data={"event_id": new_event.id}
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Event creation failed: {str(e)}"
        )

@router.post("/create", response_model=Response)
async def create_event_json(
    event: EventCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Create a new event using JSON data (Admin only)"""
    try:
        # Create new event
        new_event = EventModel(
            name=event.name,
            description=event.description,
            date=event.date,
            admin_id=current_user.id,
            is_approved=False,  # Requires Super Admin approval
            status="pending"    # Set explicit status
        )
        
        db.add(new_event)
        db.commit()
        db.refresh(new_event)
        
        # Send notification to super admin about new event
        try:
            notification_service = NotificationService(db)
            notification_service.create_notification(
                recipient_id=None,  # Super admin notification
                title="New Event Created",
                message=f"Admin {current_user.full_name} created event '{event.name}' requiring approval",
                notification_type="event_created",
                related_entity_type="event",
                related_entity_id=new_event.id
            )
        except Exception as e:
            print(f"Failed to send notification: {e}")
        
        return Response(
            success=True,
            message="Event created successfully. Waiting for Super Admin approval.",
            data={
                "event_id": new_event.id,
                "name": new_event.name,
                "description": new_event.description,
                "date": new_event.date.isoformat(),
                "status": new_event.status
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Event creation failed: {str(e)}"
        )

@router.post("/{event_id}/template", response_model=Response)
async def upload_event_template(
    event_id: int,
    template_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Upload certificate template for an event (Admin only)"""
    try:
        # Verify event exists and user owns it
        event = db.query(EventModel).filter(EventModel.id == event_id).first()
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found"
            )
        
        # Check if user owns the event or is super admin
        if event.admin_id != current_user.id and current_user.role.value != "super_admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only upload templates for your own events"
            )
        
        # Validate file type
        allowed_extensions = ['.png', '.jpg', '.jpeg']
        file_extension = os.path.splitext(template_file.filename)[1].lower()
        if file_extension not in allowed_extensions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only PNG and JPEG files are allowed for templates"
            )
        
        # Create filename and save path
        template_filename = f"template_event_{event_id}{file_extension}"
        template_path = os.path.join(settings.templates_dir, template_filename)
        
        # Save template file
        with open(template_path, "wb") as buffer:
            shutil.copyfileobj(template_file.file, buffer)
        
        # Update event with template path
        event.template_path = template_path
        db.commit()
        
        return Response(
            success=True,
            message="Template uploaded successfully",
            data={
                "event_id": event_id,
                "template_path": template_path,
                "filename": template_filename
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Template upload failed: {str(e)}"
        )

@router.get("/", response_model=List[EventWithAdmin])
async def list_events(
    skip: int = 0,
    limit: int = 100,
    approved_only: bool = True,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_approved_user)
):
    """List events with admin information"""
    from sqlalchemy.orm import joinedload
    
    query = db.query(EventModel).options(joinedload(EventModel.admin))
    
    # Role-based filtering
    if current_user.role.value == "admin":
        # Admins see their own events + approved events
        query = query.filter(
            (EventModel.admin_id == current_user.id) | 
            (EventModel.is_approved == True)
        )
    elif current_user.role.value == "user":
        # Users only see approved events
        query = query.filter(EventModel.is_approved == True)
    # Super admins see all events
    
    # Apply approved filter if requested
    if approved_only and current_user.role.value != "super_admin":
        query = query.filter(EventModel.is_approved == True)
    
    events = query.offset(skip).limit(limit).all()
    
    # Convert to EventWithAdmin format
    result = []
    for event in events:
        event_dict = {
            "id": event.id,
            "name": event.name,
            "description": event.description,
            "date": event.date,
            "admin_id": event.admin_id,
            "admin_name": event.admin.full_name if event.admin else "Unknown Admin",
            "is_approved": event.is_approved,
            "approved_by": event.approved_by,
            "template_path": event.template_path,
            "status": event.status,
            "created_at": event.created_at
        }
        result.append(event_dict)
    
    return result

@router.get("/my-events", response_model=List[Event])
async def get_my_events(
    include_rejected: bool = False,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Get events created by the current admin. By default, excludes rejected events."""
    query = db.query(EventModel).filter(EventModel.admin_id == current_user.id)
    
    # By default, exclude rejected events from the portal view
    if not include_rejected:
        query = query.filter(EventModel.status != "rejected")
    
    events = query.order_by(EventModel.created_at.desc()).all()
    return events

@router.get("/approved-events")
async def get_approved_events(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_approved_user)
):
    """Get all approved events available for user registration"""
    try:
        from sqlalchemy.orm import joinedload
        
        # Get all approved events that are not closed yet
        approved_events = db.query(EventModel).options(
            joinedload(EventModel.admin)
        ).filter(
            EventModel.is_approved == True,
            EventModel.status == "approved"
        ).order_by(EventModel.date.desc()).all()
        
        result = []
        for event in approved_events:
            result.append({
                "id": event.id,
                "name": event.name,
                "description": event.description,
                "date": event.date.isoformat() if event.date else "",
                "admin_name": event.admin.full_name if event.admin else "Unknown Admin",
                "status": event.status,
                "is_approved": event.is_approved,
                "approved_at": event.approved_at.isoformat() if event.approved_at else "",
                "created_at": event.created_at.isoformat() if event.created_at else ""
            })
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch approved events: {str(e)}"
        )

@router.get("/{event_id}", response_model=Event)
async def get_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_approved_user)
):
    """Get a specific event"""
    event = db.query(EventModel).filter(EventModel.id == event_id).first()
    
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )
    
    # Check permissions
    if (current_user.role.value == "user" and not event.is_approved):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Event not approved for public viewing"
        )
    
    if (current_user.role.value == "admin" and 
        event.admin_id != current_user.id and 
        not event.is_approved):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    return event

@router.put("/{event_id}", response_model=Response)
async def update_event(
    event_id: int,
    event_update: EventUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Update an event (Admin only)"""
    try:
        event = db.query(EventModel).filter(EventModel.id == event_id).first()
        
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found"
            )
        
        # Check if user owns the event or is super admin
        if event.admin_id != current_user.id and current_user.role.value != "super_admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only update your own events"
            )
        
        # Update event fields
        update_data = event_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(event, field, value)
        
        # If event was approved and is being modified, require re-approval
        if event.is_approved and current_user.role.value != "super_admin":
            event.is_approved = False
            event.approved_by = None
        
        db.commit()
        
        return Response(
            success=True,
            message="Event updated successfully",
            data={"event_id": event_id}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Event update failed: {str(e)}"
        )

@router.put("/{event_id}/approve", response_model=Response)
async def approve_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_super_admin)
):
    """Approve an event (Super Admin only)"""
    try:
        event = db.query(EventModel).filter(EventModel.id == event_id).first()
        
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found"
            )
        
        if event.is_approved:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Event is already approved"
            )
        
        event.is_approved = True
        event.approved_by = current_user.id
        event.status = "approved"
        event.approved_at = datetime.now()
        db.commit()
        
        # Send notification to the admin who created the event
        try:
            notification_service = NotificationService(db)
            notification_service.notify_event_status_change(
                admin_id=event.admin_id,
                event_name=event.name,
                new_status="approved",
                super_admin_name=current_user.full_name
            )
        except Exception as e:
            # Don't fail the approval if notification fails
            print(f"Failed to send approval notification: {str(e)}")
        
        return Response(
            success=True,
            message=f"Event '{event.name}' approved successfully",
            data={"event_id": event_id}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Event approval failed: {str(e)}"
        )

@router.put("/{event_id}/disapprove", response_model=Response)
async def disapprove_event(
    event_id: int,
    reason: str = Form(...),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_super_admin)
):
    """Disapprove an event (Super Admin only)"""
    try:
        event = db.query(EventModel).filter(EventModel.id == event_id).first()
        
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found"
            )
        
        # Get the event creator for notification
        event_creator = db.query(UserModel).filter(UserModel.id == event.admin_id).first()
        
        event.is_approved = False
        event.status = "rejected"
        event.rejection_reason = reason
        event.rejected_by = current_user.id
        event.rejected_at = datetime.utcnow()
        
        # Create notification for event creator using notification service
        try:
            notification_service = NotificationService(db)
            notification_service.notify_event_status_change(
                admin_id=event.admin_id,
                event_name=event.name,
                new_status="rejected",
                reason=reason,
                super_admin_name=current_user.full_name
            )
        except Exception as e:
            # Don't fail the rejection if notification fails
            print(f"Failed to send rejection notification: {str(e)}")
        
        db.commit()
        
        return Response(
            success=True,
            message=f"Event '{event.name}' disapproved successfully. Notification sent to creator.",
            data={"event_id": event_id, "reason": reason}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Event disapproval failed: {str(e)}"
        )

@router.delete("/{event_id}", response_model=Response)
async def delete_event(
    event_id: int,
    force: bool = False,  # Allow force deletion of past events
    permanent: bool = False,  # Permanently delete certificates instead of revoking
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_super_admin)
):
    """Delete an event (Super Admin only). Use force=true to delete past events with certificates. Use permanent=true to permanently delete certificates."""
    try:
        event = db.query(EventModel).filter(EventModel.id == event_id).first()
        
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found"
            )
        
        # Check if event has certificates
        from app.models.database import Certificate as CertificateModel
        cert_count = db.query(CertificateModel).filter(
            CertificateModel.event_id == event_id
        ).count()
        
        # Allow force deletion for super admin of past events
        if cert_count > 0 and not force:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete event with {cert_count} associated certificates. Use force=true to override."
            )
        
        # Handle certificates
        certificates_action = "No certificates affected"
        if cert_count > 0 and force:
            certificates = db.query(CertificateModel).filter(
                CertificateModel.event_id == event_id
            ).all()
            
            if permanent:
                # Permanently delete certificates and their files
                for cert in certificates:
                    # Delete certificate files if they exist
                    if cert.pdf_path and os.path.exists(cert.pdf_path):
                        os.remove(cert.pdf_path)
                    if cert.qr_code_path and os.path.exists(cert.qr_code_path):
                        os.remove(cert.qr_code_path)
                    # Delete from database
                    db.delete(cert)
                certificates_action = f"{cert_count} certificates permanently deleted"
            else:
                # Just revoke certificates (existing behavior)
                for cert in certificates:
                    cert.status = "revoked"
                    cert.revocation_reason = f"Event '{event.name}' was deleted by Super Admin"
                certificates_action = f"{cert_count} certificates revoked"
            
        # Delete template file if exists
        if event.template_path and os.path.exists(event.template_path):
            os.remove(event.template_path)
        
        event_name = event.name
        db.delete(event)
        db.commit()
        
        return Response(
            success=True,
            message=f"Event '{event_name}' {'permanently ' if permanent else ''}deleted successfully. {certificates_action}",
            data={
                "event_id": event_id, 
                "certificates_affected": cert_count if force else 0,
                "permanent_deletion": permanent,
                "action_taken": certificates_action
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Event deletion failed: {str(e)}"
        )

@router.delete("/{event_id}/permanent", response_model=Response)
async def delete_event_permanent(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_super_admin)
):
    """Permanently delete an event and ALL associated data (Super Admin only). 
    This completely removes the event, all certificates, and certificate files from the system."""
    try:
        event = db.query(EventModel).filter(EventModel.id == event_id).first()
        
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found"
            )
        
        # Get certificates count for reporting
        from app.models.database import Certificate as CertificateModel, EventParticipant as EventParticipantModel
        cert_count = db.query(CertificateModel).filter(
            CertificateModel.event_id == event_id
        ).count()
        
        participant_count = db.query(EventParticipantModel).filter(
            EventParticipantModel.event_id == event_id
        ).count()
        
        # Permanently delete all certificates and their files
        certificates = db.query(CertificateModel).filter(
            CertificateModel.event_id == event_id
        ).all()
        
        deleted_files = 0
        for cert in certificates:
            # Delete certificate files if they exist
            if cert.pdf_path and os.path.exists(cert.pdf_path):
                try:
                    os.remove(cert.pdf_path)
                    deleted_files += 1
                except Exception as e:
                    print(f"Warning: Could not delete certificate file {cert.pdf_path}: {e}")
            
            if cert.qr_code_path and os.path.exists(cert.qr_code_path):
                try:
                    os.remove(cert.qr_code_path)
                except Exception as e:
                    print(f"Warning: Could not delete QR code file {cert.qr_code_path}: {e}")
                    
            # Delete certificate from database
            db.delete(cert)
        
        # Delete all event participants
        participants = db.query(EventParticipantModel).filter(
            EventParticipantModel.event_id == event_id
        ).all()
        
        for participant in participants:
            db.delete(participant)
        
        # Delete template file if exists
        if event.template_path and os.path.exists(event.template_path):
            try:
                os.remove(event.template_path)
            except Exception as e:
                print(f"Warning: Could not delete template file {event.template_path}: {e}")
        
        # Log the permanent deletion for audit
        from app.models.database import ActivityLog
        audit_log = ActivityLog(
            user_id=current_user.id,
            action="PERMANENT_EVENT_DELETE",
            resource_type="Event",
            resource_id=str(event_id),
            details=f"Super Admin {current_user.email} permanently deleted event '{event.name}' with {cert_count} certificates and {participant_count} participants"
        )
        db.add(audit_log)
        
        event_name = event.name
        # Delete the event itself
        db.delete(event)
        # Commit all deletions
        db.commit()
        
        return Response(
            success=True,
            message=f"Event '{event_name}' and all associated data permanently deleted. {cert_count} certificates, {participant_count} participants, and {deleted_files} files removed.",
            data={
                "event_id": event_id, 
                "certificates_deleted": cert_count,
                "participants_deleted": participant_count,
                "files_deleted": deleted_files,
                "permanent_deletion": True,
                "audit_logged": True
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Permanent event deletion failed: {str(e)}"
        )

@router.get("/pending/approvals", response_model=List[Event])
async def get_pending_approvals(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_super_admin)
):
    """Get events pending approval (Super Admin only)"""
    pending_events = db.query(EventModel).filter(
        EventModel.is_approved == False
    ).offset(skip).limit(limit).all()
    
    return pending_events

@router.post("/{event_id}/revoke", response_model=Response)
async def revoke_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_super_admin)
):
    """Revoke an event and all its certificates (Super Admin only)"""
    try:
        # Get the event
        event = db.query(EventModel).filter(EventModel.id == event_id).first()
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found"
            )
        
        # Mark event as inactive/revoked
        event.is_approved = False
        event.status = "revoked"
        
        # Also revoke all certificates for this event
        from app.models.database import Certificate as CertificateModel
        certificates = db.query(CertificateModel).filter(
            CertificateModel.event_id == event_id
        ).all()
        
        for cert in certificates:
            cert.status = "revoked"
        
        db.commit()
        
        return Response(
            success=True,
            message=f"Event '{event.name}' and all its certificates have been revoked",
            data={"event_id": event_id, "certificates_revoked": len(certificates)}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Event revocation failed: {str(e)}"
        )

@router.post("/{event_id}/close", response_model=Response)
async def close_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Close an event - allows users to view their certificates"""
    try:
        # Get the event
        event = db.query(EventModel).filter(EventModel.id == event_id).first()
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found"
            )
        
        # Check if user is the event admin or super admin
        if current_user.role.value != "super_admin" and event.admin_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the event admin or super admin can close events"
            )
        
        # Check if event is approved
        if not event.is_approved:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only approved events can be closed"
            )
        
        # Close the event
        event.status = "closed"
        db.commit()
        
        return Response(
            success=True,
            message=f"Event '{event.name}' has been closed. Users can now view their certificates.",
            data={"event_id": event_id, "status": "closed"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Event closure failed: {str(e)}"
        )
