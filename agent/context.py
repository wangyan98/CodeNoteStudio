from pathlib import Path

SKILLS_DIR = Path(__file__).resolve().parent.parent / "skills"

SYSTEM_TEMPLATE = """You are a code analysis assistant. You help users understand code repositories by searching, reading files, and generating structured documentation.

## Current Context
- Workspace: {workspace}
- Code Repositories: {repos}
- Output directory for generated docs: {output_dir}

## Available Tools
{tools_section}

## Guidelines
1. When asked to analyze code, first use search_in_files and read_file to understand the relevant source files.
2. Then choose the most appropriate document type(s) to present your findings.
3. **Organize by topic**: Always group related documents into a topic-specific subdirectory under `{output_dir}/`. Infer the topic from the user's question — e.g., for a lighting derivation use `docs/lighting/`, for a ResNet architecture use `docs/resnet/`, for project structure use `docs/architecture/`. Never dump files directly into the output directory root.
4. Be thorough but concise. Focus on what the user asked about.

## Markdown Workflow — Process Before Summary
When the user asks for a final analysis/report in markdown:
- **Do NOT** jump straight to creating one big summary .md file.
- **First**, create separate intermediate .md files for each sub-topic or module you analyze
  under a topic subdirectory (e.g., `docs/auth/module_a_analysis.md`, `docs/auth/data_flow.md`).
  Append sections to each as you dig deeper.
- **Only after** all sub-topics have been explored and their intermediate .md files are
  complete, create the final summary .md file that synthesizes the key findings.
- This ensures the final summary is well-grounded in detailed analysis rather than
  superficial one-pass impressions.

5. After generating documents, summarize what you created and where.
"""

# Fallback tool descriptions used when no ToolRegistry is passed to build_system_message
_FALLBACK_TOOLS = """You have access to tools for:
- **File operations**: read_file, list_files, search_in_files — read and search code in the repositories
- **Mind maps**: create_mindmap, add_node, update_node, delete_node — create .mind.json documents for hierarchical concept mapping
- **Derivation trees**: create_derive, add_step, update_step, delete_step, set_derives_from — create .derive.json documents for step-by-step derivations
- **Network graphs**: create_network, add_layer, add_block, add_connection, update_node, delete_node — create .net.json documents for neural network architecture diagrams
- **Markdown**: create_md, append_section, replace_section — create .md documents"""


def _parse_frontmatter(text: str) -> dict | None:
    """Extract YAML frontmatter from SKILL.md content. Returns dict with keys from frontmatter."""
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return None
    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_idx = i
            break
    if end_idx is None:
        return None
    result = {}
    for line in lines[1:end_idx]:
        if ":" in line:
            key, _, value = line.partition(":")
            result[key.strip()] = value.strip()
    return result


def load_skills_summary(skills_dir: Path | None = None) -> list[dict]:
    """Load name and description from all SKILL.md files.

    Returns a list of dicts with keys: name, description, path (relative to skills_dir).
    """
    if skills_dir is None:
        skills_dir = SKILLS_DIR
    summaries = []
    for skill_md in sorted(skills_dir.glob("*/SKILL.md")):
        content = skill_md.read_text(encoding="utf-8")
        fm = _parse_frontmatter(content)
        if fm and "name" in fm:
            summaries.append({
                "name": fm["name"],
                "description": fm.get("description", ""),
                "path": str(skill_md.relative_to(skills_dir.parent)),
            })
    return summaries


def load_full_skill(skill_name: str, skills_dir: Path | None = None) -> str | None:
    """Load the full SKILL.md content for a given skill name.

    Returns the complete markdown content (including frontmatter), or None if not found.
    """
    if skills_dir is None:
        skills_dir = SKILLS_DIR
    for skill_md in sorted(skills_dir.glob("*/SKILL.md")):
        content = skill_md.read_text(encoding="utf-8")
        fm = _parse_frontmatter(content)
        if fm and fm.get("name") == skill_name:
            return content
    return None


def _build_tools_section(tools: list[dict]) -> str:
    """Generate a concise tools section from a list of tool metadata dicts.

    Each dict should have: name, description.
    """
    lines = []
    for t in tools:
        name = t["name"]
        desc = t.get("description", "")
        # Truncate very long descriptions
        if len(desc) > 120:
            desc = desc[:117] + "..."
        lines.append(f"- **{name}**: {desc}")
    return "\n".join(lines)


def build_system_message(
    workspace: str,
    repos: list[str],
    output_dir: str,
    tools_summary: list[dict] | None = None,
) -> str:
    tools_section = _build_tools_section(tools_summary) if tools_summary else _FALLBACK_TOOLS
    return SYSTEM_TEMPLATE.format(
        workspace=workspace,
        repos=", ".join(repos) if repos else "(none)",
        output_dir=output_dir,
        tools_section=tools_section,
    )


def build_context(
    workspace: str,
    repos: list[str],
    output_dir: str | None = None,
) -> dict:
    if output_dir is None:
        output_dir = f"{workspace}/docs"
    return {
        "workspace": workspace,
        "repos": repos,
        "output_dir": output_dir,
    }
