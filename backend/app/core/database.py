from sqlalchemy import create_engine, MetaData
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.core.base import Base

# Create SQLAlchemy engine
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    echo=settings.debug,
    # SQLite specific settings for thread safety
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Metadata instance
metadata = MetaData()

# Import all models to ensure they are registered with Base
def import_models():
    """Import all models to ensure they are registered with Base"""
    try:
        from app.models import database  # This will register all models with Base
    except ImportError:
        pass

# Import models when this module is loaded
import_models()

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
