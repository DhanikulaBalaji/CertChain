from pydantic_settings import BaseSettings
from typing import Optional, List
import os
from pathlib import Path

class Settings(BaseSettings):
    # App Configuration
    app_name: str = "Secure Certificate Framework"
    app_version: str = "1.0.0"
    debug: bool = True
    
    # Database Configuration
    @property
    def database_url(self) -> str:
        """Get database URL with absolute path"""
        backend_dir = Path(__file__).parent.parent.parent  # Go up to backend directory
        db_path = backend_dir / "certificate_system.db"
        return f"sqlite:///{db_path}"
    
    # Security
    secret_key: str = "your-super-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # Blockchain Configuration (Enable blockchain with development keys)
    ethereum_rpc_url: str = "https://sepolia.infura.io/v3/b8c4f8b4c8a44e3984f7b8c4f8b4c8a4"  # Demo Infura key
    private_key: str = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"  # Demo private key
    contract_address: Optional[str] = "0x5FbDB2315678afecb367f032d93F642f64180aa3"  # Demo contract address
    rpc_url: str = "https://sepolia.infura.io/v3/b8c4f8b4c8a44e3984f7b8c4f8b4c8a4"  # Demo RPC URL
    chain_id: str = "11155111"
    
    # File Storage
    upload_dir: str = "uploads"
    UPLOAD_DIR: str = "uploads"  # Added for compatibility with uppercase references
    uploads_dir: str = "uploads"  # Added for compatibility
    templates_dir: str = "templates"
    certificates_dir: str = "certificates"
    
    # File processing
    pdf_output_dir: str = "backend/certificates"
    pdf_template_dir: str = "backend/templates"
    max_file_size: str = "10485760"
    
    # OCR Configuration
    tesseract_path: str = r"C:\Program Files\Tesseract-OCR\tesseract.exe"  # Windows path
    tesseract_cmd: str = "tesseract"
    
    # Super Admin Configuration
    super_admin_email: str = "admin@example.com"
    super_admin_password: str = "admin123"
    
    # CORS Configuration
    cors_origins: List[str] = ["http://localhost:3000", "https://localhost:3000"]  # Added
    
    class Config:
        env_file = ".env"
        extra = "ignore"  # Ignore extra fields from .env

# Create settings instance
settings = Settings()

# Ensure UPLOAD_DIR is set correctly
if not hasattr(settings, 'UPLOAD_DIR') or not settings.UPLOAD_DIR:
    settings.UPLOAD_DIR = settings.upload_dir

# Create necessary directories
os.makedirs(settings.upload_dir, exist_ok=True)
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.templates_dir, exist_ok=True)
os.makedirs(settings.certificates_dir, exist_ok=True)
