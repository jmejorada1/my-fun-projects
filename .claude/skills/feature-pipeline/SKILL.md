---
name: feature-pipeline
description: Run the requirements → spec → implement+tests → review → fix pipeline for a requirements text file, using the spec-planner, spec-implementer, security-auditor and code-reviewer subagents plus the scripted quality and security gates. Only run when the user invokes /feature-pipeline.
argument-hint: <requirements-file> [--lite] [--auto] [--from=implement|review] [--coverage=85]
disable-model-invocation: true
---

# Feature pipeline orchestrator

You (the main session) are the orchestrator. Subagents can't spawn other
subagents, so **you** launch each agent with the Agent tool and pass state
through files in `SPEC_DIR`. Run agents in the foreground
(`run_in_background: false`) unless a step says to run them in parallel.
Full docs: `AGENT-PIPELINE.md`.

Arguments: `$ARGUMENTS`

**Never commit, push, or open a PR.** The user reviews everything first.

## 0. Setup

1. Parse the arguments:
   - First positional = `REQUIREMENTS_FILE` (required). If it's missing or
     doesn't exist, stop and show the usage line above.
   - `--lite`: small change. The spec is short and there are no reviewer
     agents; the scripted gates still run.
   - `--auto`: skip the approval checkpoint after the spec.
   - `--from=implement|review`: resume. `SPEC_DIR` must already contain
     the earlier stages' outputs.
   - `--coverage=<n>`: threshold for the coverage gate, default `85`.
2. `SLUG` = requirements file name without extension, in kebab-case.
   `SPEC_DIR` = `docs/specs/<SLUG>/`. Create it, and copy the requirements
   file into it as `requirements.txt`.
3. **Branch:** if you're not already on `feature/<SLUG>`:
   - If tracked files have uncommitted changes, ask the user (with
     AskUserQuestion) whether to carry them onto the feature branch or
     stop so they can commit or stash them. Never stash or commit
     yourself.
   - `git switch -c feature/<SLUG>`, or `git switch feature/<SLUG>` if it
     already exists (a resume).
4. `BASE_REF`: read `SPEC_DIR/.base-ref` if it exists. Otherwise write the
   current `git rev-parse HEAD` into it.
5. Tell the user in one line: the slug, the branch, the stages you'll
   run, and the coverage target.

## 1. Spec (`spec-planner`)

Launch `spec-planner` with `REQUIREMENTS_FILE` and `SPEC_DIR`, and add
`LITE` if `--lite` was given. Then read `SPEC_DIR/spec.md` yourself.

**Checkpoint (skipped only with `--auto`):** show the summary, the task
count, the recommendations, and the open questions. Ask BLOCKING
questions with AskUserQuestion, then ask whether to proceed, revise, or
stop. On "revise", re-run `spec-planner` with the user's feedback. With
`--auto`, use the spec's stated defaults and list them in the final
summary. Set the spec's `Status:` to `Approved`.

## 2. Implement + tests (`spec-implementer`)

Launch `spec-implementer` with `SPEC_DIR`, `BASE_REF`, and the coverage
threshold. **Record the agent ID it returns**, because fix rounds go back
to this same agent.

When it reports done, **run the gates yourself** instead of trusting the
report:

```bash
./scripts/quality-gate.sh --base <BASE_REF> --threshold <n>
```

If the Testcontainers tests fail only for environmental reasons (see
`backend/posts/CLAUDE.md`), re-run with `--unit-only` and note that in
the summary. If the gate is red, send the failing output to the
implementer with **SendMessage** (load it via ToolSearch if it isn't
loaded) and re-run the gate afterwards. Do at most 2 rounds, then stop
and escalate to the user.

## 3. Review

**Full mode:** in one message, launch `security-auditor` and
`code-reviewer` **in parallel** (both in the foreground), each with
`SPEC_DIR` and `BASE_REF`. Record both agent IDs. Save each final reply
verbatim to `SPEC_DIR/security-report.md` and `SPEC_DIR/code-review.md`.

**Lite mode:** run `./scripts/security-scan.sh --base <BASE_REF>`
yourself. Treat any failing result that was introduced by this change as
a finding. Dependency CVEs that existed before `BASE_REF` are
pre-existing and don't block.

## 4. Fix loop (at most 2 rounds)

Blocking findings are:
- Security Critical, High, or Medium introduced by this change.
- Code-review High or Medium.
- In lite mode, failing scan results introduced by this change.

If any exist:
1. SendMessage them to the **same implementer**, with the report paths
   and the IDs to address. Send Low findings too, marked optional.
2. When it replies, re-run `quality-gate.sh` yourself.
3. SendMessage each reviewer with `VERIFY: <its finding IDs>`, in
   parallel. In lite mode, re-run `security-scan.sh` instead. Append the
   verification results to the report files.

After 2 rounds with blocking findings still open, stop and escalate:
list each open finding and what was tried. Pre-existing issues never
block; they go in the summary.

If the session restarted and the agent IDs are gone (e.g. a `--from`
resume), launch a fresh agent and tell it to read
`implementation-notes.md` and the reports first.

## 5. Final summary (you write this; no agent)

- A result line per stage: spec, implement (gate result per component
  vs. target), review (findings by severity: found / fixed / deferred /
  disputed), and fix rounds used.
- Links to `spec.md`, `implementation-notes.md`, `security-report.md`,
  `code-review.md`, and the `.quality/` reports.
- Assumptions made under `--auto`, deviations, deferred and disputed
  findings, pre-existing issues found, and proposals awaiting a decision.
- `git status --short`, plus a reminder that nothing is committed and the
  work is on branch `feature/<SLUG>`.

## Rules for you as orchestrator

- Pass agents **paths and short instructions**, not file contents.
- Never do an agent's work yourself when a stage fails. Send a precise fix
  request, or escalate. Running the gate scripts and saving reports is
  your job.
