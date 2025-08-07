"""Add enhanced certificate fields

Revision ID: add_cert_fields_001
Revises: previous_revision
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'add_cert_fields_001'
down_revision = 'previous_revision'  # Replace with actual previous revision
branch_labels = None
depends_on = None

def upgrade():
    # Add new columns to certificates table
    with op.batch_alter_table('certificates', schema=None) as batch_op:
        batch_op.add_column(sa.Column('participant_id', sa.String(50), nullable=True))
        batch_op.add_column(sa.Column('recipient_email', sa.String(255), nullable=True))
        batch_op.add_column(sa.Column('recipient_phone', sa.String(20), nullable=True))
        batch_op.create_index('ix_certificates_participant_id', ['participant_id'])

def downgrade():
    # Remove added columns
    with op.batch_alter_table('certificates', schema=None) as batch_op:
        batch_op.drop_index('ix_certificates_participant_id')
        batch_op.drop_column('recipient_phone')
        batch_op.drop_column('recipient_email')
        batch_op.drop_column('participant_id')
