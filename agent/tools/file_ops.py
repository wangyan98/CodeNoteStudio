import os


def read_file(path: str, start_line: int = 1, end_line: int = -1, max_lines: int = 500) -> dict:
    """Read a file from disk. Optionally specify line range. Truncated if exceeds max_lines."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()

        total_lines = len(lines)

        if end_line == -1:
            end_line = min(start_line + max_lines - 1, total_lines)

        selected = lines[start_line - 1:end_line]
        content = "".join(selected)

        result = {
            "ok": True,
            "path": path,
            "content": content,
            "total_lines": total_lines,
            "start_line": start_line,
            "end_line": end_line,
        }
        if end_line < total_lines:
            result["truncated"] = True
            result["hint"] = f"Showing lines {start_line}-{end_line} of {total_lines}. Use start_line/end_line to read more."
        return result
    except FileNotFoundError:
        return {"ok": False, "error": f"File not found: {path}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def list_files(directory: str, pattern: str = "*", max_results: int = 200) -> dict:
    """List files in a directory recursively. Returns compact tree text format."""
    import fnmatch

    if not os.path.isdir(directory):
        return {"ok": False, "error": f"Not a directory: {directory}"}

    # Collect dirs and files, grouped by parent directory
    dir_entries: dict[str, list[str]] = {}
    file_entries: dict[str, list[str]] = {}
    total = 0
    truncated = False

    for root, dirs, filenames in os.walk(directory):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "__pycache__"]
        rel_root = os.path.relpath(root, directory)
        if rel_root == ".":
            rel_root = ""

        for d in dirs:
            if total >= max_results:
                truncated = True
                break
            dir_entries.setdefault(rel_root, []).append(d)
            total += 1

        for fname in filenames:
            if fname.startswith("."):
                continue
            if pattern != "*" and not fnmatch.fnmatch(fname, pattern):
                continue
            if total >= max_results:
                truncated = True
                break
            file_entries.setdefault(rel_root, []).append(fname)
            total += 1

        if truncated:
            break

    # Build compact tree text
    lines = []
    # Sort dirs to show top-level first, then nested
    for parent in sorted(dir_entries.keys()):
        for d in sorted(dir_entries[parent]):
            p = f"{parent}/{d}" if parent else d
            lines.append(f"{p}/")
        for f in sorted(file_entries.get(parent, [])):
            p = f"{parent}/{f}" if parent else f
            lines.append(p)

    # Also list files in dirs that have no subdirectories
    for parent in sorted(file_entries.keys()):
        if parent not in dir_entries:
            for f in sorted(file_entries[parent]):
                p = f"{parent}/{f}" if parent else f
                lines.append(p)

    tree = "\n".join(lines)
    result = {"ok": True, "tree": tree, "count": total}
    if truncated:
        result["truncated"] = True
        result["hint"] = f"Showing {total} of many entries. Use a more specific directory or pattern to narrow down."
    return result


def search_in_files(directory: str, query: str, file_pattern: str = "*.py", max_results: int = 50) -> dict:
    """Grep for a query string in files under a directory. Limited to max_results matches."""
    import fnmatch

    if not os.path.isdir(directory):
        return {"ok": False, "error": f"Not a directory: {directory}"}

    matches = []
    truncated = False
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
                            if len(matches) >= max_results:
                                truncated = True
                                break
            except Exception:
                continue
            if truncated:
                break
        if truncated:
            break

    result = {"ok": True, "matches": matches, "count": len(matches)}
    if truncated:
        result["truncated"] = True
        result["hint"] = f"Results truncated at {max_results}. Use a more specific directory or query to narrow down."
    return result
