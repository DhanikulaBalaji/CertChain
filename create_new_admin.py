#!/usr/bin/env python3
"""
Create New Admin User with Known Password
"""

import sqlite3
import os
from passlib.context import CryptContext

def create_new_admin():
    """Create a new admin user with known credentials"""
    
    try:
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
        
        print("🔐 CREATING NEW ADMIN USER")
        print("=" * 40)
        
        # Hash the password properly  
        password = "testadmin123"
        password_hash = pwd_context.hash(password)
        
        print("✅ Password hash generated")
        
        # Create new admin user
        try:
            cursor.execute("""
                INSERT INTO users (email, full_name, hashed_password, role, is_active, is_approved, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            """, (
                'newadmin@certificate-system.com',
                'New Test Administrator',
                password_hash,
                'SUPER_ADMIN',
                1,
                1
            ))
            
            conn.commit()
            
            print("✅ New admin user created successfully!")
            print("\n📋 NEW LOGIN CREDENTIALS:")
            print("Email: newadmin@certificate-system.com")
            print("Password: testadmin123")
            
        except sqlite3.IntegrityError as e:
            if "UNIQUE constraint failed" in str(e):
                print("ℹ️ User already exists, updating password...")
                cursor.execute("""
                    UPDATE users 
                    SET hashed_password = ?, updated_at = datetime('now')
                    WHERE email = 'newadmin@certificate-system.com'
                """, (password_hash,))
                conn.commit()
                print("✅ Password updated successfully!")
            else:
                raise e
        
        # Show all admin users
        cursor.execute("SELECT email, role, is_active, is_approved FROM users WHERE role IN ('ADMIN', 'SUPER_ADMIN')")
        admins = cursor.fetchall()
        
        print(f"\n👥 Available Admin Users ({len(admins)}):")
        for admin in admins:
            print(f"  - Email: {admin[0]}, Role: {admin[1]}, Active: {admin[2]}, Approved: {admin[3]}")
        
        conn.close()
        return True
            
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        if 'conn' in locals():
            conn.close()
        return False

if __name__ == "__main__":
    create_new_admin()
