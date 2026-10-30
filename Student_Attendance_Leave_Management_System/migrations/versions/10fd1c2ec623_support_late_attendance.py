"""Support late attendance

Revision ID: 10fd1c2ec623
Revises: 08f0d690803a
Create Date: 2026-10-25 21:40:23.647849

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '10fd1c2ec623'
down_revision = '08f0d690803a'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("attendance_record") as batch_op:
        batch_op.drop_constraint("ck_attendance_status", type_="check")
        batch_op.create_check_constraint(
            "ck_attendance_status", "status IN ('Present', 'Absent', 'Late')"
        )


def downgrade():
    with op.batch_alter_table("attendance_record") as batch_op:
        batch_op.drop_constraint("ck_attendance_status", type_="check")
        batch_op.create_check_constraint(
            "ck_attendance_status", "status IN ('Present', 'Absent')"
        )
