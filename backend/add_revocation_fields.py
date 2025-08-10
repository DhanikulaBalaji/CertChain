#!/usr/bin/env python3
"""
Migration script to add revocation tracking fields to certificates table
"""

import sqlite3
import os

def add_revocation_fields():
    """Add revoked_by and revocation_reason columns to certificates table"""
    db_path = "certificate_system.db"
    
    if not os.path.exists(db_path):
        print(f"Database file {db_path} not found!")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check current schema
        cursor.execute("PRAGMA table_info(certificates)")
        columns = [column[1] for column in cursor.fetchall()]
        print(f"Current columns: {columns}")
        
        # Add revoked_by column if it doesn't exist
        if 'revoked_by' not in columns:
            cursor.execute("ALTER TABLE certificates ADD COLUMN revoked_by INTEGER REFERENCES users(id)")
            print("Added revoked_by column")
        else:
            print("revoked_by column already exists")
        
        # Add revocation_reason column if it doesn't exist
        if 'revocation_reason' not in columns:
            cursor.execute("ALTER TABLE certificates ADD COLUMN revocation_reason TEXT")
            print("Added revocation_reason column")
        else:
            print("revocation_reason column already exists")
        
        conn.commit()
        
        # Verify the changes
        cursor.execute("PRAGMA table_info(certificates)")
        new_columns = [column[1] for column in cursor.fetchall()]
        print(f"Updated columns: {new_columns}")
        
        conn.close()
        print("Migration completed successfully!")
        return True
        
    except Exception as e:
        print(f"Migration failed: {e}")
        return False

if __name__ == "__main__":
    add_revocation_fields()
