import unittest
from datetime import date

from backend import create_app
from backend.extensions import db


class AttendanceApiTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app({
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite://",
            "SQLALCHEMY_ENGINE_OPTIONS": {},
        })
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def test_dashboard_assets_are_served_by_flask(self):
        for path, expected in (
            ("/", b"id=\"page-dashboard\""),
            ("/style.css", b"--primary"),
            ("/script.js", b"loadBackendState"),
        ):
            response = self.client.get(path)
            try:
                self.assertIn(expected, response.data)
            finally:
                response.close()

    def create_student(self, roll="CSE-101"):
        response = self.client.post("/api/v1/students", json={
            "name": "Asha Kumar",
            "roll": roll,
            "studentClass": "CSE 2A",
            "email": "asha@example.com",
        })
        self.assertEqual(response.status_code, 201)
        return response.get_json()

    def test_student_roll_number_is_unique_case_insensitively(self):
        self.create_student()
        response = self.client.post("/api/v1/students", json={
            "name": "Another Student",
            "roll": "cse-101",
            "studentClass": "CSE 2A",
        })
        self.assertEqual(response.status_code, 409)

    def test_attendance_upsert_and_report(self):
        student = self.create_student()
        payload = {
            "date": date.today().isoformat(),
            "records": [{"studentId": student["id"], "status": "Present"}],
        }
        self.assertEqual(self.client.post("/api/v1/attendance", json=payload).status_code, 200)
        payload["records"][0]["status"] = "Absent"
        updated = self.client.post("/api/v1/attendance", json=payload).get_json()
        self.assertEqual(len(updated["attendance"]), 1)
        self.assertEqual(updated["attendance"][0]["status"], "Absent")

        report = self.client.get("/api/v1/reports").get_json()
        self.assertEqual(report["summary"]["attendanceRecords"], 1)
        self.assertEqual(report["students"][0]["attendancePercent"], 0)

    def test_late_counts_as_attended_and_unmarked_removes_record(self):
        student = self.create_student()
        date_value = date.today().isoformat()
        response = self.client.post("/api/v1/attendance", json={
            "date": date_value,
            "records": [{"studentId": student["id"], "status": "Late"}],
        })
        self.assertEqual(response.status_code, 200)
        report = self.client.get("/api/v1/reports").get_json()
        self.assertEqual(report["summary"]["late"], 1)
        self.assertEqual(report["students"][0]["attendancePercent"], 100)

        cleared = self.client.post("/api/v1/attendance", json={
            "date": date_value,
            "records": [{"studentId": student["id"], "status": "Unmarked"}],
        })
        self.assertEqual(cleared.status_code, 200)
        self.assertEqual(cleared.get_json()["attendance"], [])

    def test_leave_request_can_be_reviewed_once(self):
        student = self.create_student()
        today = date.today().isoformat()
        response = self.client.post("/api/v1/leaves", json={
            "studentId": student["id"],
            "start": today,
            "end": today,
            "reason": "Medical appointment",
        })
        self.assertEqual(response.status_code, 201)
        leave_id = response.get_json()["id"]
        reviewed = self.client.patch(f"/api/v1/leaves/{leave_id}", json={"status": "Approved"})
        self.assertEqual(reviewed.status_code, 200)
        second_review = self.client.patch(f"/api/v1/leaves/{leave_id}", json={"status": "Rejected"})
        self.assertEqual(second_review.status_code, 409)

    def test_state_sync_preserves_frontend_shape(self):
        payload = {
            "students": [{
                "id": "student-local-1",
                "name": "Asha Kumar",
                "roll": "CSE-101",
                "studentClass": "CSE 2A",
                "email": "",
            }],
            "attendance": [{
                "id": "attendance-local-1",
                "studentId": "student-local-1",
                "date": date.today().isoformat(),
                "status": "Present",
            }],
            "leaves": [],
        }
        response = self.client.put("/api/v1/state", json=payload)
        self.assertEqual(response.status_code, 200)
        state = self.client.get("/api/v1/state").get_json()
        self.assertEqual(state["students"][0]["id"], "student-local-1")
        self.assertEqual(state["attendance"][0]["studentId"], "student-local-1")


if __name__ == "__main__":
    unittest.main()