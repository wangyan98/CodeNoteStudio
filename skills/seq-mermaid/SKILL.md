---
name: seq-mermaid
description: Create and edit .seq.mermaid sequence diagram files — a notebook-specific format for Mermaid.js sequence diagrams showing participant interactions and message flows. Use when: (1) Creating new sequence diagrams, (2) Adding participants, (3) Appending messages between participants, (4) Replacing entire diagram content. Triggers on .seq.mermaid file operations.
---

# Sequence Diagram Skill

Operates on `.seq.mermaid` files — plain text Mermaid sequence diagrams.

## Purpose

`.seq.mermaid` is a notebook-specific format for **sequence diagrams** using Mermaid.js syntax. It captures message flows between participants — function calls, API requests, event chains, or any ordered interaction. The plain-text format makes it easy to generate and version-control.

Typical use cases:
- Documenting API request/response flows across services
- Tracing function call chains through a codebase
- Visualizing event-driven message passing between components

## Diagram Structure

```
sequenceDiagram
    participant A as ServiceA
    participant B as Database
    A->>B: query()
    B-->>A: result
```

Participants are declared with `participant NAME [as ALIAS]`. Messages use arrow syntax: `->>` (solid), `-->>` (dashed), `->>` (open), `--x` (dashed with X).

### Code References in Messages

Append `#@ref(repo#file#line#name)` to any message to create a clickable link that navigates to the corresponding code:

```
sequenceDiagram
    participant Client
    participant AuthServer
    Client->>AuthServer: POST /login#@ref(backend#src/auth/handler.go#42#HandleLogin)
    AuthServer-->>Client: token response#@ref(backend#src/auth/handler.go#58#IssueToken)
```

The `#` separates segments — `#` is used instead of `:` to avoid conflicts with `:` in file paths. When rendered, the `@ref(...)` text becomes a clickable blue link that jumps to the code location.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/create_seq.py <path> [--title]` | Create .seq.mermaid with default template |
| `scripts/append_participant.py <path> <name> [--alias]` | Add a participant declaration |
| `scripts/append_message.py <path> <from> <to> <msg> [--type]` | Append a message arrow |
| `scripts/replace_diagram.py <path> <new-content>` | Replace entire diagram content |

### create_seq.py

```bash
python scripts/create_seq.py /path/to/diagram.seq.mermaid --title "Auth Flow"
# => {"ok": true}
```

Creates a `.seq.mermaid` file with `sequenceDiagram` header and a default placeholder participant. Idempotent: does nothing if file already exists.

### append_participant.py

```bash
python scripts/append_participant.py diagram.seq.mermaid Client --alias "Mobile App"
# => {"ok": true}
```

Adds `participant Client as Mobile App` line. Rejects if a participant with the same name already exists.

### append_message.py

```bash
python scripts/append_message.py diagram.seq.mermaid Client Server "POST /login" --type solid
python scripts/append_message.py diagram.seq.mermaid Server Client "response" --type dashed
# => {"ok": true}
```

Appends `Client->>Server: POST /login`. Arrow types: `solid` (->>), `dashed` (-->>), `x` (--x), `async` (-)).

### replace_diagram.py

```bash
python scripts/replace_diagram.py diagram.seq.mermaid "sequenceDiagram
    participant A as Alice
    A->>B: Hello"
# => {"ok": true}
```

Replaces the entire file content. Use for bulk rewrites or regeneration.
