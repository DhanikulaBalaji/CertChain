from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import logging
import os

from app.core.config import settings
from app.core.database import engine, Base
from app.api import auth, certificates, events, notifications, admin, security_monitoring, templates, admin_certificates, event_participants, blockchain, certificate_verification
from app.core.security_middleware import (
    RateLimitMiddleware, 
    SecurityHeadersMiddleware, 
    InputValidationMiddleware,
    AuditMiddleware
)
from app.core.security_config import get_security_settings
from app.core.security_bypass import enable_insecure_ssl_for_development

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Enable insecure SSL for development to bypass SSL certificate validation issues
if settings.debug:
    logger.warning("Development mode detected. Enabling insecure SSL for development.")
    enable_insecure_ssl_for_development()

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Secure Blockchain-Based Certificate Generation and Validation Framework",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None
)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Simple health check endpoint for monitoring"""
    return {"status": "healthy", "message": "Certificate System API is running"}

# CORS middleware with security settings
security_settings = get_security_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=security_settings.CORS_ALLOW_ORIGINS,
    allow_credentials=security_settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=security_settings.CORS_ALLOW_METHODS,
    allow_headers=security_settings.CORS_ALLOW_HEADERS,
)

# Security middleware (in order of execution)
if security_settings.SECURITY_MONITORING_ENABLED:
    app.add_middleware(AuditMiddleware)
    
if security_settings.VALIDATION_ENABLED:
    app.add_middleware(InputValidationMiddleware)
    
if security_settings.SECURITY_HEADERS_ENABLED:
    app.add_middleware(SecurityHeadersMiddleware)
    
if security_settings.RATE_LIMIT_ENABLED:
    app.add_middleware(RateLimitMiddleware)

# Include API routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(certificates.router, prefix="/api/v1")
app.include_router(certificates.admin_router, prefix="/api/v1")
app.include_router(events.router, prefix="/api/v1")
app.include_router(event_participants.router, prefix="/api/v1")
app.include_router(event_participants.user_router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(admin_certificates.router, prefix="/api/v1")
app.include_router(admin_certificates.cert_router, prefix="/api/v1")
app.include_router(admin_certificates.template_router, prefix="/api/v1")
app.include_router(security_monitoring.router, prefix="/api/v1")
app.include_router(templates.router, prefix="/api/v1")
app.include_router(blockchain.router, prefix="/api/v1")
app.include_router(certificate_verification.router, prefix="/api/v1/certificates", tags=["Certificate Verification"])

# Static files for serving certificates, templates, etc.
app.mount("/static/certificates", StaticFiles(directory=settings.certificates_dir), name="certificates")
app.mount("/static/templates", StaticFiles(directory=settings.templates_dir), name="templates")

@app.on_event("startup")
async def startup_event():
    """Initialize database and create tables"""
    try:
        # Import models first to ensure they are registered with Base
        from app.models.database import User, Event, Certificate, ValidationLog, TamperLog, Notification, BlockchainTransaction  # noqa
        
        # Create tables
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created successfully")
        
        # Create default super admin if not exists - DISABLED FOR TESTING
        # await create_default_super_admin()
        
        # Initialize blockchain service
        from app.services.blockchain import blockchain_service
        if blockchain_service.is_connected():
            balance = blockchain_service.get_balance()
            logger.info(f"Blockchain connected. Account balance: {balance} ETH")
        else:
            logger.warning("Blockchain connection failed")
            
    except Exception as e:
        logger.error(f"Startup error: {e}")

async def create_default_super_admin():
    """Create default super admin user"""
    try:
        from app.core.database import SessionLocal
        from app.models.database import User, UserRole
        from app.core.security import get_password_hash
        
        db = SessionLocal()
        
        # Check if super admin exists
        existing_super_admin = db.query(User).filter(User.role == UserRole.SUPER_ADMIN).first()
        
        if not existing_super_admin:
            # Create default super admin
            super_admin = User(
                email="admin@certificate-system.com",
                full_name="System Administrator",
                hashed_password=get_password_hash("admin123"),  # Change in production
                role=UserRole.SUPER_ADMIN,
                is_active=True,
                is_approved=True
            )
            
            db.add(super_admin)
            db.commit()
            logger.info("Default super admin created: admin@certificate-system.com / admin123")
            
        db.close()
        
    except Exception as e:
        logger.error(f"Error creating default super admin: {e}")

@app.get("/health")
async def simple_health_check():
    """Simple health check endpoint"""
    return {"status": "ok", "message": "Server is running"}

@app.get("/api/v1/health")
async def health_check():
    """Health check endpoint"""
    try:
        from app.services.blockchain import blockchain_service
        
        blockchain_status = "connected" if blockchain_service.is_connected() else "disconnected"
        
        return {
            "status": "healthy",
            "version": settings.app_version,
            "blockchain": blockchain_status,
            "database": "connected"  # Would check DB connection in production
        }
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "error": str(e)}
        )

# Temporary test download endpoint (no auth required)
@app.get("/api/v1/test/download/{certificate_id}")
async def test_download_certificate(certificate_id: str):
    """Test download endpoint without authentication"""
    import os
    from fastapi.responses import FileResponse
    
    # Try multiple possible file paths and formats
    file_path = None
    filename = None
    media_type = None
    
    # Try PDF first (preferred format)
    possible_pdf_paths = [
        f"./certificates/cert_{certificate_id}.pdf",
        f"certificates/cert_{certificate_id}.pdf",
        f"backend/certificates/cert_{certificate_id}.pdf"
    ]
    
    for path in possible_pdf_paths:
        if os.path.exists(path):
            file_path = path
            filename = f"certificate_{certificate_id}.pdf"
            media_type = "application/pdf"
            break
    
    # If PDF not found, try PNG as fallback
    if not file_path:
        possible_png_paths = [
            f"./certificates/cert_{certificate_id}.png",
            f"certificates/cert_{certificate_id}.png",
            f"backend/certificates/cert_{certificate_id}.png"
        ]
        
        for path in possible_png_paths:
            if os.path.exists(path):
                file_path = path
                filename = f"certificate_{certificate_id}.png"
                media_type = "image/png"
                break
    
    if not file_path:
        raise HTTPException(
            status_code=404, 
            detail=f"Certificate file not found for ID: {certificate_id}. Checked both PDF and PNG formats."
        )
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type=media_type
    )

@app.get("/api/v1/system/info")
async def system_info():
    """Get system information"""
    try:
        from app.services.blockchain import blockchain_service
        
        gas_info = blockchain_service.estimate_gas_fee()
        
        return {
            "app_name": settings.app_name,
            "version": settings.app_version,
            "blockchain": {
                "connected": blockchain_service.is_connected(),
                "account_balance": blockchain_service.get_balance(),
                "gas_price_gwei": gas_info.get('gas_price_gwei', 0),
                "estimated_cost_eth": gas_info.get('estimated_cost_eth', 0)
            },
            "directories": {
                "uploads": settings.upload_dir,
                "templates": settings.templates_dir,
                "certificates": settings.certificates_dir
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"System info error: {str(e)}")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    logger.error(f"Global exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Secure Blockchain-Based Certificate System API",
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/api/v1/health"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8001,
        reload=False  # Disabled for direct python execution
    )
