# Template Management for Certificate System
# This module handles the manual creation and management of certificate templates by administrators

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import uuid
import shutil
from PIL import Image, ImageDraw, ImageFont
import json

from app.core.database import get_db
from app.core.auth import require_admin, require_super_admin
from app.core.config import settings
from app.models.schemas import Response
from app.models.database import CertificateTemplate as TemplateModel

"""
TEMPLATE MANAGEMENT API DOCUMENTATION

This API allows administrators to manually manage certificate templates:

1. Uploading custom background images for certificates
2. Positioning text fields for recipient names, event names, dates, etc.
3. Adding digital signatures or logos to templates
4. Previewing templates with sample data
5. Adjusting field positions and properties (font, size, color)

All templates are manually created and managed by administrators.
"""

router = APIRouter(prefix="/admin/templates", tags=["Template Management (Admin Manual)"])

# Ensure templates directory exists
os.makedirs(settings.templates_dir, exist_ok=True)

@router.get("/")
async def list_templates(
    db: Session = Depends(get_db),
    current_user = Depends(require_admin)
):
    """List all available certificate templates (Admin manually uploaded templates)"""
    try:
        # Get templates from database
        templates = db.query(TemplateModel).all()
        
        result = []
        for template in templates:
            template_info = {
                "id": template.id,
                "name": template.name,
                "description": template.description,
                "file_path": template.file_path,
                "preview_path": template.preview_path,
                "fields": json.loads(template.fields) if template.fields else [],
                "created_at": template.created_at.isoformat() if template.created_at else None,
                "is_active": template.is_active,
                "created_by": template.created_by,
                "created_by_name": "Administrator",  # You could fetch the actual admin name if needed
                "manual_upload": True
            }
            result.append(template_info)
        
        # Add default template if no templates exist
        if not result:
            result.append({
                "id": 1,
                "name": "Default Template",
                "description": "Built-in certificate template",
                "file_path": None,
                "preview_path": None,
                "fields": ["name", "event", "date", "certificate_id"],
                "created_at": None,
                "is_active": True
            })
            
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list templates: {str(e)}"
        )

@router.post("/upload")
async def upload_template(
    name: str = Form(...),
    description: str = Form(""),
    template_file: UploadFile = File(...),
    fields_config: str = Form("[]"),  # JSON string of field configurations
    db: Session = Depends(get_db),
    current_user = Depends(require_admin)
):
    """Upload a new certificate template (Admin manual upload)"""
    try:
        # Validate file type
        if not template_file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Template must be an image file (PNG, JPG, JPEG). Please provide a properly formatted background image."
            )
        
        # Generate unique filename
        file_extension = os.path.splitext(template_file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        template_path = os.path.join(settings.templates_dir, unique_filename)
        
        # Save template file
        with open(template_path, "wb") as buffer:
            shutil.copyfileobj(template_file.file, buffer)
        
        # Generate preview (thumbnail)
        preview_filename = f"preview_{unique_filename}"
        preview_path = os.path.join(settings.templates_dir, preview_filename)
        
        try:
            with Image.open(template_path) as img:
                # Create thumbnail for preview
                img.thumbnail((300, 225), Image.Resampling.LANCZOS)
                img.save(preview_path)
        except Exception as e:
            print(f"Failed to create preview: {e}")
            preview_path = None
        
        # Validate and parse fields configuration
        try:
            fields = json.loads(fields_config)
        except json.JSONDecodeError:
            # Default field configuration if admin doesn't provide one
            fields = [
                {"name": "recipient_name", "x": 400, "y": 300, "font_size": 32, "color": "#000000", "font": "Helvetica-Bold"},
                {"name": "event_name", "x": 400, "y": 350, "font_size": 24, "color": "#000000", "font": "Helvetica"},
                {"name": "date", "x": 400, "y": 400, "font_size": 18, "color": "#000000", "font": "Helvetica"},
                {"name": "certificate_id", "x": 400, "y": 450, "font_size": 14, "color": "#000000", "font": "Helvetica"},
                {"name": "signature", "x": 400, "y": 500, "font_size": 16, "color": "#000000", "font": "Helvetica-Bold", "is_image": True}
            ]
        
        # Get image dimensions
        with Image.open(template_path) as img:
            width, height = img.size
        
        # Create template record in database
        new_template = TemplateModel(
            name=name,
            description=description,
            file_path=template_path,
            preview_path=preview_path,
            fields=json.dumps(fields),
            width=width,
            height=height,
            is_active=True,
            created_by=current_user.id
        )
        
        db.add(new_template)
        db.commit()
        db.refresh(new_template)
        
        return Response(
            success=True,
            message="Template uploaded successfully",
            data={
                "template_id": new_template.id,
                "name": new_template.name,
                "file_path": new_template.file_path,
                "preview_path": new_template.preview_path
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Template upload failed: {str(e)}"
        )

@router.get("/{template_id}/preview")
async def get_template_preview(
    template_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin)
):
    """Get template preview image"""
    try:
        template = db.query(TemplateModel).filter(TemplateModel.id == template_id).first()
        
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found"
            )
        
        preview_path = template.preview_path or template.file_path
        
        if not preview_path or not os.path.exists(preview_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template preview not found"
            )
        
        return FileResponse(
            path=preview_path,
            media_type="image/jpeg",
            filename=f"template_preview_{template_id}.jpg"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get template preview: {str(e)}"
        )

