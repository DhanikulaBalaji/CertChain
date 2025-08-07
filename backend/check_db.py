#!/usr/bin/env python3
"""Check database tables and basic connectivity"""

try:
    from app.core.database import engine
    from sqlalchemy import text
    
    # Check database connection and tables
    conn = engine.connect()
    result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
    tables = [row[0] for row in result]
    print("Database tables found:", tables)
    
    # Check if key tables exist
    required_tables = ['users', 'events', 'certificates']
    missing_tables = [table for table in required_tables if table not in tables]
    
    if missing_tables:
        print(f"Missing required tables: {missing_tables}")
    else:
        print("All required tables are present")
    
    # Check if certificates table has the new columns
    if 'certificates' in tables:
        result = conn.execute(text("PRAGMA table_info(certificates)"))
        columns = [row[1] for row in result]  # column names are in index 1
        print("Certificates table columns:", columns)
        
        required_columns = ['participant_id', 'recipient_email', 'recipient_phone']
        missing_columns = [col for col in required_columns if col not in columns]
        
        if missing_columns:
            print(f"Missing certificate columns: {missing_columns}")
        else:
            print("All required certificate columns are present")
    
    conn.close()
    print("Database check completed successfully")
    
except Exception as e:
    print(f"Database check failed: {e}")
    import traceback
    traceback.print_exc()
