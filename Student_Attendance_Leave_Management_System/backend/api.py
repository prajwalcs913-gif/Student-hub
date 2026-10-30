import re
from datetime import date, datetime

from flask import Blueprint, jsonify, request
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from .extensions import db
from .models import AttendanceRecord, LeaveRequest, Student, new_id

api = Blueprint("api", __name__)
ATTENDANCE_STATUSES = {"Present", "Absent", "Late"}
LEAVE_STATUSES = {"Pending", "Approved", "Rejected"}


def _error(message, status=400):
    return jsonify({"error": message}), status


def _text(value, field, limit, required=True):
    if value is None and not required:
        return ""
    if not isinstance(value, str):
        raise ValueError(f"{field} must be text.")
    result = value.strip()
    if required and not result:
        raise ValueError(f"{field} is required.")
    if len(result) > limit:
        raise ValueError(f"{field} must be {limit} characters or fewer.")
    return result


def _date(value, field):
    if not isinstance(value, str):
        raise ValueError(f"{field} must be an ISO date (YYYY-MM-DD).")
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise ValueError(f"{field} must be an ISO date (YYYY-MM-DD).") from error


def _student_data(student):
    return {
        "id": student.id,
        "name": student.name,
        "roll": student.roll_number,
        "studentClass": student.student_class,
        "email": student.email,
    }


def _attendance_data(record):
    return {
        "id": record.id,
        "studentId": record.student_id,
        "date": record.attendance_date.isoformat(),
        "status": record.status,
    }


def _leave_data(leave):
    created_at = leave.created_at
    return {
        "id": leave.id,
        "studentId": leave.student_id,
        "start": leave.start_date.isoformat(),
        "end": leave.end_date.isoformat(),
        "reason": leave.reason,
        "status": leave.status,
        "createdAt": created_at.isoformat() if created_at else None,
    }


def _state_data():
    return {
        "students": [_student_data(item) for item in Student.query.order_by(Student.name).all()],
        "attendance": [
            _attendance_data(item)
            for item in AttendanceRecord.query.order_by(AttendanceRecord.attendance_date).all()
        ],
        "leaves": [
            _leave_data(item)
            for item in LeaveRequest.query.order_by(LeaveRequest.created_at).all()
        ],
    }


def _roll_in_use(roll, exclude_id=None):
    query = Student.query.filter(func.lower(Student.roll_number) == roll.lower())
    if exclude_id:
        query = query.filter(Student.id != exclude_id)
    return query.first() is not None


def _student_fields(body, exclude_id=None):
    name = _text(body.get("name"), "Name", 80)
    roll = _text(body.get("roll"), "Roll number", 30)
    student_class = _text(body.get("studentClass"), "Class / section", 40)
    email = _text(body.get("email", ""), "Email", 120, required=False)
    if email and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise ValueError("Email address is invalid.")
    if _roll_in_use(roll, exclude_id):
        raise FileExistsError("That roll number is already registered.")
    return name, roll, student_class, email


def _student_or_404(student_id):
    student = db.session.get(Student, student_id)
    if student is None:
        return None, _error("Student not found.", 404)
    return student, None


@api.get("/health")
def health():
    try:
        db.session.execute(db.text("SELECT 1"))
        return jsonify({"status": "ok", "database": "connected"})
    except SQLAlchemyError:
        db.session.rollback()
        return _error("Database is unavailable.", 503)


@api.get("/state")
def get_state():
    return jsonify(_state_data())


