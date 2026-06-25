import os
import sys
import tempfile
from pathlib import Path
import pytest


class TestSandboxProfile:
    """Tests for _build_sandbox_profile — verifies template filling."""

    def test_build_profile_fills_all_placeholders(self):
        """Generated profile must contain zero <PARAM_* markers."""
        from tools.mindmap_tools import _build_sandbox_profile

        profile = _build_sandbox_profile(
            workspace="/tmp/ws",
            repos=["/tmp/repo-a", "/tmp/repo-b"],
            output_dir="/tmp/out",
        )
        assert "<PARAM_" not in profile, (
            f"Profile still contains unfilled placeholders: "
            f"{[l for l in profile.split(chr(10)) if '<PARAM_' in l]}"
        )

    def test_build_profile_includes_repo_rules(self):
        """Each repo gets its own (allow file-read* ...) rule."""
        from tools.mindmap_tools import _build_sandbox_profile

        profile = _build_sandbox_profile(
            workspace="/tmp/ws",
            repos=["/tmp/repo-a", "/tmp/repo-b"],
            output_dir="/tmp/out",
        )
        assert '(allow file-read* (subpath "/tmp/repo-a"))' in profile
        assert '(allow file-read* (subpath "/tmp/repo-b"))' in profile

    def test_build_profile_includes_workspace_write(self):
        from tools.mindmap_tools import _build_sandbox_profile

        profile = _build_sandbox_profile(
            workspace="/tmp/ws",
            repos=[],
            output_dir="/tmp/out",
        )
        assert '(allow file-write* (subpath "/tmp/ws"))' in profile

    def test_build_profile_no_repos_produces_empty_rules(self):
        """Empty repos list should result in no extra repo rules."""
        from tools.mindmap_tools import _build_sandbox_profile

        profile = _build_sandbox_profile(
            workspace="/tmp/ws", repos=[], output_dir="/tmp/out"
        )
        # repos line should be empty (just the placeholder replaced)
        lines = profile.split("\n")
        repos_section_start = lines.index(";; —— Read-only: repos (generated at runtime) ——")
        next_line = lines[repos_section_start + 1]
        # Next line after the comment should be empty (or the next section comment)
        assert next_line == "" or next_line.startswith(";;")

    def test_build_profile_has_version_and_deny_default(self):
        from tools.mindmap_tools import _build_sandbox_profile

        profile = _build_sandbox_profile(
            workspace="/tmp/ws", repos=[], output_dir="/tmp/out"
        )
        assert profile.startswith("(version 1)")
        assert "(deny default)" in profile


class TestSetSkillGuard:
    """Tests for set_skill_guard module-level setter."""

    def test_set_and_read_guard(self):
        import tools.mindmap_tools as mmt
        from tools.permissions import PermissionGuard

        g = PermissionGuard(
            workspace="/tmp/ws", repos=[],
            output_dir="/tmp/out", skills_dir="/tmp/sk"
        )
        mmt.set_skill_guard(g)
        try:
            assert mmt._guard is g
        finally:
            mmt.set_skill_guard(None)  # cleanup

    def test_set_guard_none(self):
        import tools.mindmap_tools as mmt

        mmt.set_skill_guard(None)
        assert mmt._guard is None
