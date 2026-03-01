from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta

from app.core.database import get_db
from app.core.security import get_password_hash, verify_password, create_access_token
from app.core.config import settings
from app.core.auth import get_current_user
from app.models.database import User as UserModel, UserRole
from app.models.schemas import User, UserCreate, UserUpdate, Token, LoginRequest, Response, PasswordChange
from app.services.enhanced_auth_service import enhanced_auth_service
from app.services.audit_service import audit_service, SecurityEventType, SecuritySeverity
from app.services.did_service import generate_did
from app.services.wallet_service import set_private_key as wallet_set_private_key

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=Response)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user"""
    try:
        # Check if user already exists
        existing_user = db.query(UserModel).filter(UserModel.email == user_data.email).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )

        # Determine requested role
        requested_role = user_data.role if user_data.role in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.USER] else UserRole.USER

        # Approval logic per role:
        # - super_admin → always auto-approved (for demo/academic use)
        # - admin       → needs super_admin approval
        # - user/student→ needs admin approval
        if requested_role == UserRole.SUPER_ADMIN:
            is_approved = True
            approval_message = "Super Admin account created successfully. You can log in immediately."
        elif requested_role == UserRole.ADMIN:
            is_approved = False
            approval_message = "Admin account created. Waiting for Super Admin approval before you can log in."
        else:
            is_approved = False
            approval_message = "Student account created. Waiting for Admin approval before you can log in."

        hashed_password = get_password_hash(user_data.password)

        # Generate DID for the new user (ownership verification layer)
        did_id, public_key_pem, private_key_pem = generate_did()

        import base64
        private_key_b64 = base64.b64encode(private_key_pem.encode()).decode()

        new_user = UserModel(
            email=user_data.email,
            full_name=user_data.full_name,
            hashed_password=hashed_password,
            role=requested_role,
            is_active=True,
            is_approved=is_approved,
            did_id=did_id,
            public_key=public_key_pem,
            private_key_b64=private_key_b64,
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        # Store private key in wallet (server-side; also persisted in DB as base64)
        wallet_set_private_key(new_user.id, private_key_pem)

        return Response(
            success=True,
            message=approval_message,
            data={
                "user_id": new_user.id,
                "role": requested_role,
                "is_approved": is_approved,
                "did_id": did_id
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}"
        )

@router.post("/login", response_model=Token)
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Login user and return access token"""
    try:
        # Get client IP address
        ip_address = None
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            ip_address = forwarded_for.split(",")[0].strip()
        else:
            ip_address = request.client.host if request.client else "unknown"
            
        # Log authentication attempt for debugging
        print(f"Login attempt: email={form_data.username}, ip={ip_address}")
        
        # Use enhanced authentication service
        try:
            user = enhanced_auth_service.authenticate_user(
                db=db,
                email=form_data.username,
                password=form_data.password,
                request=request
            )
            
            if not user:
                # Log failed login attempt
                audit_service.log_security_event(
                    event_type=SecurityEventType.LOGIN_FAILED,
                    severity=SecuritySeverity.MEDIUM,  # Using correct enum value
                    user_id=None,
                    user_email=form_data.username,
                    ip_address=ip_address,
                    user_agent=request.headers.get("User-Agent", "unknown"),
                    details={"reason": "invalid_credentials"}
                )
                
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Incorrect email or password",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        
        except HTTPException:
            # Re-raise HTTP exceptions (they already contain proper logging)
            raise
        
        # Create access token
        access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
        access_token = create_access_token(
            data={
                "sub": user.email,
                "role": user.role.value  # Include the user role in the token
            }, 
            expires_delta=access_token_expires
        )
        
        # Log successful login
        audit_service.log_security_event(
            event_type=SecurityEventType.LOGIN_SUCCESS,
            severity=SecuritySeverity.LOW,  # Correct enum value
            user_id=user.id,
            user_email=user.email,
            ip_address=ip_address,
            user_agent=request.headers.get("User-Agent", "unknown"),
            details={"role": user.role.value}
        )
        
        # Reload private key into wallet from DB (in case of server restart)
        import base64
        if user.private_key_b64:
            try:
                private_key_pem = base64.b64decode(user.private_key_b64).decode()
                wallet_set_private_key(user.id, private_key_pem)
            except Exception:
                pass

        # Auto-link any unlinked certificates to this user by email
        try:
            from app.models.database import Certificate as CertificateModel, CertificateStatus
            unlinked = db.query(CertificateModel).filter(
                CertificateModel.recipient_email == user.email,
                CertificateModel.recipient_id.is_(None)
            ).all()
            for cert in unlinked:
                cert.recipient_id = user.id
            if unlinked:
                db.commit()
        except Exception:
            pass

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role.value,
                "is_active": user.is_active,
                "is_approved": user.is_approved,
                "did_id": user.did_id,
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        # Log system error
        audit_service.log_security_event(
            event_type=SecurityEventType.SUSPICIOUS_ACTIVITY,
            severity=SecuritySeverity.HIGH,  # Correct enum value
            user_id=None,
            user_email=form_data.username if form_data else None,
            ip_address=ip_address if 'ip_address' in locals() else "unknown",
            details={"error": str(e), "endpoint": "/auth/login"}
        )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Login failed: {str(e)}"
        )