@api.put("/state")
def replace_state():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return _error("A JSON object is required.")
    raw_students = body.get("students")
    raw_attendance = body.get("attendance")
    raw_leaves = body.get("leaves")
    if not all(isinstance(value, list) for value in (raw_students, raw_attendance, raw_leaves)):
        return _error("students, attendance, and leaves must be arrays.")

    try:
        students = []
        client_ids = set()
        rolls = set()
        for value in raw_students:
            if not isinstance(value, dict):
                raise ValueError("Each student must be a JSON object.")
            name, roll, student_class, email = _student_fields_for_import(value)
            client_id = _text(value.get("id") or new_id(), "Student id", 36)
            if client_id in client_ids:
                raise ValueError("Student ids must be unique.")
            if roll.casefold() in rolls:
                raise FileExistsError("That roll number is already registered.")
            client_ids.add(client_id)
            rolls.add(roll.casefold())
            students.append((client_id, name, roll, student_class, email))

        attendance = []
        attendance_keys = set()
        for value in raw_attendance:
            if not isinstance(value, dict):
                raise ValueError("Each attendance record must be a JSON object.")
            student_id = _text(str(value.get("studentId", "")), "Attendance student id", 36)
            day = _date(value.get("date"), "Attendance date")
            status = value.get("status")
            if status not in ATTENDANCE_STATUSES:
                raise ValueError("Attendance status must be Present, Absent, or Late.")
            key = (student_id, day)
            if student_id not in client_ids:
                raise ValueError("Attendance refers to an unknown student.")
            if key in attendance_keys:
                raise ValueError("A student can have only one attendance record per date.")
            attendance_keys.add(key)
            attendance.append((student_id, day, status))

        leaves = []
        for value in raw_leaves:
            if not isinstance(value, dict):
                raise ValueError("Each leave request must be a JSON object.")
            student_id = _text(str(value.get("studentId", "")), "Leave student id", 36)
            start = _date(value.get("start"), "Leave start date")
            end = _date(value.get("end"), "Leave end date")
            reason = _text(value.get("reason"), "Reason", 300)
            status = value.get("status", "Pending")
            if student_id not in client_ids:
                raise ValueError("Leave request refers to an unknown student.")
            if end < start:
                raise ValueError("Leave end date cannot be earlier than its start date.")
            if status not in LEAVE_STATUSES:
                raise ValueError("Leave status is invalid.")
            raw_created_at = value.get("createdAt")
            created_at = datetime.fromisoformat(raw_created_at.replace("Z", "+00:00")) if raw_created_at else datetime.now().astimezone()
            leaves.append((student_id, start, end, reason, status, created_at))
    except FileExistsError as error:
        return _error(str(error), 409)
    except ValueError as error:
        return _error(str(error))

    try:
        LeaveRequest.query.delete(synchronize_session=False)
        AttendanceRecord.query.delete(synchronize_session=False)
        Student.query.delete(synchronize_session=False)
        student_map = {}
        for client_id, name, roll, student_class, email in students:
            student = Student(
                id=client_id,
                name=name,
                roll_number=roll,
                student_class=student_class,
                email=email,
            )
            db.session.add(student)
            student_map[client_id] = student
        db.session.flush()

        for student_id, day, status in attendance:
            db.session.add(AttendanceRecord(
                id=new_id(), student_id=student_map[student_id].id, attendance_date=day, status=status
            ))
        for student_id, start, end, reason, status, created_at in leaves:
            db.session.add(LeaveRequest(
                id=new_id(), student_id=student_map[student_id].id, start_date=start, end_date=end,
                reason=reason, status=status, created_at=created_at
            ))
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _error("The supplied records conflict with database constraints.", 409)
    except SQLAlchemyError:
        db.session.rollback()
        return _error("Could not save the supplied records.", 500)
    return jsonify(_state_data())


def _student_fields_for_import(value):
    name = _text(value.get("name"), "Name", 80)
    roll = _text(value.get("roll"), "Roll number", 30)
    student_class = _text(value.get("studentClass"), "Class / section", 40)
    email = _text(value.get("email", ""), "Email", 120, required=False)
    if email and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise ValueError("Email address is invalid.")
    return name, roll, student_class, email


