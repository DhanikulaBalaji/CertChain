from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.core.database import get_db
from app.core.auth import get_current_approved_user
from app.models.database import User as UserModel, Notification as NotificationModel
from app.models.schemas import Notification, NotificationCreate, Response, NotificationResponse

router = APIRouter(prefix="/notifications", tags=["Notifications"])

@router.get("/", response_model=List[NotificationResponse])
async def get_notifications(
    skip: int = 0,
    limit: int = 100,
    unread_only: bool = False,
    notification_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_approved_user)
):
    """Get notifications for the current user"""
    try:
        query = db.query(NotificationModel).filter(
            NotificationModel.user_id == current_user.id
        )
        
        if unread_only:
            query = query.filter(NotificationModel.is_read == False)
        
        if notification_type:
            query = query.filter(NotificationModel.notification_type == notification_type)
        
        notifications = query.order_by(
            NotificationModel.created_at.desc()
        ).offset(skip).limit(limit).all()
        
        # Transform to the response model
        result = []
        for notif in notifications:
            result.append(NotificationResponse(
                id=notif.id,
                title=notif.title,
                message=notif.message,
                notification_type=notif.notification_type.value if hasattr(notif.notification_type, 'value') else str(notif.notification_type),
                is_read=notif.is_read,
                created_at=notif.created_at
            ))
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve notifications: {str(e)}"
        )

@router.get("/unread-count", response_model=dict)
async def get_unread_count(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_approved_user)
):
    """Get count of unread notifications for the current user"""
    try:
        count = db.query(NotificationModel).filter(
            NotificationModel.user_id == current_user.id,
            NotificationModel.is_read == False
        ).count()
        
        return {"unread_count": count}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get unread count: {str(e)}"
        )

@router.put("/{notification_id}/mark-read", response_model=Response)
async def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_approved_user)
):
    """Mark a notification as read"""
    try:
        notification = db.query(NotificationModel).filter(
            NotificationModel.id == notification_id,
            NotificationModel.user_id == current_user.id
        ).first()
        
        if not notification:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Notification not found"
            )
        
        notification.is_read = True
        db.commit()
        
        return Response(
            success=True,
            message="Notification marked as read",
            data={"notification_id": notification_id}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to mark notification as read: {str(e)}"
        )

@router.put("/mark-all-read", response_model=Response)
async def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_approved_user)
):
    """Mark all notifications as read for the current user"""
    try:
        notifications = db.query(NotificationModel).filter(
            NotificationModel.user_id == current_user.id,
            NotificationModel.is_read == False
        ).all()
        
        for notification in notifications:
            notification.is_read = True
        
        db.commit()
        
        return Response(
            success=True,
            message=f"Marked {len(notifications)} notifications as read",
            data={"count": len(notifications)}
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to mark all notifications as read: {str(e)}"
        )

@router.delete("/{notification_id}", response_model=Response)
async def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_approved_user)
):
    """Delete a notification"""
    try:
        notification = db.query(NotificationModel).filter(
            NotificationModel.id == notification_id,
            NotificationModel.user_id == current_user.id
        ).first()
        
        if not notification:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Notification not found"
            )
        
        db.delete(notification)
        db.commit()
        
        return Response(
            success=True,
            message="Notification deleted successfully",
            data={"notification_id": notification_id}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete notification: {str(e)}"
        )
