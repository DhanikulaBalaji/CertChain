"""
Admin Certificate Generation API Routes
Provides frontend-compatible endpoints for certificate generation
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.core.auth import require_admin
from app.models.database import User as UserModel
from app.models.schemas import Response

router = APIRouter(prefix="/admin/certificates", tags=["Admin Certificate Generation"])

# Separate router for certificates endpoints (no admin prefix)
cert_router = APIRouter(prefix="/certificates", tags=["Certificate Operations"])

# Template router for TemplateManager compatibility
template_router = APIRouter(prefix="/templates", tags=["Template Operations"])

@router.post("/generate-single", response_model=Response)
async def admin_generate_single_certificate(
    event_id: int = Form(...),
    recipient_name: str = Form(...),
    recipient_email: str = Form(...),
    template_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Generate a single certificate (Admin endpoint for frontend compatibility)"""
    try:
        # Import here to avoid circular imports
        from app.api.certificates import generate_certificate
        from app.models.schemas import CertificateCreate
        
        # Create certificate request
        certificate_request = CertificateCreate(
            recipient_name=recipient_name,
            event_id=event_id,
            recipient_id=None
        )
        
        # Generate the certificate using the existing function
        return await generate_certificate(
            certificate=certificate_request,
            db=db,
            current_user=current_user
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Certificate generation failed: {str(e)}"
        )

@router.post("/generate-bulk", response_model=Response)
async def admin_generate_bulk_certificates(
    event_id: int = Form(...),
    recipients_file: UploadFile = File(...),
    template_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Generate bulk certificates (Admin endpoint for frontend compatibility)"""
    try:
        # Import here to avoid circular imports
        from app.api.certificates import generate_bulk_certificates
        
        # Generate bulk certificates using the existing function
        return await generate_bulk_certificates(
            event_id=event_id,
            recipients_file=recipients_file,
            db=db,
            current_user=current_user
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Bulk certificate generation failed: {str(e)}"
        )

# Additional endpoint for AdminDashboard compatibility
@cert_router.post("/bulk-generate", response_model=Response)
async def certificates_bulk_generate(
    event_id: int = Form(...),
    recipients_file: UploadFile = File(...),
    template_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin)
):
    """Generate bulk certificates (Alternative endpoint for AdminDashboard)"""
    return await admin_generate_bulk_certificates(
        event_id=event_id,
        recipients_file=recipients_file,
        template_id=template_id,
        db=db,
        current_user=current_user
    )


# Template endpoints for TemplateManager compatibility
@template_router.get("/")
async def get_all_templates(current_user: UserModel = Depends(require_admin)):
    """Get all templates for TemplateManager"""
    db = next(get_db())
    try:
        from app.models import Template
        templates = db.query(Template).all()
        return [
            {
                "id": template.id,
                "name": template.name,
                "description": template.description,
                "logo_url": template.logo_url,
                "background_url": template.background_url,
                "font_family": template.font_family,
                "font_size": template.font_size,
                "created_at": template.created_at,
                "updated_at": template.updated_at
            }
            for template in templates
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch templates: {str(e)}")
    finally:
        db.close()


@template_router.post("/")
async def create_template(
    name: str = Form(...),
    description: str = Form(None),
    font_family: str = Form("Arial"),
    font_size: int = Form(20),
    logo: UploadFile = File(None),
    background: UploadFile = File(None),
    current_user: UserModel = Depends(require_admin)
):
    """Create new template for TemplateManager"""
    from app.api.admin import create_template as admin_create_template
    
    return await admin_create_template(
        name=name,
        description=description,
        font_family=font_family,
        font_size=font_size,
        logo=logo,
        background=background,
        current_user=current_user
    )


@template_router.put("/{template_id}")
async def update_template(
    template_id: int,
    name: str = Form(...),
    description: str = Form(None),
    font_family: str = Form("Arial"),
    font_size: int = Form(20),
    logo: UploadFile = File(None),
    background: UploadFile = File(None),
    current_user: UserModel = Depends(require_admin)
):
    """Update template for TemplateManager"""
    from app.api.admin import update_template as admin_update_template
    
    return await admin_update_template(
        template_id=template_id,
        name=name,
        description=description,
        font_family=font_family,
        font_size=font_size,
        logo=logo,
        background=background,
        current_user=current_user
    )


@template_router.delete("/{template_id}")
async def delete_template(
    template_id: int,
    current_user: UserModel = Depends(require_admin)
):
    """Delete template for TemplateManager"""
    from app.api.admin import delete_template as admin_delete_template
    
    return await admin_delete_template(template_id, current_user)