@api.get("/students")
def list_students():
    query = Student.query
    term = request.args.get("q", "").strip()
    if term:
        pattern = f"%{term}%"
        query = query.filter(db.or_(
            Student.name.ilike(pattern),
            Student.roll_number.ilike(pattern),
            Student.student_class.ilike(pattern),
            Student.email.ilike(pattern),
        ))
    return jsonify({"students": [_student_data(item) for item in query.order_by(Student.name).all()]})


@api.post("/students")
def create_student():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return _error("A JSON object is required.")
    try:
        name, roll, student_class, email = _student_fields(body)
    except FileExistsError as error:
        return _error(str(error), 409)
    except ValueError as error:
        return _error(str(error))
    student = Student(name=name, roll_number=roll, student_class=student_class, email=email)
    db.session.add(student)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _error("That roll number is already registered.", 409)
    return jsonify(_student_data(student)), 201


@api.get("/students/<string:student_id>")
def get_student(student_id):
    student, error = _student_or_404(student_id)
    return error or jsonify(_student_data(student))


@api.put("/students/<string:student_id>")
def update_student(student_id):
    student, error = _student_or_404(student_id)
    if error:
        return error
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return _error("A JSON object is required.")
    try:
        name, roll, student_class, email = _student_fields(body, exclude_id=student_id)
    except FileExistsError as error:
        return _error(str(error), 409)
    except ValueError as error:
        return _error(str(error))
    student.name = name
    student.roll_number = roll
    student.student_class = student_class
    student.email = email
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _error("That roll number is already registered.", 409)
    return jsonify(_student_data(student))


@api.delete("/students/<string:student_id>")
def delete_student(student_id):
    student, error = _student_or_404(student_id)
    if error:
        return error
    db.session.delete(student)
    db.session.commit()
    return jsonify({"deleted": True, "id": student_id})


@api.get("/attendance")
def list_attendance():
    try:
        query = AttendanceRecord.query
        selected = request.args.get("date")
        start = request.args.get("start")
        end = request.args.get("end")
        if selected:
            query = query.filter(AttendanceRecord.attendance_date == _date(selected, "Date"))
        else:
            if start:
                query = query.filter(AttendanceRecord.attendance_date >= _date(start, "Start date"))
            if end:
                query = query.filter(AttendanceRecord.attendance_date <= _date(end, "End date"))
        if start and end and _date(start, "Start date") > _date(end, "End date"):
            raise ValueError("Start date must be on or before end date.")
    except ValueError as error:
        return _error(str(error))
    records = query.order_by(AttendanceRecord.attendance_date, AttendanceRecord.student_id).all()
    return jsonify({"attendance": [_attendance_data(item) for item in records]})


@api.post("/attendance")
def save_attendance():
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or not isinstance(body.get("records"), list):
        return _error("A JSON object with a records array is required.")
    try:
        selected_date = _date(body.get("date"), "Date")
        if selected_date > date.today():
            raise ValueError("Attendance cannot be recorded for a future date.")
        normalized = []
        seen_students = set()
        for value in body["records"]:
            if not isinstance(value, dict):
                raise ValueError("Each attendance record must be a JSON object.")
            student_id = _text(str(value.get("studentId", "")), "Student id", 36)
            status = value.get("status")
            if status not in ATTENDANCE_STATUSES | {"Unmarked"}:
                raise ValueError("Attendance status must be Present, Absent, Late, or Unmarked.")
            if student_id in seen_students:
                raise ValueError("A student can be included only once per date.")
            if db.session.get(Student, student_id) is None:
                raise ValueError("Attendance refers to an unknown student.")
            seen_students.add(student_id)
            normalized.append((student_id, status))
    except ValueError as error:
        return _error(str(error))

    try:
        for student_id, status in normalized:
            record = AttendanceRecord.query.filter_by(
                student_id=student_id, attendance_date=selected_date
            ).first()
            if status == "Unmarked":
                if record:
                    db.session.delete(record)
                continue
            if record:
                record.status = status
            else:
                db.session.add(AttendanceRecord(
                    student_id=student_id, attendance_date=selected_date, status=status
                ))
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _error("Attendance could not be saved because a record already exists.", 409)
    except SQLAlchemyError:
        db.session.rollback()
        return _error("Attendance could not be saved.", 500)

    records = AttendanceRecord.query.filter_by(attendance_date=selected_date).all()
    return jsonify({"date": selected_date.isoformat(), "attendance": [_attendance_data(item) for item in records]})


