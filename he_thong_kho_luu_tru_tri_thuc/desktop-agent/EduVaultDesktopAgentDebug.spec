# Debug PyInstaller build spec for diagnosing Desktop Agent startup.

from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files

block_cipher = None
project_root = Path(SPECPATH)
python_root = Path(__import__("sys").base_prefix)
hook_root = project_root / "pyi-hooks"

tk_datas = []
for source, target in (
    (python_root / "tcl" / "tcl8.6", "_tcl_data"),
    (python_root / "tcl" / "tk8.6", "_tk_data"),
    (python_root / "DLLs" / "tcl86t.dll", "."),
    (python_root / "DLLs" / "tk86t.dll", "."),
):
    if source.exists():
        tk_datas.append((str(source), target))

datas = collect_data_files("tkinter") + tk_datas

a = Analysis(
    [str(project_root / "gui.py")],
    pathex=[str(project_root)],
    binaries=[],
    datas=datas,
    hiddenimports=["tkinter", "_tkinter", "watchdog.observers.winapi", "watchdog.observers.read_directory_changes"],
    hookspath=[str(hook_root)],
    hooksconfig={},
    runtime_hooks=[str(project_root / "pyi_rth_tkinter.py")],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="EduVaultDesktopAgentDebug",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
)
