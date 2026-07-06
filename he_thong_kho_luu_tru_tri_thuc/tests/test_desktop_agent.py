import importlib.util
import json
import sys
import tempfile
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
AGENT_PATH = ROOT / "desktop-agent" / "agent.py"
SPEC = importlib.util.spec_from_file_location("desktop_agent_module_v4", AGENT_PATH)
agent = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = agent
SPEC.loader.exec_module(agent)


def test_sanitize_dialog_initial_path_requires_existing_absolute_directory():
    with tempfile.TemporaryDirectory() as directory:
        valid = agent.sanitize_dialog_initial_path(directory)
        missing = agent.sanitize_dialog_initial_path(str(Path(directory) / "missing"))
        relative = agent.sanitize_dialog_initial_path("relative-folder")
        control = agent.sanitize_dialog_initial_path("bad\npath")

    assert valid == str(Path(directory).resolve())
    assert missing == ""
    assert relative == ""
    assert control == ""


def test_sanitize_dialog_title_falls_back_for_control_characters():
    assert agent.sanitize_dialog_title("Pick folder") == "Pick folder"
    assert agent.sanitize_dialog_title("Bad\nTitle") == "Select watch folder"
    assert agent.sanitize_dialog_title("") == "Select watch folder"


def test_local_control_api_sanitizes_pick_folder_inputs(monkeypatch):
    captured = {}
    config = {**agent.DEFAULT_CONFIG, "local_control_port": 8877}
    api = agent.LocalControlAPI(config)

    def fake_pick_folder_dialog(initial_path="", title=""):
        captured["initial_path"] = initial_path
        captured["title"] = title
        return r"D:\Teaching\AI"

    monkeypatch.setattr(agent, "pick_folder_dialog", fake_pick_folder_dialog)

    try:
        api.start()
        request = urllib.request.Request(
            "http://127.0.0.1:8877/pick-folder",
            data=json.dumps({"initial_path": "bad\npath", "title": "bad\ntitle"}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
    finally:
        api.stop()

    assert payload["cancelled"] is False
    assert captured == {"initial_path": "", "title": "Select watch folder"}


def test_load_config_promotes_remote_backend_when_local_profile_is_stale():
    with tempfile.TemporaryDirectory() as directory:
        config_path = Path(directory) / "config.json"
        config_path.write_text(
            json.dumps(
                {
                    "active_backend": "local",
                    "backend_profiles": {
                        "local": "http://127.0.0.1:8080",
                        "deploy": "https://c2-app-012-api.eduvinuni.io.vn",
                    },
                    "backend_url": "https://c2-app-012-api.eduvinuni.io.vn",
                    "token": "",
                    "user_code": "",
                }
            ),
            encoding="utf-8",
        )

        config = agent.load_config(config_path)
        saved = json.loads(config_path.read_text(encoding="utf-8"))

    assert config["active_backend"] == "deploy"
    assert config["backend_url"] == "https://c2-app-012-api.eduvinuni.io.vn"
    assert saved["active_backend"] == "deploy"


def test_sync_remote_watch_folders_keeps_remote_backend_on_deploy_profile():
    with tempfile.TemporaryDirectory() as directory:
        config_path = Path(directory) / "config.json"
        config = {
            **agent.DEFAULT_CONFIG,
            "active_backend": "local",
            "backend_profiles": {
                "local": "http://127.0.0.1:8080",
                "deploy": "https://c2-app-012-api.eduvinuni.io.vn",
            },
            "backend_url": "http://127.0.0.1:8080",
            "token": "",
            "user_code": "",
        }
        service = agent.DesktopAgentAuthService(config_path, config)
        service.fetch_desktop_agent_config = lambda: {
            "backend_url": "https://c2-app-012-api.eduvinuni.io.vn",
            "watch_folders": [r"D:\Teaching\CNTT"],
            "remote_config_poll_interval": 60,
            "poll_interval": 5,
            "retry_limit": 10,
        }

        folders = service.sync_remote_watch_folders()

    assert folders == [r"D:\Teaching\CNTT"]
    assert service.config["active_backend"] == "deploy"
    assert service.config["backend_profiles"]["local"] == "http://127.0.0.1:8080"
    assert service.config["backend_profiles"]["deploy"] == "https://c2-app-012-api.eduvinuni.io.vn"
    assert service.config["backend_url"] == "https://c2-app-012-api.eduvinuni.io.vn"
