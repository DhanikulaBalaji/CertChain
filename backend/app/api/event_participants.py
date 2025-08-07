from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
import csv
from io import StringIO

from app.core.database import get_db
from app.core.auth import get_current_approved_user, require_admin
from app.models.database import User as UserModel, Event as EventModel, EventParticipant as EventParticipantModel
from app.models.schemas import (
    EventParticipant, EventParticipantCreate, EventParticipantUpdate, 
    EventParticipantWithEvent, Response
)

router = APIRouter(prefix="/events", tags=["Event Participants"])
user_router = APIRouter(prefix="/event-participants", tags=["User Event Registration"])

# User-facing registration endpoint
@user_router.post("/register", response_model=Response)
async def register_for_event(
    participant_data: EventParticipantCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_approved_user)
):
    """Allow users to register themselves for approved events"""
    try:
        # Check if event exists and is approved
        event = db.query(EventModel).filter(
            EventModel.id == participant_data.event_id,
            EventModel.is_approved == True
        ).first()
        
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found or not approved"
            )
        
        # Check if user is already registered
        existing = db.query(EventParticipantModel).filter(
            EventParticipantModel.event_id == participant_data.event_id,
            EventParticipantModel.participant_email == current_user.email
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You are already registered for this event"
            )
        
        # Create participant record
        new_participant = EventParticipantModel(
            event_id=participant_data.event_id,
            participant_name=participant_data.participant_name or current_user.full_name,
            participant_email=current_user.email,
            user_id=current_user.id,
            attendance_status="registered"
        )
        
        db.add(new_participant)
        db.commit()
        db.refresh(new_participant)
        
        return Response(
            success=True,
            message=f"Successfully registered for event: {event.name}"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to register for event: {str(e)}"
        )

@router.get("/{event_id}/participants", response_model=List[EventParticipant])
async def get_event_participants(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin),
    skip: int = 0,
    limit: int = 100
):
    """Get all participants for a specific event (Admin only)"""
    try:
        # Check if event exists and user has permission
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
                detail="Only the event admin or super admin can view participants"
            )
        
        participants = db.query(EventParticipantModel).filter(
            EventParticipantModel.event_id == event_id
        ).offset(skip).limit(limit).all()
        
        return participants
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch participants: {str(e)}"
        )

@router.post("/{event_id}/participants", response_model=Response)
async def add_event_participant(
    event_id: int,
    participant_data: EventParticipantCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Add a participant to an event (Admin only)"""
    try:
        # Check if event exists and user has permission
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
                detail="Only the event admin or super admin can add participants"
            )
        
        # Check if participant already exists for this event
        existing_participant = db.query(EventParticipantModel).filter(
            EventParticipantModel.event_id == event_id,
            EventParticipantModel.participant_email == participant_data.participant_email
        ).first()
        
        if existing_participant:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Participant already registered for this event"
            )
        
        # Check if participant email matches a registered user
        user = db.query(UserModel).filter(UserModel.email == participant_data.participant_email).first()
        
        # Create new participant
        new_participant = EventParticipantModel(
            event_id=event_id,
            user_id=user.id if user else None,
            participant_name=participant_data.participant_name,
            participant_email=participant_data.participant_email,
            participant_phone=participant_data.participant_phone,
            attendance_status=participant_data.attendance_status,
            notes=participant_data.notes
        )
        
        db.add(new_participant)
        db.commit()
        db.refresh(new_participant)
        
        return Response(
            success=True,
            message=f"Participant '{participant_data.participant_name}' added to event '{event.name}'",
            data={"participant_id": new_participant.id}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add participant: {str(e)}"
        )

@router.put("/{event_id}/participants/{participant_id}", response_model=Response)
async def update_event_participant(
    event_id: int,
    participant_id: int,
    participant_data: EventParticipantUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Update a participant (Admin only)"""
    try:
        # Check if event exists and user has permission
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
                detail="Only the event admin or super admin can update participants"
            )
        
        # Get participant
        participant = db.query(EventParticipantModel).filter(
            EventParticipantModel.id == participant_id,
            EventParticipantModel.event_id == event_id
        ).first()
        
        if not participant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Participant not found"
            )
        
        # Update participant fields
        update_data = participant_data.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(participant, field, value)
        
        db.commit()
        
        return Response(
            success=True,
            message=f"Participant '{participant.participant_name}' updated successfully",
            data={"participant_id": participant_id}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update participant: {str(e)}"
        )

