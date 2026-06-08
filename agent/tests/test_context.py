from context import build_system_message, build_context


def test_build_system_message_includes_workspace_and_repos():
    msg = build_system_message(
        workspace="/Users/test/workspace",
        repos=["/Users/test/repo1", "/Users/test/repo2"],
        output_dir="/Users/test/workspace/docs",
    )
    assert "/Users/test/workspace" in msg
    assert "/Users/test/repo1" in msg
    assert "/Users/test/repo2" in msg
    assert "/Users/test/workspace/docs" in msg


def test_build_system_message_with_no_repos():
    msg = build_system_message(
        workspace="/Users/test/workspace",
        repos=[],
        output_dir="/Users/test/workspace/docs",
    )
    assert "/Users/test/workspace" in msg


def test_build_context_returns_correct_dict():
    result = build_context(
        workspace="/ws",
        repos=["/repo"],
        output_dir="/ws/docs",
    )
    assert result["workspace"] == "/ws"
    assert result["repos"] == ["/repo"]
    assert result["output_dir"] == "/ws/docs"


def test_build_context_default_output_dir():
    result = build_context(workspace="/ws", repos=["/repo"])
    assert result["output_dir"] == "/ws"
