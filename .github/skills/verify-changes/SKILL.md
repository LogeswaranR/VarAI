---
name: verify-changes
description: "Validate repository changes with observable checks and honest completion reporting. Use when checking a fix, implementation, configuration, documentation, tests, types, builds, or completion claims before handing work back to the user."
---

# Verify changes

## Workflow

1. Define observable success criteria from the request, including relevant error cases and behavior that must remain unchanged.
2. Identify the intended checkout and existing changes. Preserve work outside the task and determine which artifacts and execution paths the change affects.
3. Select checks from the repository's manifests, documentation, and existing tooling:
   - Code changes: relevant tests, type checks, builds, or runtime checks.
   - Configuration changes: syntax, required fields, references, and the consuming tool where available.
   - Documentation changes: applicable links, examples, and existing documentation checks.
   - If no suitable tooling exists, state the gap. Do not invent commands or introduce a new toolchain merely to produce a green result.
4. Run the smallest checks that actually cover the criteria. Add or update focused tests when changing behavior and when the repository's setup permits it.
5. Inspect failures and address task-related causes. Keep failures visible; do not suppress exit codes, replace a failed test with a mock success, or quietly skip a required check.
6. Confirm that the requested artifacts are saved and that completion claims match the evidence. File presence alone does not prove runtime integration or agent discovery.
7. Report what changed, which checks ran, their outcomes, and any remaining gaps.

## Match claims to evidence

| Claim | Evidence needed |
| --- | --- |
| Files were created or updated | The intended artifacts exist in the intended checkout. |
| Tests passed | The actual test command ran successfully for the stated scope. |
| Behavior works | A relevant test or runtime observation exercises that behavior. |
| Copilot loaded instructions or a skill | The relevant tool's references, diagnostics, or invocation evidence, not just valid file syntax. |
| A service is accessible | A successful authorized operation from the intended execution environment. |

## Completion report

- **Changes:** what was implemented and where.
- **Validation:** the checks actually run, their scope, and whether they passed or failed.
- **Not verified:** skipped or blocked checks, reasons, and consequences.

Do not turn a narrow successful check into a claim that the whole application is correct, secure, production-ready, or free of hallucinations.
