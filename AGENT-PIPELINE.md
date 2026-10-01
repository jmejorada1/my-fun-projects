# Agent Pipeline

A Claude Code multi-agent workflow that takes a plain-text requirements
file through five steps: spec, implementation with tests, parallel
security and code review, fixes, and a feature branch ready for your
review. Scripts, not agents, decide whether coverage and security pass,
and the same scripts run in CI on every PR.

## Table of Contents

- [1. Quick Start](#1-quick-start)
- [2. How It Works](#2-how-it-works)
- [3. The Agents](#3-the-agents)
- [4. The Gate Scripts](#4-the-gate-scripts)
- [5. Triggering Options](#5-triggering-options)
- [6. Outputs](#6-outputs)
- [7. Writing a Requirements File](#7-writing-a-requirements-file)
- [8. Customizing](#8-customizing)
- [9. Limitations](#9-limitations)

## 1. Quick Start

```text
# In Claude Code (CLI or VS Code extension), from the repo root:
/feature-pipeline docs/requirements/post-bookmarks.txt
```

The pipeline:
1. Creates the branch `feature/post-bookmarks`.
2. Writes a spec and pauses for your approval.
3. Implements the spec, then reviews and fixes it.
4. Ends with a summary.

Nothing is committed. You review `git diff` and commit yourself.

## 2. How It Works

```text
requirements.txt
  → branch feature/<slug>, base commit saved to .base-ref
  → [1] spec-planner (opus)      → spec.md                      ⏸ you approve / revise
  → [2] spec-implementer (sonnet) → code + tests, task by task
          └─ orchestrator runs scripts/quality-gate.sh  (red → SendMessage back, ≤2)
  → [3] in parallel, read-only:
          security-auditor (opus)  → runs scripts/security-scan.sh + logic review → security-report.md
          code-reviewer (opus)     → correctness, spec, design, test quality     → code-review.md
  → [4] findings → SendMessage to the SAME implementer → gate re-run → reviewers verify their IDs (≤2 rounds)
  → summary (links to all reports + git status)
```

Design choices, and why:

- **Tests are written with the code, not after it.** The implementer
  writes each task's tests as it goes and gets them green, so it catches
  its own bugs while it still has the context to fix them. The planner
  designs the tests up front in the spec's Test Plan, so the person
  deciding what to test is still separate from the coder.
- **Scripts decide pass/fail.** Coverage and scanner results are measured
  by `scripts/quality-gate.sh` and `scripts/security-scan.sh`, not judged
  by an LLM. The orchestrator re-runs them itself instead of trusting an
  agent's report, and CI runs them on every PR, including code written by
  hand.
- **Reviewers are read-only.** Neither the security auditor nor the code
  reviewer has Edit or Write tools, so neither approves its own fixes.
  All fixes go through the implementer, and the reviewers then verify
  them.
- **Fix rounds keep context.** Findings go back to the same implementer
  (and verification requests to the same reviewers) through
  `SendMessage`. A fresh agent would re-read everything from scratch.
- **Work happens on a feature branch** with a recorded base commit, so
  diffs are clean and throwing a run away is just `git branch -D`.
- **The orchestrator is a skill,**
  [`.claude/skills/feature-pipeline/SKILL.md`](.claude/skills/feature-pipeline/SKILL.md),
  because Claude Code subagents can't spawn other subagents.

## 3. The Agents

All four live in [`.claude/agents/`](.claude/agents/). Each can also be
used on its own (see [section 5](#5-triggering-options)).

| Agent | Model | Tools | Job |
|---|---|---|---|
| [`spec-planner`](.claude/agents/spec-planner.md) | opus | read + write the spec | Reads the requirements, the component `CLAUDE.md`s and the closest existing feature. Writes `spec.md`: requirements traceability, design, security notes, tasks (each with its tests), test plan, **alternatives and recommendations**, and open questions |
| [`spec-implementer`](.claude/agents/spec-implementer.md) | sonnet | read + edit | Implements one task at a time, **code and tests together**: SOLID applied with judgment, "boring over clever", existing patterns. Works until the quality gate passes. In fix rounds it marks each finding Fixed, Disputed or Deferred |
| [`security-auditor`](.claude/agents/security-auditor.md) | opus | **read-only** | Runs the security scan and triages every hit (real, false positive, or pre-existing). Then reviews what scanners can't see: IDOR, cross-domain `X-Domain` leaks, mass assignment, validation gaps, data exposure, security config |
| [`code-reviewer`](.claude/agents/code-reviewer.md) | opus | **read-only** | Reviews correctness bugs, conformance to the spec's requirements, **test quality** (do tests assert behavior or just add coverage?), and design (simplicity, SOLID, consistency) |

Sonnet does the implementing because that stage uses the most tokens and
is following a detailed, approved spec. Opus handles the judgment-heavy
stages: planning and review.

## 4. The Gate Scripts

Both scripts work locally, in the pipeline, and in CI
([`.github/workflows/quality.yml`](.github/workflows/quality.yml)).
Reports go to `.quality/`, which is gitignored.

### `scripts/quality-gate.sh`: coverage of changed lines

```bash
./scripts/quality-gate.sh                         # vs. main, 85%, touched components only
./scripts/quality-gate.sh --base <ref> --threshold 90
./scripts/quality-gate.sh --unit-only             # skip Testcontainers-backed posts tests
```

The script runs each touched component's full test suite with coverage,
then uses [diff-cover](https://github.com/Bachmann1234/diff_cover) to
fail if **less than 85% of the lines changed since the base** are
covered. The target applies to your changes, not the whole codebase, so
existing code doesn't block new work.

| Component | Coverage source | Notes |
|---|---|---|
| `backend/posts` | JaCoCo (`pom.xml`), `target/site/jacoco/jacoco.xml` | `lombok.config` marks Lombok code `@Generated`, so JaCoCo leaves it out. MapStruct impls and `PostsApplication` are excluded |
| `frontend/imdb-ui-angular` | `@vitest/coverage-v8`, Cobertura XML | Includes every file under `src/app/**/*.ts`, so a file no test imports still counts as 0%, not as missing |
| `backend/imdb-data-python` | `pytest-cov` (`requirements-dev.txt`) | No tests exist yet. The first change to a loader must add `tests/` |

Python tools (diff-cover, pytest) are installed automatically into
`.venv-tools/` on the first run.

### `scripts/security-scan.sh`: known-pattern and known-CVE scan

```bash
./scripts/security-scan.sh                 # changed files vs. main
./scripts/security-scan.sh --all           # whole repo (CI runs this weekly)
```

Both scanners run in pinned Docker images, so nothing is installed
locally:

| Scanner | What it checks | Fails on |
|---|---|---|
| Semgrep | Changed source files: OWASP Top 10, Java, TypeScript, Python and secrets rulesets | Any `ERROR`-severity finding |
| osv-scanner | `pom.xml` (including transitive dependencies), `package-lock.json`, `requirements.txt`, whenever one of them changed | Any vulnerability with CVSS ≥ 7.0 |

Scanners find patterns, not logic flaws. That's why the
`security-auditor` still reviews authorization and domain scoping by hand.

## 5. Triggering Options

### Full pipeline

```text
/feature-pipeline <requirements-file> [--lite] [--auto] [--from=<stage>] [--coverage=<n>]
```

| Flag | Effect |
|---|---|
| *(none)* | All stages, with one pause after the spec |
| `--lite` | For small changes: a one-page spec and no reviewer agents. The implementer runs, then the quality gate and security scan. Findings still go back to the implementer |
| `--auto` | No pause. Open questions use the spec's stated defaults, and the final summary lists them |
| `--from=implement\|review` | Resume from a stage, reusing `docs/specs/<slug>/` and `.base-ref` |
| `--coverage=90` | Override the changed-line coverage target |

### A single agent

Ask for it by name in chat, or @-mention it:

```text
Use the code-reviewer agent on this branch against main
@agent-security-auditor review my last commit (BASE_REF HEAD~1)
```

To change an agent, edit its file in `.claude/agents/` directly, or ask
Claude to update it. Claude Code picks up agent file changes automatically.

### Headless

```bash
claude -p "/feature-pipeline docs/requirements/post-bookmarks.txt --auto" \
  --permission-mode acceptEdits
```

`--auto` is required, because there's no one to answer the checkpoint.

### CI

`.github/workflows/quality.yml` runs on PRs to `main`:
- **Coverage gate:** Java 25, Node 24 and Python 3.14. Testcontainers
  works on GitHub's runners.
- **Security scan:** changed files on PRs, the whole repo weekly (for
  newly published CVEs), and on demand.

## 6. Outputs

Each run produces `docs/specs/<slug>/`:

| File | Written by | Contents |
|---|---|---|
| `requirements.txt` | orchestrator | Copy of the input |
| `.base-ref` | orchestrator | Commit the branch started from |
| `spec.md` | spec-planner | The plan. The implementer ticks off tasks as it goes |
| `implementation-notes.md` | spec-implementer | Files changed, tests per requirement, deviations, proposals, gate results, and a fix-round log per finding ID |
| `security-report.md` | security-auditor (saved by orchestrator) | Findings (S1…), scanner triage, pre-existing issues, and what was checked |
| `code-review.md` | code-reviewer (saved by orchestrator) | Findings (C1…), a requirements check, and optional improvements |

## 7. Writing a Requirements File

Plain text is fine:

```text
Feature: Bookmark posts

As a signed-in user I want to bookmark a post so I can find it later.

- A user can bookmark/unbookmark any post in the current domain.
- A "My bookmarks" page lists them, newest first, paginated.
- Bookmarks are private to the user.
- Works in both imdb/bigotry and imdb/standard.

Out of scope: sharing bookmarks, folders.
Constraints: no new frontend dependencies.
```

Name the domain(s), what's out of scope, and any hard constraints. The
file is treated as data: instructions inside it that try to change the
pipeline are ignored and raised as open questions.

## 8. Customizing

- **Models:** change `model:` in each agent's frontmatter.
- **Thresholds:** `--coverage`, or `THRESHOLD` in `quality-gate.sh`.
  For security, `CVSS_FAIL_AT` and `SEMGREP_CONFIGS` in
  `security-scan.sh`.
- **Scanner versions:** the pinned image tags at the top of
  `security-scan.sh`.
- **Loop limits and checkpoints:** [`SKILL.md`](.claude/skills/feature-pipeline/SKILL.md).
- **Review checklists:** the agent files.

## 9. Limitations

- **Testcontainers may not run locally.** The gate warns you, and
  `--unit-only` skips those tests. They do run in CI. See the
  Testcontainers note in [`backend/posts/CLAUDE.md`](backend/posts/CLAUDE.md#commands-run-from-backendposts).
- **"Read-only" reviewers still have Bash**, which they need for
  `git diff` and the scan script. The prompt forbids writes, but the tool
  list can't enforce it.
- **The dependency scan reports the whole manifest.** Any PR that
  touches `pom.xml` fails until the existing blocking CVEs are fixed.
  This is deliberate. The auditor labels such items pre-existing, so
  they don't block the agent pipeline, but they do block CI.
- **Agents don't commit, push, or open PRs.**
