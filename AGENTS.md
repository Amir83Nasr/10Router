# 10Router Rules

use PNPM insteat of NPM.

use PRETTIER for the project.

when PUSH to ORIGIN: first update project VERSION then update @CHANGELOG.md, then make sure CI passes fully green (FORMAT + TEST no-regression gate via `pnpm test`), then add new TAG VERSION, then push.

add RELEASE MESSAGE to TAGs.

UI must stay UNIFIED and CONSISTENT: preserve existing structure/layout/design language, reuse existing SHADCN components and patterns, no ad-hoc/custom UI — all new UI must be built with SHADCN.

use TYPESCRIPT instead of JAVASCRIPT and use TSX for components. No new JS files under `src/` — touched files migrate to TS. `open-sse/` stays JS (engine boundary); new code there follows existing JS conventions.

when MERGING from REMOTE into LOCAL: review every incoming change and convert it to the current local format before applying (e.g. rewrite incoming JS to TS/TSX, run PRETTIER, use SHADCN components).

LOCAL has PRIORITY: the project is heavily customized locally — never let a remote merge overwrite or break local personalization. On conflict, keep the LOCAL version.

<!-- BEGIN:nextjs-agent-rules -->

<!-- END:nextjs-agent-rules -->