@router.put("/{template_id}")
async def update_template(
    template_id: int,
    name: str = Form(None),
    description: str = Form(None),
    fields_config: str = Form(None),
    is_active: bool = Form(None),
    db: Session = Depends(get_db),
    current_user = Depends(require_admin)
):
    """Update template information"""
    try:
        template = db.query(TemplateModel).filter(TemplateModel.id == template_id).first()
        
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found"
            )
        
        # Update fields if provided
        if name is not None:
            template.name = name
        if description is not None:
            template.description = description
        if fields_config is not None:
            try:
                fields = json.loads(fields_config)
                template.fields = json.dumps(fields)
            except json.JSONDecodeError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid fields configuration JSON"
                )
        if is_active is not None:
            template.is_active = is_active
        
        db.commit()
        
        return Response(
            success=True,
            message="Template updated successfully",
            data={"template_id": template_id}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Template update failed: {str(e)}"
        )

@router.delete("/{template_id}")
async def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_super_admin)
):
    """Delete a template (Super Admin only)"""
    try:
        template = db.query(TemplateModel).filter(TemplateModel.id == template_id).first()
        
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found"
            )
        
        # Delete template files
        try:
            if template.file_path and os.path.exists(template.file_path):
                os.remove(template.file_path)
            if template.preview_path and os.path.exists(template.preview_path):
                os.remove(template.preview_path)
        except Exception as e:
            print(f"Failed to delete template files: {e}")
        
        # Delete from database
        db.delete(template)
        db.commit()
        
        return Response(
            success=True,
            message="Template deleted successfully",
            data={"template_id": template_id}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Template deletion failed: {str(e)}"
        )

