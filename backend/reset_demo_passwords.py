#!/usr/bin/env python3
"""
Reset user passwords to demo credentials
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.database import User
from app.core.security import get_password_hash

def reset_passwords():
    """Reset all user passwords to demo credentials"""
    
    db = SessionLocal()
    
    try:
        # Demo credentials mapping
        password_updates = {
            "superadmin@certificate-system.com": "SuperAdmin123!",
            "admin@certificate-system.com": "Admin123!",
            "testuser@certificate-system.com": "User123!"
        }
        
        print("🔄 Resetting passwords to demo credentials...")
        
        for email, new_password in password_updates.items():
            user = db.query(User).filter(User.email == email).first()
            if user:
                # Hash the new password
                hashed_password = get_password_hash(new_password)
                user.hashed_password = hashed_password
                print(f"✅ Updated password for {email}")
            else:
                print(f"❌ User {email} not found")
        
        # Commit changes
        db.commit()
        print("\n🎉 Password reset complete!")
        print("\nDemo Credentials:")
        print("Super Admin: superadmin@certificate-system.com / SuperAdmin123!")
        print("Admin: admin@certificate-system.com / Admin123!")
        print("User: testuser@certificate-system.com / User123!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    reset_passwords()
