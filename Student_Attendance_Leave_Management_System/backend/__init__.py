from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, send_from_directory

from .extensions import db, migrate

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def create_app(test_config=None):
    load_dotenv(PROJECT_ROOT / ".env")
    app = Flask(__name__, static_folder=None)
    app.config.from_object("backend.config.Config")
    if test_config:
        app.config.update(test_config)

    db.init_app(app)
    migrate.init_app(app, db)

    from .api import api

    app.register_blueprint(api, url_prefix="/api/v1")

    @app.get("/")
    def index():
        return send_from_directory(PROJECT_ROOT, "index.html")

    @app.get("/style.css")
    def stylesheet():
        return send_from_directory(PROJECT_ROOT, "style.css")

    @app.get("/script.js")
    def application_script():
        return send_from_directory(PROJECT_ROOT, "script.js")

    @app.get("/education-art.js")
    def education_art_script():
        return send_from_directory(PROJECT_ROOT, "education-art.js")

    return app