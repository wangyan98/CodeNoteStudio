import os


def read_file(path: str, start_line: int = 1, end_line: int = -1) -> dict:
    """Read a file from disk. Optionally specify line range."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()

        if end_line == -1:
            end_line = len(lines)

        selected = lines[start_line - 1:end_line]
        content = "".join(selected)

        return {
            "ok": True,
            "path": path,
            "content": content,
            "total_lines": len(lines),
        }
    except FileNotFoundError:
        return {"ok": False, "error": f"File not found: {path}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def list_files(directory: str, pattern: str = "*") -> dict:
    """List files in a directory, recursively."""
    import fnmatch

    if not os.path.isdir(directory):
        return {"ok": False, "error": f"Not a directory: {directory}"}

    files = []
    for root, dirs, filenames in os.walk(directory):
        # Skip hidden dirs
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "__pycache__"]

        for d in dirs:
            files.append({
                "name": d,
                "path": os.path.join(root, d),
                "is_directory": True,
            })

        for fname in filenames:
            if fname.startswith("."):
                continue
            if pattern != "*" and not fnmatch.fnmatch(fname, pattern):
                continue
            files.append({
                "name": fname,
                "path": os.path.join(root, fname),
                "is_directory": False,
            })

    return {"ok": True, "files": files, "count": len(files)}


def search_in_files(directory: str, query: str, file_pattern: str = "*.py") -> dict:
    """Grep for a query string in files under a directory."""
    import fnmatch

    if not os.path.isdir(directory):
        return {"ok": False, "error": f"Not a directory: {directory}"}

    matches = []
    for root, dirs, filenames in os.walk(directory):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "__pycache__"]
        for fname in filenames:
            if not fnmatch.fnmatch(fname, file_pattern):
                continue
            fpath = os.path.join(root, fname)
            try:
                with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                    for lineno, line in enumerate(f, 1):
                        if query.lower() in line.lower():
                            matches.append({
                                "file": fpath,
                                "line_number": lineno,
                                "line": line.strip(),
                            })
            except Exception:
                continue

    return {"ok": True, "matches": matches, "count": len(matches)}
