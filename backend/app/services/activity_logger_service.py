"""
Simplified Activity Logger Service - Basic implementation for activity logs
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.models.database import ActivityLog, User
from sqlalchemy import desc, and_
import json


class ActivityLoggerService:
    """Simple activity logger service for tracking system activities"""
    
    def log_activity(
        self, 
        db: Session, 
        user_id: Optional[int], 
        action: str, 
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> ActivityLog:
        """Log a new activity"""
        try:
            activity_log = ActivityLog(
                user_id=user_id,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                details=json.dumps(details) if details else None,
                ip_address=ip_address,
                user_agent=user_agent,
                timestamp=datetime.utcnow()
            )
            
            db.add(activity_log)
            db.commit()
            db.refresh(activity_log)
            
            return activity_log
        
        except Exception as e:
            db.rollback()
            raise Exception(f"Failed to log activity: {str(e)}")
    
    def get_system_activities(
        self,
        db: Session,
        limit: int = 100,
        days: int = 7,
        activity_types: Optional[List[str]] = None,
        user_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Get system activities with filtering"""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            
            query = db.query(ActivityLog).filter(
                ActivityLog.timestamp >= cutoff_date
            )
            
            if activity_types:
                query = query.filter(ActivityLog.action.in_(activity_types))
            
            if user_id:
                query = query.filter(ActivityLog.user_id == user_id)
            
            activities = query.order_by(desc(ActivityLog.timestamp)).limit(limit).all()
            
            result = []
            for activity in activities:
                # Get user info if available
                user_info = None
                if activity.user_id:
                    user = db.query(User).filter(User.id == activity.user_id).first()
                    if user:
                        user_info = {
                            "username": user.username,
                            "email": user.email,
                            "role": user.role
                        }
                
                activity_dict = {
                    "id": activity.id,
                    "user_id": activity.user_id,
                    "user_info": user_info,
                    "action": activity.action,
                    "resource_type": activity.resource_type,
                    "resource_id": activity.resource_id,
                    "details": json.loads(activity.details) if activity.details else None,
                    "ip_address": activity.ip_address,
                    "user_agent": activity.user_agent,
                    "timestamp": activity.timestamp.isoformat() if activity.timestamp else None
                }
                result.append(activity_dict)
            
            return result
            
        except Exception as e:
            raise Exception(f"Failed to retrieve activities: {str(e)}")
    
    def get_user_activities(
        self,
        db: Session,
        user_id: int,
        limit: int = 50,
        days: int = 30
    ) -> List[Dict[str, Any]]:
        """Get activities for a specific user"""
        return self.get_system_activities(
            db=db,
            limit=limit,
            days=days,
            user_id=user_id
        )
    
    def get_activity_stats(
        self,
        db: Session,
        days: int = 30
    ) -> Dict[str, Any]:
        """Get activity statistics"""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            
            # Total activities
            total_activities = db.query(ActivityLog).filter(
                ActivityLog.timestamp >= cutoff_date
            ).count()
            
            # Activities by action
            activities_by_action = {}
            actions = db.query(ActivityLog.action).filter(
                ActivityLog.timestamp >= cutoff_date
            ).distinct().all()
            
            for (action,) in actions:
                count = db.query(ActivityLog).filter(
                    and_(
                        ActivityLog.timestamp >= cutoff_date,
                        ActivityLog.action == action
                    )
                ).count()
                activities_by_action[action] = count
            
            # Most active users
            user_activity_counts = {}
            user_activities = db.query(ActivityLog.user_id).filter(
                and_(
                    ActivityLog.timestamp >= cutoff_date,
                    ActivityLog.user_id.isnot(None)
                )
            ).all()
            
            for (user_id,) in user_activities:
                user_activity_counts[user_id] = user_activity_counts.get(user_id, 0) + 1
            
            # Get top 5 most active users
            top_users = sorted(user_activity_counts.items(), key=lambda x: x[1], reverse=True)[:5]
            top_users_info = []
            
            for user_id, count in top_users:
                user = db.query(User).filter(User.id == user_id).first()
                if user:
                    top_users_info.append({
                        "user_id": user_id,
                        "username": user.username,
                        "activity_count": count
                    })
            
            return {
                "total_activities": total_activities,
                "activities_by_action": activities_by_action,
                "top_active_users": top_users_info,
                "days_analyzed": days,
                "date_range": {
                    "start": cutoff_date.isoformat(),
                    "end": datetime.utcnow().isoformat()
                }
            }
            
        except Exception as e:
            raise Exception(f"Failed to get activity stats: {str(e)}")


# Global instance
activity_logger_service = ActivityLoggerService()
