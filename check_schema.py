#!/usr/bin/env python3
"""
Check Database Schema
"""

import sqlite3
import os

def check_database_schema():
    """Check the actual database schema"""
    
    # Get the database path
    db_path = os.path.join(os.path.dirname(__file__), 'backend', 'certificate_system.db')
    
    if not os.path.exists(db_path):
        print(f"❌ Database file not found at {db_path}")
        return False
    
    try:
        # Connect to the database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("🔍 DATABASE SCHEMA INSPECTION")
        print("=" * 40)
        
        # Get table info for users
        cursor.execute("PRAGMA table_info(users)")
        columns = cursor.fetchall()
        
        print("\n👥 USERS TABLE COLUMNS:")
        for col in columns:
            print(f"  - {col[1]} ({col[2]}) - Primary: {col[5]}, Not Null: {col[3]}")
        
        # Show a sample user to see the data structure
        cursor.execute("SELECT * FROM users LIMIT 1")
        sample_user = cursor.fetchone()
        
        if sample_user:
            print(f"\n📋 SAMPLE USER DATA:")
            column_names = [col[1] for col in columns]
            for i, value in enumerate(sample_user):
                print(f"  - {column_names[i]}: {value}")
        
        conn.close()
        return True
            
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        if 'conn' in locals():
            conn.close()
        return False

if __name__ == "__main__":
    check_database_schema()
