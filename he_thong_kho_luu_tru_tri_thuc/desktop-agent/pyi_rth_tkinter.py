from __future__ import annotations

import os
import sys
from pathlib import Path


def _set_tk_env() -> None:
    base = Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
    tcl_library = base / "_tcl_data"
    tk_library = base / "_tk_data"
    if tcl_library.exists():
        os.environ.setdefault("TCL_LIBRARY", str(tcl_library))
    if tk_library.exists():
        os.environ.setdefault("TK_LIBRARY", str(tk_library))


_set_tk_env()
