# Pinned Awesome Copilot reference index

Repository: [github/awesome-copilot](https://github.com/github/awesome-copilot)

Reference revision: `613efc8c21d9b3ce642dff361d17006cd9967e28`

Source inspection date: 2026-10-21. Relevant entries/sections were inspected;
this is not a complete audit of the repository or certification of every claim.
The [upstream license](https://github.com/github/awesome-copilot/blob/613efc8c21d9b3ce642dff361d17006cd9967e28/LICENSE)
is MIT. No upstream customization or executable has been copied into VarAI.

Recheck the current project before choosing an entry:
[SDK pin](../../../global.json),
[server project](../../../server/VarAI.Server.csproj),
[server test project](../../../tests/VarAI.Server.Tests/VarAI.Server.Tests.csproj),
[root tooling](../../../package.json) and
[client tooling](../../../client/package.json).
These files are evolving during G00; the index does not pin dependencies or
authorise changes to them.

## Selection map

Choose one relevant row initially, at most two unless a concrete question needs
more. These are references, not a bundle that every agent must load.

| Task | Pinned reference | Use and limits |
| --- | --- | --- |
| C#/ASP.NET Core implementation | [C# instructions](https://github.com/github/awesome-copilot/blob/613efc8c21d9b3ce642dff361d17006cd9967e28/instructions/csharp.instructions.md) | Consult relevant language, formatting or error-handling sections. Keep local SDK/editor settings; do not adopt its database, authentication, telemetry or comment-per-function suggestions automatically. |
| Async provider work, cancellation and failures | [C# async skill](https://github.com/github/awesome-copilot/blob/613efc8c21d9b3ce642dff361d17006cd9967e28/skills/csharp-async/SKILL.md) | Inspect the relevant async pattern. Verify API/context-specific advice; do not apply blanket catch blocks, exception wrappers or ConfigureAwait changes. |
| Server tests when MSTest is declared | [MSTest skill](https://github.com/github/awesome-copilot/blob/613efc8c21d9b3ce642dff361d17006cd9967e28/skills/csharp-mstest/SKILL.md) | Guidance covers MSTest 3.x/4.x. Check the project's actual package version and existing test style; do not replace its runner or SDK to match an example. |
| A concrete React 19 API migration/ref issue | [React 19 source-pattern skill](https://github.com/github/awesome-copilot/blob/613efc8c21d9b3ce642dff361d17006cd9967e28/skills/react19-source-patterns/SKILL.md) | Migration reference only. Read a linked sub-reference only when needed; do not launch a migration or rewrite unrelated components in a new-feature story. |
| Replay controls, evidence navigation and UI QA | [Accessibility instructions](https://github.com/github/awesome-copilot/blob/613efc8c21d9b3ce642dff361d17006cd9967e28/instructions/a11y.instructions.md) | Start with semantic controls, keyboard access, focus and status feedback. Apply the story's checks; do not infer full accessibility or legal compliance from this document. |
| Independent code/requirement review | [Generic review instructions](https://github.com/github/awesome-copilot/blob/613efc8c21d9b3ce642dff361d17006cd9967e28/instructions/code-review-generic.instructions.md) | Use evidence-based prioritisation and actionable findings. Keep local severity/output rules and read-only boundaries; generic style/size preferences are not new acceptance criteria. |
| Client testing, only when Vitest is selected | [Node/Vitest instructions](https://github.com/github/awesome-copilot/blob/613efc8c21d9b3ce642dff361d17006cd9967e28/instructions/nodejs-javascript-vitest.instructions.md) | Inspect relevant test guidance, not its whole coding policy. Do not replace required `null` values with `undefined`, switch TypeScript to JavaScript or add Vitest solely to use this reference. |
| Browser tests, only when Playwright is selected | [Playwright TypeScript instructions](https://github.com/github/awesome-copilot/blob/613efc8c21d9b3ce642dff361d17006cd9967e28/instructions/playwright-typescript.instructions.md) | Consider role-based locators and stable assertions. Preserve approved test locations and commands; do not run its example website or install tooling automatically. |

## Tool and MCP references

The pinned [MCP example](https://github.com/github/awesome-copilot/blob/613efc8c21d9b3ce642dff361d17006cd9967e28/mcp.json)
describes a `github-agentic-workflows` server. It is upstream configuration,
not VarAI's tool inventory or permission to run its command.

When a story needs a tool:

1. Check the tools actually available to the assigned agent and discover a
   deferred tool before calling it.
2. Prefer an available tool or existing repository command over a new install.
3. If a new capability is necessary, report the exact source/version, purpose,
   requested permissions, data it would access or send, cost implications and
   approval needed. Verify these against its primary documentation.
4. Do not install upstream MCP servers, plugins, hooks or workflows as part of
   browsing this catalog. Do not use external search to transmit private source.

## Explicit exclusions

- Do not bulk-import upstream instructions with broad `applyTo` patterns.
- The [container/presentation component generator](https://github.com/github/awesome-copilot/blob/613efc8c21d9b3ce642dff361d17006cd9967e28/skills/react-container-presentation-component/SKILL.md)
  prescribes its own directory structure and Storybook/SCSS files. It is not a
  default VarAI scaffolder; use it only if that approach is separately approved.
- Generic guides do not authorise persistence, authentication, model changes,
  deployments, new paid services or changes to the local-board gates.
- Upstream suggestions may be outdated, opinionated or wrong for this context.
  Verify consequential details instead of treating GitHub hosting as endorsement.

## Updating this index

Keep URLs pinned to a full commit. Refresh only for a concrete gap or version
change, inspect affected entries and update the revision/date and exceptions
together. Use [verify-claims](../verify-claims/SKILL.md) for technical claims.
Do not convert pinning into a claim that those sources are automatically current.
