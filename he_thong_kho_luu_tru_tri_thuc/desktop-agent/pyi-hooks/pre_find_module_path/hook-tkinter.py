def pre_find_module_path(hook_api):
    # Allow tkinter to be collected even when the local Python installation
    # needs manual TCL/TK env priming. Runtime hooks set those env vars later.
    return
