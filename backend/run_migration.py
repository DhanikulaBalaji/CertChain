#!/usr/bin/env python3
"""Run database migration to add certificate fields"""

import sys
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent
sys.path.append(str(backend_path))

try:
    from app.core.database import engine
    from sqlalchemy import text
    
    print("Running migration to add certificate fields...")
    
    # Check current schema
    conn = engine.connect()
    result = conn.execute(text("PRAGMA table_info(certificates)"))
    current_columns = [row[1] for row in result]
    print(f"Current columns: {current_columns}")
    
    # Add participant_id column if it doesn't exist
    if 'participant_id' not in current_columns:
        print("Adding participant_id column...")
        conn.execute(text("ALTER TABLE certificates ADD COLUMN participant_id VARCHAR(50)"))
        print("✅ Added participant_id column")
    else:
        print("⏭️  participant_id column already exists")
    
    # Add recipient_phone column if it doesn't exist
    if 'recipient_phone' not in current_columns:
        print("Adding recipient_phone column...")
        conn.execute(text("ALTER TABLE certificates ADD COLUMN recipient_phone VARCHAR(20)"))
        print("✅ Added recipient_phone column")
    else:
        print("⏭️  recipient_phone column already exists")
    
    # Create index on participant_id if it doesn't exist
    try:
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_certificates_participant_id ON certificates (participant_id)"))
        print("✅ Created index on participant_id")
    except Exception as e:
        print(f"Index creation note: {e}")
    
    # Commit the transaction
    conn.commit()
    
    # Verify the changes
    result = conn.execute(text("PRAGMA table_info(certificates)"))
    new_columns = [row[1] for row in result]
    print(f"Updated columns: {new_columns}")
    
    conn.close()
    print("Migration completed successfully!")
    
except Exception as e:
    print(f"Migration failed: {e}")
    import traceback
    traceback.print_exc()