@router.delete("/{event_id}/participants/{participant_id}", response_model=Response)
async def remove_event_participant(
    event_id: int,
    participant_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Remove a participant from an event (Admin only)"""
    try:
        # Check if event exists and user has permission
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
                detail="Only the event admin or super admin can remove participants"
            )
        
        # Get participant
        participant = db.query(EventParticipantModel).filter(
            EventParticipantModel.id == participant_id,
            EventParticipantModel.event_id == event_id
        ).first()
        
        if not participant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Participant not found"
            )
        
        participant_name = participant.participant_name
        db.delete(participant)
        db.commit()
        
        return Response(
            success=True,
            message=f"Participant '{participant_name}' removed from event",
            data={"removed_participant_id": participant_id}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove participant: {str(e)}"
        )

@router.post("/{event_id}/participants/bulk-upload", response_model=Response)
async def bulk_upload_participants(
    event_id: int,
    participants_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Bulk upload participants from CSV file (Admin only)"""
    try:
        # Check if event exists and user has permission
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
                detail="Only the event admin or super admin can upload participants"
            )
        
        # Validate file type
        if not participants_file.filename.endswith('.csv'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be a CSV file"
            )
        
        # Read and parse CSV
        content = await participants_file.read()
        csv_data = StringIO(content.decode('utf-8'))
        csv_reader = csv.DictReader(csv_data)
        
        participants_added = 0
        participants_skipped = 0
        errors = []
        
        for row_num, row in enumerate(csv_reader, start=2):  # Start from 2 to account for header
            try:
                # Required fields
                if not row.get('participant_name') or not row.get('participant_email'):
                    errors.append(f"Row {row_num}: Missing required fields (participant_name, participant_email)")
                    continue
                
                # Check if participant already exists
                existing_participant = db.query(EventParticipantModel).filter(
                    EventParticipantModel.event_id == event_id,
                    EventParticipantModel.participant_email == row['participant_email']
                ).first()
                
                if existing_participant:
                    participants_skipped += 1
                    continue
                
                # Check if participant email matches a registered user
                user = db.query(UserModel).filter(UserModel.email == row['participant_email']).first()
                
                # Create participant
                new_participant = EventParticipantModel(
                    event_id=event_id,
                    user_id=user.id if user else None,
                    participant_name=row['participant_name'],
                    participant_email=row['participant_email'],
                    participant_phone=row.get('participant_phone', ''),
                    attendance_status=row.get('attendance_status', 'registered'),
                    notes=row.get('notes', '')
                )
                
                db.add(new_participant)
                participants_added += 1
                
            except Exception as e:
                errors.append(f"Row {row_num}: {str(e)}")
        
        db.commit()
        
        result_message = f"Bulk upload completed: {participants_added} added, {participants_skipped} skipped"
        if errors:
            result_message += f", {len(errors)} errors"
        
        return Response(
            success=True,
            message=result_message,
            data={
                "participants_added": participants_added,
                "participants_skipped": participants_skipped,
                "errors": errors
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Bulk upload failed: {str(e)}"
        )

@router.put("/{event_id}/participants/{participant_id}/attendance", response_model=Response)
async def update_attendance_status(
    event_id: int,
    participant_id: int,
    attendance_status: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Update participant attendance status (Admin only)"""
    try:
        # Check if event exists and user has permission
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
                detail="Only the event admin or super admin can update attendance"
            )
        
        # Validate attendance status
        valid_statuses = ["registered", "attended", "absent"]
        if attendance_status not in valid_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid attendance status. Must be one of: {', '.join(valid_statuses)}"
            )
        
        # Get participant
        participant = db.query(EventParticipantModel).filter(
            EventParticipantModel.id == participant_id,
            EventParticipantModel.event_id == event_id
        ).first()
        
        if not participant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Participant not found"
            )
        
        participant.attendance_status = attendance_status
        db.commit()
        
        return Response(
            success=True,
            message=f"Attendance status for '{participant.participant_name}' updated to '{attendance_status}'",
            data={"participant_id": participant_id, "attendance_status": attendance_status}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update attendance: {str(e)}"
        )

@user_router.get("/{event_id}/registration-status")
async def check_registration_status(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_approved_user)
):
    """Check if current user is registered for an event"""
    try:
        # Check if user is registered for this event
        registration = db.query(EventParticipantModel).filter(
            EventParticipantModel.event_id == event_id,
            EventParticipantModel.participant_email == current_user.email
        ).first()
        
        return {
            "is_registered": registration is not None,
            "registration_id": registration.id if registration else None,
            "attendance_status": registration.attendance_status if registration else None
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check registration status: {str(e)}"
        )