@router.get("/me", response_model=User)
async def get_current_user_info(current_user: UserModel = Depends(get_current_user)):
    """Get current user information"""
    return current_user

@router.get("/profile", response_model=User)
async def get_user_profile(current_user: UserModel = Depends(get_current_user)):
    """Get current user profile"""
    return current_user

@router.put("/profile", response_model=User)
async def update_user_profile(
    profile_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Update current user profile"""
    try:
        # Check if email is being changed and if it's already taken
        if profile_data.email and profile_data.email != current_user.email:
            existing_user = db.query(UserModel).filter(
                UserModel.email == profile_data.email,
                UserModel.id != current_user.id
            ).first()
            if existing_user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already registered"
                )
            current_user.email = profile_data.email
        
        # Update profile fields
        if profile_data.full_name:
            current_user.full_name = profile_data.full_name
        if profile_data.username:
            # Check if username is already taken
            existing_user = db.query(UserModel).filter(
                UserModel.username == profile_data.username,
                UserModel.id != current_user.id
            ).first()
            if existing_user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Username already taken"
                )
            current_user.username = profile_data.username
        
        db.commit()
        db.refresh(current_user)
        
        return current_user
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Profile update failed: {str(e)}"
        )

@router.post("/change-password", response_model=Response)
async def change_password(
    password_data: PasswordChange,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Change user password"""
    try:
        # Verify current password
        if not verify_password(password_data.current_password, current_user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Incorrect current password"
            )
        
        # Validate new password
        if len(password_data.new_password) < 8:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be at least 8 characters long"
            )
        
        # Update password
        current_user.hashed_password = get_password_hash(password_data.new_password)
        db.commit()
        
        return Response(
            success=True,
            message="Password changed successfully",
            data={"user_id": current_user.id}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Password change failed: {str(e)}"
        )

@router.post("/forgot-password", response_model=Response)
async def forgot_password(email: str, db: Session = Depends(get_db)):
    """Send password reset email"""
    try:
        # Find user by email
        user = db.query(UserModel).filter(UserModel.email == email).first()
        
        if not user:
            # Don't reveal if user exists for security
            return Response(
                success=True,
                message="If an account with that email exists, a password reset link has been sent.",
                data=None
            )
        
        # For now, just return success message (email service would be implemented here)
        # In production, you would:
        # 1. Generate a secure reset token
        # 2. Store it in database with expiration
        # 3. Send email with reset link
        
        return Response(
            success=True,
            message="If an account with that email exists, a password reset link has been sent.",
            data=None
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Password reset failed: {str(e)}"
        )
