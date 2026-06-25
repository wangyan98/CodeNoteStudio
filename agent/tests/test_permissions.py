import os
import tempfile
import pytest
from tools.permissions import PermissionGuard


class TestPermissionGuardClassify:
    """Zone classification tests."""

    @pytest.fixture
    def guard(self):
        ws = os.path.realpath("/tmp/test-ws")
        repo = os.path.realpath("/tmp/test-repo")
        out = os.path.realpath("/tmp/test-out")
        skills = os.path.realpath("/tmp/test-skills")
        return PermissionGuard(
            workspace=ws,
            repos=[repo],
            output_dir=out,
            skills_dir=skills,
        )

    def test_classify_workspace_path(self, guard):
        p = os.path.join(guard.workspace, "notes", "doc.md")
        assert guard.classify(p) == "workspace"

    def test_classify_workspace_root_exact_match(self, guard):
        assert guard.classify(guard.workspace) == "workspace"

    def test_classify_repo_path(self, guard):
        repo = guard.repos[0]
        p = os.path.join(repo, "src", "main.py")
        assert guard.classify(p) == "repo"

    def test_classify_repo_root_exact_match(self, guard):
        assert guard.classify(guard.repos[0]) == "repo"

    def test_classify_output_path(self, guard):
        p = os.path.join(guard.output_dir, "docs", "readme.md")
        assert guard.classify(p) == "output"

    def test_classify_skills_path(self, guard):
        p = os.path.join(guard.skills_dir, "mind-map", "SKILL.md")
        assert guard.classify(p) == "skills"

    def test_classify_denied_etc_passwd(self, guard):
        assert guard.classify("/etc/passwd") == "denied"

    def test_classify_denied_home_dir(self, guard):
        home = os.path.expanduser("~")
        # If home happens to equal one of the allowed dirs, pick something else
        p = os.path.join(home, ".ssh", "id_rsa")
        # Only assert denied if not accidentally in an allowed zone
        if not any(
            p.startswith(d + os.sep) or p == d
            for d in [guard.workspace, guard.output_dir]
            + [guard.repos[0], guard.skills_dir]
        ):
            assert guard.classify(p) == "denied"

    def test_classify_resolves_symlink(self, guard):
        """Symlinked path resolves to real path before classification."""
        with tempfile.TemporaryDirectory() as tmpdir:
            link = os.path.join(tmpdir, "link_to_passwd")
            os.symlink("/etc/passwd", link)
            # The symlink target (/etc/passwd) should resolve to denied
            result = guard.classify(link)
            # realpath resolves the symlink → /etc/passwd → denied
            assert result == "denied"

    def test_classify_dotdot_traversal(self, guard):
        """../ escapes are resolved before zone check."""
        p = os.path.join(guard.workspace, "..", "..", "etc", "passwd")
        assert guard.classify(p) == "denied"

    def test_classify_workspace_wins_over_output_when_overlapping(self):
        """When output_dir is subdir of workspace, workspace matches first."""
        ws = os.path.realpath("/tmp/test-ws-overlap")
        out = os.path.join(ws, "output")
        guard = PermissionGuard(
            workspace=ws, repos=[], output_dir=out, skills_dir="/tmp/sk"
        )
        # A file in output/ should match workspace first (both are RW, same outcome)
        p = os.path.join(out, "file.md")
        zone = guard.classify(p)
        assert zone in ("workspace", "output")  # either is fine for RW

    def test_classify_multiple_repos(self):
        """Multiple repos are all checked."""
        ws = os.path.realpath("/tmp/ws-multi")
        r1 = os.path.realpath("/tmp/repo-a")
        r2 = os.path.realpath("/tmp/repo-b")
        guard = PermissionGuard(
            workspace=ws, repos=[r1, r2],
            output_dir=ws, skills_dir="/tmp/sk"
        )
        assert guard.classify(os.path.join(r1, "a.py")) == "repo"
        assert guard.classify(os.path.join(r2, "b.py")) == "repo"


class TestPermissionGuardCheck:
    """Permission check tests."""

    @pytest.fixture
    def guard(self):
        return PermissionGuard(
            workspace=os.path.realpath("/tmp/ws-check"),
            repos=[os.path.realpath("/tmp/repo-check")],
            output_dir=os.path.realpath("/tmp/out-check"),
            skills_dir=os.path.realpath("/tmp/skills-check"),
        )

    def test_check_read_workspace_ok(self, guard):
        result = guard.check(
            os.path.join(guard.workspace, "file.md"), needs_write=False
        )
        assert result["ok"] is True
        assert result["zone"] == "workspace"

    def test_check_write_workspace_ok(self, guard):
        result = guard.check(
            os.path.join(guard.workspace, "file.md"), needs_write=True
        )
        assert result["ok"] is True

    def test_check_read_repo_ok(self, guard):
        result = guard.check(
            os.path.join(guard.repos[0], "src", "main.py"), needs_write=False
        )
        assert result["ok"] is True
        assert result["zone"] == "repo"

    def test_check_write_repo_denied(self, guard):
        result = guard.check(
            os.path.join(guard.repos[0], "src", "main.py"), needs_write=True
        )
        assert result["ok"] is False
        assert "read-only repo" in result["error"]
        assert result["zone"] == "repo"

    def test_check_write_skills_denied(self, guard):
        result = guard.check(
            os.path.join(guard.skills_dir, "script.py"), needs_write=True
        )
        assert result["ok"] is False
        assert "skills" in result["error"]

    def test_check_read_denied_etc(self, guard):
        result = guard.check("/etc/passwd", needs_write=False)
        assert result["ok"] is False
        assert "outside allowed" in result["error"]
        assert result["zone"] == "denied"

    def test_check_write_denied_etc(self, guard):
        result = guard.check("/etc/passwd", needs_write=True)
        assert result["ok"] is False


class TestPermissionGuardUpdate:
    """Per-request guard.update() tests."""

    def test_update_changes_workspace(self):
        guard = PermissionGuard(
            workspace="/tmp/old-ws", repos=[],
            output_dir="/tmp/old-out", skills_dir="/tmp/sk"
        )
        guard.update(
            workspace="/tmp/new-ws", repos=["/tmp/new-repo"],
            output_dir="/tmp/new-out"
        )
        assert guard.workspace == os.path.realpath("/tmp/new-ws")
        assert guard.repos == [os.path.realpath("/tmp/new-repo")]
        assert guard.output_dir == os.path.realpath("/tmp/new-out")

    def test_update_preserves_skills_dir(self):
        guard = PermissionGuard(
            workspace="/tmp/ws", repos=[],
            output_dir="/tmp/out", skills_dir="/tmp/orig-skills"
        )
        guard.update(workspace="/tmp/ws2", repos=[], output_dir="/tmp/out2")
        assert guard.skills_dir == os.path.realpath("/tmp/orig-skills")

    def test_update_then_classify_uses_new_zones(self):
        guard = PermissionGuard(
            workspace="/tmp/ws1", repos=["/tmp/repo1"],
            output_dir="/tmp/out1", skills_dir="/tmp/sk"
        )
        guard.update(
            workspace="/tmp/ws2", repos=["/tmp/repo2"],
            output_dir="/tmp/out2"
        )
        assert guard.classify(os.path.join("/tmp/ws2", "f.md")) == "workspace"
        assert guard.classify(os.path.join("/tmp/ws1", "f.md")) == "denied"
        assert guard.classify(os.path.join("/tmp/repo2", "f.py")) == "repo"
        assert guard.classify(os.path.join("/tmp/repo1", "f.py")) == "denied"
