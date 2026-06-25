import os


class PermissionGuard:
    """Classifies file paths into access zones and enforces read/write permissions.

    Four zones:
      - workspace: read + write (user's notebook directory)
      - output:    read + write (generated document output directory)
      - repo:      read only   (attached code repositories)
      - skills:    read only   (internal skill scripts)
      - denied:    no access   (everything else)
    """

    def __init__(
        self,
        workspace: str,
        repos: list[str],
        output_dir: str,
        skills_dir: str,
    ):
        self.workspace = os.path.realpath(workspace)
        # Defensive copy: list comprehension creates a new list so external
        # mutation of the original list does not affect the guard instance.
        self.repos = [os.path.realpath(r) for r in repos]
        self.output_dir = os.path.realpath(output_dir)
        self.skills_dir = os.path.realpath(skills_dir)

    def classify(self, path: str) -> str:
        """Return zone: 'workspace' | 'repo' | 'output' | 'skills' | 'denied'"""
        try:
            real = os.path.realpath(path)
        except (OSError, ValueError):
            return "denied"
        if real == self.workspace or real.startswith(self.workspace + os.sep):
            return "workspace"
        if real == self.output_dir or real.startswith(self.output_dir + os.sep):
            return "output"
        for r in self.repos:
            if real == r or real.startswith(r + os.sep):
                return "repo"
        if real == self.skills_dir or real.startswith(self.skills_dir + os.sep):
            return "skills"
        return "denied"

    def check(self, path: str, needs_write: bool = False) -> dict:
        """Unified entry point. Returns {"ok": True, "zone": ...}
           or {"ok": False, "error": ..., "zone": ...}"""
        zone = self.classify(path)
        if zone == "denied":
            return {
                "ok": False,
                "error": f"Permission denied: '{path}' is outside allowed directories",
                "zone": "denied",
            }
        if needs_write and zone == "repo":
            return {
                "ok": False,
                "error": f"Permission denied: '{path}' is in a read-only repo directory",
                "zone": "repo",
            }
        if needs_write and zone == "skills":
            return {
                "ok": False,
                "error": f"Permission denied: skills directory is read-only",
                "zone": "skills",
            }
        return {"ok": True, "zone": zone}

    def update(self, workspace: str, repos: list[str], output_dir: str) -> None:
        """Update mutable per-request fields. skills_dir is immutable (server-level)."""
        self.workspace = os.path.realpath(workspace)
        # Defensive copy: list comprehension creates a new list so external
        # mutation of the original list does not affect the guard instance.
        self.repos = [os.path.realpath(r) for r in repos]
        self.output_dir = os.path.realpath(output_dir)
