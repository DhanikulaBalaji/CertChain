"""
API Dependencies
"""

from typing import List
from fastapi import Depends, HTTPException, status
from app.core.auth import get_current_user
from app.models.database import User, UserRole

def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """Get current active user"""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    return current_user

def require_role(allowed_roles: List[str]):
    """Dependency factory to require specific roles"""
    def role_checker(current_user: User = Depends(get_current_active_user)) -> User:
        if current_user.role.value not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {allowed_roles}"
            )
        return current_user
    
    return role_checker
