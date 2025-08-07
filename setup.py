#!/usr/bin/env python3
"""
Complete System Setup Script
Sets up the certificate system with blockchain integration
"""

import sys
import os
import subprocess
import json
import asyncio
from pathlib import Path
import logging

# Add backend to path
sys.path.append(str(Path(__file__).parent / "backend"))

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SystemSetup:
    def __init__(self):
        self.root_dir = Path(__file__).parent
        self.backend_dir = self.root_dir / "backend"
        self.frontend_dir = self.root_dir / "frontend"
        self.contracts_dir = self.root_dir / "contracts"
        
    def check_requirements(self):
        """Check system requirements"""
        logger.info("🔍 Checking system requirements...")
        
        requirements = {
            "python": True,
            "node": False,
            "git": False
        }
        
        # Check Python
        try:
            result = subprocess.run([sys.executable, "--version"], capture_output=True, text=True)
            python_version = result.stdout.strip()
            logger.info(f"✅ Python: {python_version}")
            requirements["python"] = True
        except Exception as e:
            logger.error(f"❌ Python check failed: {e}")
            requirements["python"] = False
        
        # Check Node.js
        try:
            result = subprocess.run(["node", "--version"], capture_output=True, text=True)
            node_version = result.stdout.strip()
            logger.info(f"✅ Node.js: {node_version}")
            requirements["node"] = True
        except Exception:
            logger.warning("⚠️  Node.js not found - frontend may not work")
            requirements["node"] = False
        
        # Check Git
        try:
            result = subprocess.run(["git", "--version"], capture_output=True, text=True)
            git_version = result.stdout.strip()
            logger.info(f"✅ Git: {git_version}")
            requirements["git"] = True
        except Exception:
            logger.warning("⚠️  Git not found - version control unavailable")
            requirements["git"] = False
        
        return requirements
    
    def setup_python_environment(self):
        """Setup Python virtual environment and install dependencies"""
        logger.info("🐍 Setting up Python environment...")
        
        try:
            # Install backend dependencies
            logger.info("Installing backend dependencies...")
            subprocess.run([
                sys.executable, "-m", "pip", "install", "-r", 
                str(self.backend_dir / "requirements.txt")
            ], check=True)
            
            # Install additional blockchain dependencies
            blockchain_deps = [
                "web3>=6.0.0",
                "py-solc-x>=1.12.0", 
                "eth-account>=0.8.0",
                "eth-utils>=2.0.0"
            ]
            
            logger.info("Installing blockchain dependencies...")
            subprocess.run([
                sys.executable, "-m", "pip", "install"
            ] + blockchain_deps, check=True)
            
            logger.info("✅ Python environment setup complete")
            return True
            
        except subprocess.CalledProcessError as e:
            logger.error(f"❌ Python environment setup failed: {e}")
            return False
    
    def setup_node_environment(self):
        """Setup Node.js environment for frontend"""
        logger.info("📦 Setting up Node.js environment...")
        
        try:
            if not self.frontend_dir.exists():
                logger.warning("Frontend directory not found, skipping Node.js setup")
                return True
            
            # Install frontend dependencies
            logger.info("Installing frontend dependencies...")
            subprocess.run([
                "npm", "install"
            ], cwd=self.frontend_dir, check=True)
            
            logger.info("✅ Node.js environment setup complete")
            return True
            
        except subprocess.CalledProcessError as e:
            logger.error(f"❌ Node.js environment setup failed: {e}")
            return False
        except FileNotFoundError:
            logger.warning("⚠️  npm not found, skipping frontend setup")
            return True
    
    def create_directories(self):
        """Create necessary directories"""
        logger.info("📁 Creating necessary directories...")
        
        directories = [
            self.backend_dir / "certificates",
            self.backend_dir / "templates", 
            self.backend_dir / "uploads",
            self.backend_dir / "logs"
        ]
        
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
            logger.info(f"Created directory: {directory}")
        
        logger.info("✅ Directories created successfully")
    
    def setup_database(self):
        """Initialize database"""
        logger.info("🗄️  Setting up database...")
        
        try:
            # Import and run database initialization
            sys.path.insert(0, str(self.backend_dir))
            from models.database import init_db, create_super_admin
            from core.database import engine
            
            # Initialize database
            init_db()
            logger.info("✅ Database initialized")
            
            # Create super admin
            create_super_admin()
            logger.info("✅ Super admin created")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Database setup failed: {e}")
            return False
    
    def create_sample_env(self):
        """Create sample environment file"""
        logger.info("📝 Creating sample environment configuration...")
        
        env_content = """# Environment Configuration
DATABASE_URL=sqlite:///./certificate_system.db
SECRET_KEY=your-super-secret-key-change-this-in-production-make-it-very-long-and-random
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Blockchain Configuration (Sepolia Testnet)
# Get your project ID from https://infura.io/
ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID
# Generate a private key (DO NOT use this example in production!)
PRIVATE_KEY=ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
CONTRACT_ADDRESS=

# File Paths
TEMPLATES_DIR=./templates
CERTIFICATES_DIR=./certificates
UPLOADS_DIR=./uploads

# OCR Configuration
TESSERACT_PATH=C:\\Program Files\\Tesseract-OCR\\tesseract.exe
TESSERACT_CMD=tesseract

# Email Configuration (SMTP) - Optional
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@certificate-system.com

# CORS Settings
CORS_ORIGINS=["http://localhost:3000", "https://localhost:3000"]

# Debug Mode
DEBUG=True

# Super Admin Configuration
SUPER_ADMIN_EMAIL=admin@certificate-system.com
SUPER_ADMIN_PASSWORD=admin123
"""
        
        env_file = self.backend_dir / ".env"
        if not env_file.exists():
            with open(env_file, 'w') as f:
                f.write(env_content)
            logger.info(f"✅ Sample .env file created at {env_file}")
            logger.warning("⚠️  Please update the .env file with your actual configuration!")
        else:
            logger.info("✅ .env file already exists")
    
    def display_setup_completion(self):
        """Display setup completion information"""
        logger.info("=" * 60)
        logger.info("🎉 SETUP COMPLETED SUCCESSFULLY!")
        logger.info("=" * 60)
        
        logger.info("📋 Next Steps:")
        logger.info("1. Update the .env file in backend/ with your configuration")
        logger.info("2. Get an Infura project ID from https://infura.io/")
        logger.info("3. Generate or use your Ethereum private key (for testnet)")
        logger.info("4. Deploy the smart contract:")
        logger.info("   cd contracts && python deploy_contract.py")
        logger.info("5. Start the backend server:")
        logger.info("   cd backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8001")
        logger.info("6. Start the frontend (in another terminal):")
        logger.info("   cd frontend && npm start")
        
        logger.info("🔗 Access Points:")
        logger.info("   Frontend: http://localhost:3000")
        logger.info("   Backend API: http://localhost:8001")
        logger.info("   API Documentation: http://localhost:8001/docs")
        
        logger.info("👤 Default Admin Credentials:")
        logger.info("   Email: admin@certificate-system.com")
        logger.info("   Password: admin123")
        
        logger.info("=" * 60)
    
    async def run_setup(self):
        """Run complete setup process"""
        logger.info("🚀 Starting Certificate System Setup")
        logger.info("=" * 60)
        
        # Check requirements
        requirements = self.check_requirements()
        
        # Create directories
        self.create_directories()
        
        # Create sample environment
        self.create_sample_env()
        
        # Setup Python environment
        if not self.setup_python_environment():
            logger.error("Python environment setup failed. Aborting.")
            return False
        
        # Setup Node.js environment
        if requirements["node"]:
            if not self.setup_node_environment():
                logger.warning("Node.js environment setup failed. Frontend may not work.")
        
        # Setup database
        if not self.setup_database():
            logger.error("Database setup failed. Aborting.")
            return False
        
        # Display completion information
        self.display_setup_completion()
        
        return True

def main():
    """Main setup function"""
    try:
        setup = SystemSetup()
        success = asyncio.run(setup.run_setup())
        
        if success:
            sys.exit(0)
        else:
            sys.exit(1)
            
    except KeyboardInterrupt:
        logger.info("Setup interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Setup failed with error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
