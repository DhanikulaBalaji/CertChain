#!/usr/bin/env python3
"""
Database initialization script
Creates the database schema and default super admin account
"""
import sys
import os
from pathlib import Path

# Add the backend directory to the Python path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

try:
    from app.core.config import settings
    from app.core.database import engine, get_db
    from app.models.database import Base, User
    from app.core.security import get_password_hash
    from sqlalchemy.orm import Session
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("Please ensure you're running this from the backend directory")
    sys.exit(1)

def init_database():
    """Initialize database with schema and default data"""
    
    print("🗄️ Initializing database...")
    print(f"📊 Using database: {settings.database_url}")
    
    try:
        # Create all tables
        Base.metadata.create_all(bind=engine)
        print("✅ Database schema created")
        
        # Create default super admin
        db = next(get_db())
        
        try:
            # Check if super admin already exists
            existing_admin = db.query(User).filter(User.email == "superadmin@certificate-system.com").first()
            
            if not existing_admin:
                # Create super admin user
                super_admin = User(
                    email="superadmin@certificate-system.com",
                    full_name="Super Administrator",
                    hashed_password=get_password_hash("SuperAdmin123!"),
                    role="super_admin",
                    is_active=True,
                    is_approved=True
                )
                db.add(super_admin)
                print("✅ Super Admin created successfully")
                print("📧 Email: superadmin@certificate-system.com")
                print("🔐 Password: SuperAdmin123!")
            
            # Check if admin exists
            existing_regular_admin = db.query(User).filter(User.email == "admin@certificate-system.com").first()
            
            if not existing_regular_admin:
                # Create regular admin user
                admin = User(
                    email="admin@certificate-system.com",
                    full_name="Administrator",
                    hashed_password=get_password_hash("Admin123!"),
                    role="admin",
                    is_active=True,
                    is_approved=True
                )
                db.add(admin)
                print("✅ Admin created successfully")
                print("📧 Email: admin@certificate-system.com")
                print("🔐 Password: Admin123!")
            
            # Check if test user exists
            existing_user = db.query(User).filter(User.email == "testuser@certificate-system.com").first()
            
            if not existing_user:
                # Create test user
                user = User(
                    email="testuser@certificate-system.com",
                    full_name="Test User",
                    hashed_password=get_password_hash("User123!"),
                    role="user",
                    is_active=True,
                    is_approved=True
                )
                db.add(user)
                print("✅ Test User created successfully")
                print("📧 Email: testuser@certificate-system.com")
                print("🔐 Password: User123!")
            
            db.commit()
        
        except Exception as e:
            print(f"❌ Error creating super admin: {e}")
            db.rollback()
        finally:
            db.close()
            
    except Exception as e:
        print(f"❌ Database initialization failed: {e}")
        return False
    
    # Create required directories
    directories = [
        settings.certificates_dir,
        settings.templates_dir,
        settings.upload_dir
    ]
    
    for directory in directories:
        try:
            Path(directory).mkdir(parents=True, exist_ok=True)
            print(f"✅ Directory created/verified: {directory}")
        except Exception as e:
            print(f"⚠️ Could not create directory {directory}: {e}")
    
    print("🎉 Database initialization completed!")
    return True

if __name__ == "__main__":
    init_database()