@api.get("/leaves")
def list_leaves():
    status = request.args.get("status", "All")
    if status not in {"All", *LEAVE_STATUSES}:
        return _error("Leave status filter is invalid.")
    query = LeaveRequest.query
    if status != "All":
        query = query.filter_by(status=status)
    records = query.order_by(LeaveRequest.created_at.desc()).all()
    return jsonify({"leaves": [_leave_data(item) for item in records]})


@api.post("/leaves")
def create_leave():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return _error("A JSON object is required.")
    try:
        student_id = _text(str(body.get("studentId", "")), "Student id", 36)
        start = _date(body.get("start"), "Start date")
        end = _date(body.get("end"), "End date")
        reason = _text(body.get("reason"), "Reason", 300)
        if db.session.get(Student, student_id) is None:
            return _error("Select a registered student.")
        if start < date.today():
            return _error("Leave start date cannot be in the past.")
        if end < start:
            return _error("End date cannot be earlier than the start date.")
    except ValueError as error:
        return _error(str(error))
    leave = LeaveRequest(
        student_id=student_id, start_date=start, end_date=end, reason=reason, status="Pending"
    )
    db.session.add(leave)
    db.session.commit()
    return jsonify(_leave_data(leave)), 201


@api.patch("/leaves/<string:leave_id>")
def review_leave(leave_id):
    leave = db.session.get(LeaveRequest, leave_id)
    if leave is None:
        return _error("Leave request not found.", 404)
    body = request.get_json(silent=True)
    status = body.get("status") if isinstance(body, dict) else None
    if status not in {"Approved", "Rejected"}:
        return _error("Status must be Approved or Rejected.")
    if leave.status != "Pending":
        return _error("This leave request has already been reviewed.", 409)
    leave.status = status
    db.session.commit()
    return jsonify(_leave_data(leave))


@api.get("/reports")
def attendance_report():
    try:
        start_value = request.args.get("start")
        end_value = request.args.get("end")
        start = _date(start_value, "Start date") if start_value else None
        end = _date(end_value, "End date") if end_value else None
        if start and end and start > end:
            raise ValueError("Start date must be on or before end date.")
    except ValueError as error:
        return _error(str(error))

    query = AttendanceRecord.query
    if start:
        query = query.filter(AttendanceRecord.attendance_date >= start)
    if end:
        query = query.filter(AttendanceRecord.attendance_date <= end)
    records = query.all()
    counts = {}
    for record in records:
        counts.setdefault(record.student_id, {"present": 0, "absent": 0, "late": 0})
        counts[record.student_id][record.status.lower()] += 1

    students = []
    for student in Student.query.order_by(Student.roll_number).all():
        count = counts.get(student.id, {"present": 0, "absent": 0, "late": 0})
        total = count["present"] + count["absent"] + count["late"]
        students.append({
            **_student_data(student),
            "totalRecords": total,
            "present": count["present"],
            "absent": count["absent"],
            "late": count["late"],
            "attendancePercent": round((count["present"] + count["late"]) / total * 100, 1) if total else 0,
        })
    present = sum(item["present"] for item in counts.values())
    absent = sum(item["absent"] for item in counts.values())
    late = sum(item["late"] for item in counts.values())
    return jsonify({
        "summary": {"attendanceRecords": present + absent + late, "present": present, "absent": absent, "late": late},
        "students": students,
    })