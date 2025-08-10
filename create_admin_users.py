#!/usr/bin/env python3
"""
Check Database Users and Create Default Admin
"""

import sqlite3
import os
import hashlib

def check_and_create_admin():
    """Check if admin users exist and create them if needed"""
    
    # Get the database path
    db_path = os.path.join(os.path.dirname(__file__), 'backend', 'certificate_system.db')
    
    if not os.path.exists(db_path):
        print(f"❌ Database file not found at {db_path}")
        return False
    
    try:
        # Connect to the database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("🔍 CHECKING DATABASE USERS")
        print("=" * 40)
        
        # Check existing users
        cursor.execute("SELECT id, email, role, is_active, is_approved FROM users")
        users = cursor.fetchall()
        
        print(f"\n👥 Current users in database: {len(users)}")
        for user in users:
            print(f"  - ID: {user[0]}, Email: {user[1]}, Role: {user[2]}, Active: {user[3]}, Approved: {user[4]}")
        
        # Check if we need to create admin users
        admin_exists = any(user[2] in ['ADMIN', 'SUPER_ADMIN'] for user in users)
        
        if not admin_exists:
            print("\n🚀 Creating default admin users...")
            
            # Simple password hash (you should use proper bcrypt in production)
            def simple_hash(password):
                return hashlib.sha256(password.encode()).hexdigest()
            
            # Create super admin
            cursor.execute("""
                INSERT INTO users (email, password_hash, role, is_active, is_approved, first_name, last_name)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                'admin@certificate-system.com',
                simple_hash('admin123'),
                'SUPER_ADMIN',
                1,
                1,
                'Super',
                'Admin'
            ))
            
            # Create regular admin
            cursor.execute("""
                INSERT INTO users (email, password_hash, role, is_active, is_approved, first_name, last_name)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                'testadmin@certificate-system.com',
                simple_hash('admin123'),
                'ADMIN',
                1,
                1,
                'Test',
                'Admin'
            ))
            
            # Create test user
            cursor.execute("""
                INSERT INTO users (email, password_hash, role, is_active, is_approved, first_name, last_name)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                'testuser@certificate-system.com',
                simple_hash('user123'),
                'USER',
                1,
                1,
                'Test',
                'User'
            ))
            
            conn.commit()
            print("✅ Default admin users created!")
            print("\n📋 LOGIN CREDENTIALS:")
            print("Super Admin: admin@certificate-system.com / admin123")
            print("Admin: testadmin@certificate-system.com / admin123")
            print("User: testuser@certificate-system.com / user123")
            
        else:
            print("\n✅ Admin users already exist!")
            
        # Show updated user list
        cursor.execute("SELECT id, email, role, is_active, is_approved FROM users")
        users = cursor.fetchall()
        
        print(f"\n👥 Final users in database: {len(users)}")
        for user in users:
            print(f"  - ID: {user[0]}, Email: {user[1]}, Role: {user[2]}, Active: {user[3]}, Approved: {user[4]}")
        
        conn.close()
        return True
            
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        if 'conn' in locals():
            conn.close()
        return False

if __name__ == "__main__":
    check_and_create_admin()
