#!/usr/bin/env python3
"""
Reset Admin User Passwords with Proper Bcrypt Hashing
"""

import sqlite3
import os
import sys

# Add the backend directory to the path so we can import the security module
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

def reset_admin_passwords():
    """Reset admin passwords with proper bcrypt hashing"""
    
    try:
        # Use bcrypt directly since import path is complex
        from passlib.context import CryptContext
        
        # Create password context
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        
        # Get the database path
        db_path = os.path.join(os.path.dirname(__file__), 'backend', 'certificate_system.db')
        
        if not os.path.exists(db_path):
            print(f"❌ Database file not found at {db_path}")
            return False
        
        # Connect to the database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("🔐 RESETTING ADMIN PASSWORDS")
        print("=" * 40)
        
        print("✅ Password hashes generated")
        
        # Hash the passwords properly
        admin_password_hash = pwd_context.hash("admin123")
        user_password_hash = pwd_context.hash("user123")
        
        print("✅ Password hashes generated")
        
        # Update existing admin users
        cursor.execute("""
            UPDATE users 
            SET password_hash = ? 
            WHERE email = 'superadmin@certificate-system.com'
        """, (admin_password_hash,))
        
        cursor.execute("""
            UPDATE users 
            SET password_hash = ? 
            WHERE email = 'admin@certificate-system.com'
        """, (admin_password_hash,))
        
        cursor.execute("""
            UPDATE users 
            SET password_hash = ? 
            WHERE email = 'testuser@certificate-system.com'
        """, (user_password_hash,))
        
        conn.commit()
        
        print("✅ Passwords updated successfully!")
        print("\n📋 UPDATED LOGIN CREDENTIALS:")
        print("Super Admin: superadmin@certificate-system.com / admin123")
        print("Admin: admin@certificate-system.com / admin123")
        print("User: testuser@certificate-system.com / user123")
        
        # Verify the users exist
        cursor.execute("SELECT email, role, is_active, is_approved FROM users")
        users = cursor.fetchall()
        
        print(f"\n👥 Available users ({len(users)}):")
        for user in users:
            print(f"  - Email: {user[0]}, Role: {user[1]}, Active: {user[2]}, Approved: {user[3]}")
        
        conn.close()
        return True
            
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        if 'conn' in locals():
            conn.close()
        return False

if __name__ == "__main__":
    reset_admin_passwords()
