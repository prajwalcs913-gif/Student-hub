# StudentHub — Student Attendance & Leave Management

A responsive college attendance dashboard built with HTML, CSS, vanilla JavaScript, Three.js, Flask, PostgreSQL, SQLAlchemy, and Flask-Migrate.

## Features
- College dashboard with daily attendance totals, attendance rate, and a seven-day trend
- Present, absent, late, and unmarked distribution with live dashboard charts
- Student add, edit, delete, search, and duplicate roll-number validation
- Date-based attendance, bulk marking, and updates without duplicate student/date records
- Leave requests with validation, approval, rejection, and status filtering
- Attendance reports with date-range filters and CSV export
- Global student/class search, leave notifications, admin menu, theme switch, and mobile navigation
- Responsive blue-and-white interface and animated 3D StudentHub logo
- Versioned JSON API and PostgreSQL persistence
- Local browser-storage fallback when the Flask API is unavailable

## Run With PostgreSQL
1. Install Python 3.10+ and PostgreSQL.
2. Create a PostgreSQL database and user (for example, database `studenthub` and user `studenthub`).
3. Create and activate a virtual environment:

	```powershell
	python -m venv .venv
	.\.venv\Scripts\Activate.ps1
	```

4. Install dependencies and configure the database URL:

	```powershell
	python -m pip install -r requirements.txt
	Copy-Item .env.example .env
	```

	Edit `.env` and set `DATABASE_URL` to your PostgreSQL credentials. Keep `.env` private; it is excluded from version control.

5. Apply migrations and start Flask:

	```powershell
	.\.venv\Scripts\flask.exe --app run db upgrade
	.\.venv\Scripts\python.exe run.py
	```

6. Open <http://127.0.0.1:5000>.

The header shows whether the dashboard is connected to the Flask database API. The 3D logo uses Three.js from a CDN; the static monogram remains as a fallback if the CDN or WebGL is unavailable.

In VS Code, select `.venv\Scripts\python.exe` as the Python interpreter. The workspace default is configured in `.vscode/settings.json`.

## Migrations
After changing a SQLAlchemy model, generate and apply a migration:

```powershell
.\.venv\Scripts\flask.exe --app run db migrate -m "Describe schema change"
.\.venv\Scripts\flask.exe --app run db upgrade
```

## JSON API
All routes are under `/api/v1` and accept/return JSON.
- `GET /health` — database connection status
- `GET, PUT /state` — synchronize the dashboard's complete state
- `GET, POST /students`, `GET, PUT, DELETE /students/<id>` — student records
- `GET, POST /attendance` — attendance queries and upserts
- `GET, POST /leaves`, `PATCH /leaves/<id>` — leave requests and review
- `GET /reports?start=YYYY-MM-DD&end=YYYY-MM-DD` — attendance summaries

## Local Demo Mode
You can still open `index.html` directly or use VS Code Live Server without starting Flask. In that mode, changes are stored in this browser's `localStorage` and do not sync to PostgreSQL.

## Tests
With dependencies installed, run:

```powershell
python -m unittest discover -s tests -v
```

The API tests use a temporary in-memory SQLite database; the application itself is configured for PostgreSQL.

## Security Note
This is a learning/demo system. It has no authentication, authorization, or production deployment hardening. Do not expose it publicly or store real student information until those protections are added.