@router.post("/{template_id}/signature")
async def add_signature_to_template(
    template_id: int,
    signature_file: UploadFile = File(...),
    x_position: int = Form(400),
    y_position: int = Form(500),
    width: Optional[int] = Form(200),
    db: Session = Depends(get_db),
    current_user = Depends(require_admin)
):
    """Add a digital signature to an existing template (Admin manual customization)"""
    try:
        # Check if template exists
        template = db.query(TemplateModel).filter(TemplateModel.id == template_id).first()
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found"
            )
            
        # Validate file type
        if not signature_file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Signature must be an image file (PNG, JPG, JPEG)"
            )
        
        # Generate unique filename for signature
        file_extension = os.path.splitext(signature_file.filename)[1]
        unique_filename = f"signature_{template_id}_{uuid.uuid4()}{file_extension}"
        signature_path = os.path.join(settings.templates_dir, unique_filename)
        
        # Save signature file
        with open(signature_path, "wb") as buffer:
            shutil.copyfileobj(signature_file.file, buffer)
            
        # Update template fields to include signature position
        fields = json.loads(template.fields) if template.fields else []
        
        # Check if signature field already exists
        signature_field_exists = False
        for field in fields:
            if field.get("name") == "signature":
                field["x"] = x_position
                field["y"] = y_position
                field["is_image"] = True
                field["image_path"] = signature_path
                field["width"] = width
                signature_field_exists = True
                break
                
        # Add signature field if it doesn't exist
        if not signature_field_exists:
            fields.append({
                "name": "signature",
                "x": x_position,
                "y": y_position,
                "is_image": True,
                "image_path": signature_path,
                "width": width
            })
            
        # Update template with signature info
        template.fields = json.dumps(fields)
        db.commit()
        
        return Response(
            success=True,
            message="Signature added to template successfully",
            data={
                "template_id": template_id,
                "signature_path": signature_path
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Adding signature to template failed: {str(e)}"
        )

@router.get("/{template_id}/preview-with-data")
async def preview_template_with_sample_data(
    template_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin)
):
    """Preview template with sample data to see how certificates will look (Admin preview tool)"""
    try:
        # Get template
        template = db.query(TemplateModel).filter(TemplateModel.id == template_id).first()
        
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found"
            )
            
        if not template.file_path or not os.path.exists(template.file_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template file not found"
            )
            
        # Create a preview file path
        preview_filename = f"preview_with_data_{template_id}_{uuid.uuid4()}.jpg"
        preview_path = os.path.join(settings.templates_dir, preview_filename)
        
        # Open the template image
        with Image.open(template.file_path) as img:
            draw = ImageDraw.Draw(img)
            
            # Get fields configuration
            fields = json.loads(template.fields) if template.fields else []
            
            # Add sample data
            for field in fields:
                field_name = field.get("name", "")
                x_pos = field.get("x", 400)
                y_pos = field.get("y", 300)
                font_size = field.get("font_size", 24)
                font_name = field.get("font", "Helvetica-Bold")
                color = field.get("color", "#000000")
                
                # Use a default font if the specified font is not available
                try:
                    font = ImageFont.truetype(font_name, font_size)
                except:
                    # Use a default font
                    font = ImageFont.load_default()
                
                # Add sample text based on field name
                if field.get("is_image") and field.get("image_path") and os.path.exists(field.get("image_path")):
                    # If it's an image field like signature, paste the image
                    try:
                        with Image.open(field.get("image_path")) as sig_img:
                            width = field.get("width", sig_img.width)
                            height = int(width * sig_img.height / sig_img.width)
                            sig_img_resized = sig_img.resize((width, height))
                            img.paste(sig_img_resized, (x_pos, y_pos), sig_img_resized if sig_img_resized.mode == 'RGBA' else None)
                    except Exception as e:
                        print(f"Error pasting image: {e}")
                else:
                    # Sample text based on field name
                    if "name" in field_name.lower() or "recipient" in field_name.lower():
                        sample_text = "John Doe"
                    elif "event" in field_name.lower():
                        sample_text = "Blockchain Certification Course"
                    elif "date" in field_name.lower():
                        sample_text = "July 23, 2025"
                    elif "id" in field_name.lower() or "certificate" in field_name.lower():
                        sample_text = "CERT-12345-ABCDE"
                    else:
                        sample_text = f"Sample {field_name}"
                        
                    # Draw the text
                    draw.text((x_pos, y_pos), sample_text, fill=color, font=font)
            
            # Save the preview
            img.save(preview_path)
            
        # Return the preview image
        return FileResponse(
            path=preview_path,
            media_type="image/jpeg",
            filename=f"template_preview_with_data_{template_id}.jpg"
        )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Template preview failed: {str(e)}"
        )
        
@router.post("/{template_id}/update-field")
async def update_template_field(
    template_id: int,
    field_name: str = Form(...),
    x_position: int = Form(None),
    y_position: int = Form(None),
    font_size: int = Form(None),
    color: str = Form(None),
    font: str = Form(None),
    db: Session = Depends(get_db),
    current_user = Depends(require_admin)
):
    """Update field position and properties on a template (Admin manual customization)"""
    try:
        # Get template
        template = db.query(TemplateModel).filter(TemplateModel.id == template_id).first()
        
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found"
            )
            
        # Get current fields
        fields = json.loads(template.fields) if template.fields else []
        
        # Find the field to update
        field_updated = False
        for field in fields:
            if field.get("name") == field_name:
                if x_position is not None:
                    field["x"] = x_position
                if y_position is not None:
                    field["y"] = y_position
                if font_size is not None:
                    field["font_size"] = font_size
                if color is not None:
                    field["color"] = color
                if font is not None:
                    field["font"] = font
                    
                field_updated = True
                break
                
        if not field_updated:
            # Create a new field if it doesn't exist
            new_field = {"name": field_name}
            if x_position is not None:
                new_field["x"] = x_position
            if y_position is not None:
                new_field["y"] = y_position
            if font_size is not None:
                new_field["font_size"] = font_size
            if color is not None:
                new_field["color"] = color
            if font is not None:
                new_field["font"] = font
                
            fields.append(new_field)
            
        # Update template
        template.fields = json.dumps(fields)
        db.commit()
        
        return Response(
            success=True,
            message=f"Field '{field_name}' updated successfully",
            data={
                "template_id": template_id,
                "field_name": field_name,
                "updated_fields": fields
            }
        )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Field update failed: {str(e)}"
        )
