from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_token
from app.models.database import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    """Get current authenticated user"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    email = verify_token(token, credentials_exception)
    user = db.query(User).filter(User.email == email).first()
    
    if user is None:
        raise credentials_exception
    
    return user

async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """Get current active user"""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    
    return current_user

async def get_current_approved_user(current_user: User = Depends(get_current_active_user)) -> User:
    """Get current approved user"""
    if not current_user.is_approved:
        raise HTTPException(status_code=403, detail="User not approved by admin")
    
    return current_user

def require_role(required_role: UserRole):
    """Dependency factory for role-based access control"""
    def check_role(current_user: User = Depends(get_current_approved_user)):
        user_role_hierarchy = {
            UserRole.USER: 0,
            UserRole.ADMIN: 1,
            UserRole.SUPER_ADMIN: 2
        }
        
        if user_role_hierarchy.get(current_user.role, -1) < user_role_hierarchy.get(required_role, 999):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required role: {required_role}"
            )
        
        return current_user
    
    return check_role

# Role-specific dependencies
require_admin = require_role(UserRole.ADMIN)
require_super_admin = require_role(UserRole.SUPER_ADMIN)
