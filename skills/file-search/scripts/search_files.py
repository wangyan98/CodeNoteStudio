#!/usr/bin/env python3
"""Search for files by name or content in a directory."""
import argparse
import fnmatch
import json
import os
import sys


def search_files(
    directory: str,
    name_pattern: str = "*",
    content_query: str = "",
    recursive: bool = True,
    max_results: int = 100,
) -> dict:
    if not os.path.isdir(directory):
        return {"ok": False, "error": f"Not a directory: {directory}"}

    results = []
    truncated = False

    def walk_dir(path: str):
        nonlocal truncated
        try:
            entries = os.scandir(path)
        except PermissionError:
            return

        for entry in entries:
            if truncated:
                break
            if entry.name.startswith("."):
                continue
            if entry.is_dir():
                if recursive:
                    walk_dir(entry.path)
            elif entry.is_file():
                # Name match
                if name_pattern != "*" and not fnmatch.fnmatch(entry.name, name_pattern):
                    continue

                # Content match
                content_match = None
                if content_query:
                    try:
                        with open(entry.path, "r", encoding="utf-8", errors="replace") as f:
                            for lineno, line in enumerate(f, 1):
                                if content_query.lower() in line.lower():
                                    content_match = {
                                        "line_number": lineno,
                                        "line": line.strip()[:200],
                                    }
                                    break
                    except Exception:
                        continue

                    if content_match is None:
                        continue

                result = {
                    "name": entry.name,
                    "path": entry.path,
                }
                if content_match:
                    result["match_line"] = content_match["line_number"]
                    result["match_preview"] = content_match["line"]

                results.append(result)
                if len(results) >= max_results:
                    truncated = True
                    break

    walk_dir(directory)

    output = {"ok": True, "results": results, "count": len(results)}
    if truncated:
        output["truncated"] = True
        output["hint"] = (
            f"Results truncated at {max_results}. "
            "Use a more specific name_pattern or content_query to narrow down."
        )
    return output


def main():
    parser = argparse.ArgumentParser(
        description="Search for files by name pattern and/or content query"
    )
    parser.add_argument("directory", help="Directory to search in")
    parser.add_argument(
        "--name", default="*", help="Filename glob pattern (default *)"
    )
    parser.add_argument(
        "--content", default="", help="Content search query (case-insensitive)"
    )
    parser.add_argument(
        "--no-recursive", action="store_true", help="Only search top-level directory"
    )
    parser.add_argument(
        "--max-results", type=int, default=100, help="Max results (default 100)"
    )
    args = parser.parse_args()

    result = search_files(
        directory=args.directory,
        name_pattern=args.name,
        content_query=args.content,
        recursive=not args.no_recursive,
        max_results=args.max_results,
    )
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
