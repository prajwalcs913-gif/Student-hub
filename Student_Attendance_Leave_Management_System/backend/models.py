from datetime import datetime, timezone
from uuid import uuid4

from .extensions import db


def new_id():
    return str(uuid4())


class Student(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    name = db.Column(db.String(80), nullable=False)
    roll_number = db.Column(db.String(30), nullable=False, unique=True)
    student_class = db.Column(db.String(40), nullable=False)
    email = db.Column(db.String(120), nullable=False, default="")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    attendance = db.relationship(
        "AttendanceRecord", back_populates="student", cascade="all, delete-orphan"
    )
    leave_requests = db.relationship(
        "LeaveRequest", back_populates="student", cascade="all, delete-orphan"
    )


class AttendanceRecord(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    student_id = db.Column(db.String(36), db.ForeignKey("student.id"), nullable=False, index=True)
    attendance_date = db.Column(db.Date, nullable=False, index=True)
    status = db.Column(db.String(10), nullable=False)

    student = db.relationship("Student", back_populates="attendance")
    __table_args__ = (
        db.UniqueConstraint("student_id", "attendance_date", name="uq_attendance_student_date"),
        db.CheckConstraint("status IN ('Present', 'Absent', 'Late')", name="ck_attendance_status"),
    )


class LeaveRequest(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    student_id = db.Column(db.String(36), db.ForeignKey("student.id"), nullable=False, index=True)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    reason = db.Column(db.String(300), nullable=False)
    status = db.Column(db.String(10), nullable=False, default="Pending")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    student = db.relationship("Student", back_populates="leave_requests")
    __table_args__ = (
        db.CheckConstraint("end_date >= start_date", name="ck_leave_dates"),
        db.CheckConstraint(
            "status IN ('Pending', 'Approved', 'Rejected')", name="ck_leave_status"
        ),
    )