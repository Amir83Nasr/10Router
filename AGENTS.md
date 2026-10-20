# 10Router Rules

use PNPM insteat of NPM.

use PRETTIER for the project.

when PUSH to ORIGIN: first update project VERSION then update @CHANGELOG.md, then make sure CI passes fully green (FORMAT + TEST no-regression gate via `pnpm test`), then add new TAG VERSION, then push.

add RELEASE MESSAGE to TAGs.

UI must stay UNIFIED and CONSISTENT: preserve existing structure/layout/design language, reuse existing SHADCN components and patterns, no ad-hoc/custom UI — all new UI must be built with SHADCN.

use TYPESCRIPT instead of JAVASCRIPT and use TSX for components. No new JS files under `src/` — touched files migrate to TS. `open-sse/` stays JS (engine boundary); new code there follows existing JS conventions.

when MERGING from REMOTE into LOCAL: review every incoming change and convert it to the current local format before applying (e.g. rewrite incoming JS to TS/TSX, run PRETTIER, use SHADCN components).

LOCAL has PRIORITY: the project is heavily customized locally — never let a remote merge overwrite or break local personalization. On conflict, keep the LOCAL version.

انتشار نسخه جدید با تگ جدید از طریق گیت‌هاب اکشن صورت می‌گیره به صورت خودکار.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
