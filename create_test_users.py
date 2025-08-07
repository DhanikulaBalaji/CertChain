#!/usr/bin/env python3
"""Create a test user for testing the authentication flow"""

import sys
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent / "backend"
sys.path.append(str(backend_path))

try:
    from app.core.database import SessionLocal
    from app.models.database import User, UserRole
    from app.core.security import get_password_hash
    
    print("Creating test users...")
    
    db = SessionLocal()
    
    # Check if super admin already exists
    existing_admin = db.query(User).filter(User.email == "admin@example.com").first()
    if not existing_admin:
        # Create super admin user
        admin_user = User(
            email="admin@example.com",
            full_name="Super Admin",
            hashed_password=get_password_hash("admin123"),
            role=UserRole.SUPER_ADMIN,
            is_active=True,
            is_approved=True
        )
        db.add(admin_user)
        print("✅ Created super admin user: admin@example.com / admin123")
    else:
        print("⏭️  Super admin user already exists")
    
    # Check if regular admin already exists
    existing_regular_admin = db.query(User).filter(User.email == "admin2@example.com").first()
    if not existing_regular_admin:
        # Create regular admin user
        regular_admin = User(
            email="admin2@example.com",
            full_name="Regular Admin",
            hashed_password=get_password_hash("admin123"),
            role=UserRole.ADMIN,
            is_active=True,
            is_approved=True
        )
        db.add(regular_admin)
        print("✅ Created admin user: admin2@example.com / admin123")
    else:
        print("⏭️  Regular admin user already exists")
    
    # Check if test user already exists
    existing_user = db.query(User).filter(User.email == "user@example.com").first()
    if not existing_user:
        # Create regular user
        test_user = User(
            email="user@example.com",
            full_name="Test User",
            hashed_password=get_password_hash("user123"),
            role=UserRole.USER,
            is_active=True,
            is_approved=True
        )
        db.add(test_user)
        print("✅ Created test user: user@example.com / user123")
    else:
        print("⏭️  Test user already exists")
    
    db.commit()
    db.close()
    
    print("\n🎉 Test users created successfully!")
    print("You can now log in with:")
    print("  Super Admin: admin@example.com / admin123")
    print("  Admin: admin2@example.com / admin123")
    print("  User: user@example.com / user123")
    
except Exception as e:
    print(f"Failed to create test users: {e}")
    import traceback
    traceback.print_exc()
