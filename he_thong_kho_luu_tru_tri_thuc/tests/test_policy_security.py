import json
import os
import tempfile
from pathlib import Path

from src.eduvault import database, services
from src.eduvault.policy_management import parse_policy_command


def configure_temp_storage(root: Path):
    os.environ["DATABASE_PROVIDER"] = "sqlite"
    database.DATA_DIR = root
    database.DB_PATH = root / "eduvault.db"
    database.STORAGE_DIR = root / "storage"
    database.BACKUP_DIR = root / "backups"
    services.DB_PATH = database.DB_PATH
    services.STORAGE_DIR = database.STORAGE_DIR
    services.BACKUP_DIR = database.BACKUP_DIR
    database.init_database()


def activate_sample_policy():
    policy_payload = {
        "faculty": "Khoa CNTT",
        "specializations": [
            {
                "name": "Tri tue nhan tao",
                "code": "AI",
                "courses": [
                    {"name": "AI Application", "standard_folders": ["De cuong", "Bai giang"]},
                    {"name": "Machine Learning", "standard_folders": ["De cuong", "Bai giang"]},
                ],
            }
        ],
    }
    with database.transaction() as db:
        timestamp = database.now()
        policy_id = "policy-test"
        db.execute(
            """INSERT INTO policy_files(id,title,file_path,status,raw_text,parsed_json,created_by,created_at,activated_at)
               VALUES(?,?,?,?,?,?,?,?,?)""",
            (
                policy_id,
                "Policy Test",
                "policy-test.json",
                "active",
                json.dumps(policy_payload),
                json.dumps(policy_payload),
                "ADMIN",
                timestamp,
                timestamp,
            ),
        )
        faculty_id = "node-faculty"
        spec_id = "node-spec"
        course_ai_id = "node-course-ai"
        course_ml_id = "node-course-ml"
        db.execute(
            "INSERT INTO folder_nodes(id,policy_id,name,parent_id,type,path,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (faculty_id, policy_id, "Khoa CNTT", None, "faculty", "Khoa CNTT", "active", timestamp, timestamp),
        )
        db.execute(
            "INSERT INTO folder_nodes(id,policy_id,name,parent_id,type,path,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (spec_id, policy_id, "Tri tue nhan tao", faculty_id, "specialization", "Khoa CNTT/Tri tue nhan tao", "active", timestamp, timestamp),
        )
        db.execute(
            "INSERT INTO folder_nodes(id,policy_id,name,parent_id,type,path,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (course_ai_id, policy_id, "AI Application", spec_id, "course", "Khoa CNTT/Tri tue nhan tao/AI Application", "active", timestamp, timestamp),
        )
        db.execute(
            "INSERT INTO folder_nodes(id,policy_id,name,parent_id,type,path,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (course_ml_id, policy_id, "Machine Learning", spec_id, "course", "Khoa CNTT/Tri tue nhan tao/Machine Learning", "active", timestamp, timestamp),
        )


def test_parse_policy_command_requires_precise_delete_target():
    with tempfile.TemporaryDirectory() as directory:
        configure_temp_storage(Path(directory))
        activate_sample_policy()
        with database.connection() as db:
            result = parse_policy_command(db, "xoa AI")

    assert result["status"] == "ask_clarification"
    assert result["action"] == "delete_node"
    assert result["candidates"]


def test_parse_policy_command_allows_exact_rename_match():
    with tempfile.TemporaryDirectory() as directory:
        configure_temp_storage(Path(directory))
        activate_sample_policy()
        with database.connection() as db:
            result = parse_policy_command(db, "doi ten Machine Learning thanh ML")

    assert result["status"] == "need_confirmation"
    assert result["action"] == "rename_node"
    assert result["new_name"] == "ml"
