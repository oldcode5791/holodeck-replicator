# Coding Standards — the-lal.net projects

Shared standards for every project under `~/projects`. Copies of this file live in each project root. If a project has its own `AGENTS.md`, `CLAUDE.md`, `PROJECT_SPEC.md` or `README.md` that conflicts with this file, the project file wins.

---

## 1. Stack and tooling

- **Frontend:** React 19 + TypeScript + Vite. Tailwind CSS v4 via `@import "tailwindcss";` in `src/index.css` and the `@tailwindcss/vite` plugin.
- **Hosting:** Cloudflare Workers with static assets (`wrangler.jsonc`, `assets.directory: "./dist"`, `not_found_handling: "single-page-application"`). Custom domains are attached in the Cloudflare dashboard, not in the repo.
- **Lint:** `oxlint`. Keep it at 0 warnings and 0 errors.
- **Standard npm scripts** (use these names so every project behaves the same):

  ```bash
  npm run dev       # Vite dev server
  npm run build     # tsc -b && vite build
  npm run lint      # oxlint
  npm run deploy    # npm run build && wrangler deploy
  ```

  Add `typecheck` and `test` scripts when a project has them.
- **Release gate:** `npm run lint && npm run build` must pass before a change is considered done.
- **TypeScript:** `strict` mode on. Use `import type` for type-only imports.

## 2. Design and brand

- **Palette:** dark slate base (`bg-slate-950`, `bg-slate-900/70`, `border-slate-800`) with a cyan accent (`cyan-400` / `cyan-500`). Emerald is for "safe / zero tracking" badges, amber for warnings, rose for errors.
- **Mobile-first.** No horizontal overflow at 390px wide. Check 320px and 375px as well.
- **Tooltips:** every input, control and action that a non-expert might not understand gets a plain-English `InfoTooltip` (the "?" badge). Use the shared `InfoTooltip` component, not a copy.
- **Avoid duplicate tooltips.** Do not also set a `title` attribute on a control that already has an `InfoTooltip`. Use `title` only on controls with no visible tooltip (for example tab buttons or export buttons).
- **Zero tracking.** No analytics, pixels or third-party scripts unless the project spec explicitly allows them. Say so in the UI when processing happens locally.
- **Brand links:** the "← App Showcase" link goes to `https://apps.the-lal.net`.

## 3. Accessibility (WCAG 2.2 AA is the target)

- **Labels:** every form control has an accessible name. Link `<label htmlFor>` to the input, using `useId()` for generated IDs. Do not use a `<label>` that wraps no control. Use a `<span>` instead.
- **Descriptions:** link help text with `aria-describedby`. Do not leave it only in `title`.
- **Groups:** a set of related buttons (for example layout choices) gets `role="group"` and `aria-labelledby`.
- **Toggles:** a button that switches a mode on or off gets `aria-pressed`.
- **Tabs:** use `role="tablist"`, `role="tab"` (with `aria-selected`, `aria-controls`, and roving `tabIndex`) and `role="tabpanel"`. Support Left/Right/Home/End keys.
- **Status messages:** toasts and save confirmations go in an always-mounted `role="status"` / `aria-live="polite"` container. The container exists before its text changes.
- **File inputs:** visually hidden with `sr-only`, not `hidden`, so they stay keyboard reachable. Show a `focus-within` ring on the wrapping label.
- **Focus:** keep a visible focus indicator. Do not remove outlines without a replacement. The global `:focus-visible` rule in `index.css` is the baseline.
- **Contrast:** body text is at least `slate-400` on dark backgrounds. Do not use `slate-500` for small text or interactive elements.
- **Tooltips** dismiss with Escape and stay inside the viewport.

## 4. Components and structure

- Put reusable pieces in `src/components/`, and put hooks in `src/hooks/`. Keep the top-level `App.tsx` as a thin shell where possible.
- Components that repeat (text fields, color pickers) should be data-driven from config arrays rather than copy-pasted blocks.
- Use one export style per module. Prefer named exports for components, and keep a single default export only where the entry point requires it.
- Keep shared constants (such as limits and brand URLs) in one place rather than repeating them.

## 5. Privacy and security

- **Never commit secrets.** `.env*`, `.dev.vars` and any `*.secrets/` directory must be in `.gitignore`.
- **Never log personal data** (emails, phone numbers, uploaded images) to the console or to a server.
- **Untrusted text** (anything a user types that is displayed or stored) is escaped or sanitized before it reaches HTML or storage. Use the project's sanitizer where one exists.
- **Validate URLs** before emitting them into HTML. Allow `https://` (and `data:image/` for images only). Reject `javascript:` and relative paths that could resolve oddly.
- **Client-side first.** If a feature can run in the browser, keep it there, and say so in the UI.

## 6. Code comments

- Comment *why*, not *what*. Do not restate the next line.
- Give each exported function, component or non-obvious rule a short JSDoc or block comment. Explain security rules and edge cases in particular.
- Keep copyright headers and `LICENSE` text intact.
- Leave no commented-out code and no stale TODOs without a backlog reference.

## 7. Persistence

- Browser storage keys are namespaced and versioned, for example `the_lal_<app>_<thing>_v1`. Do not rename a key once users have data under it.
- Parse stored data defensively: check its shape and discard bad entries rather than trusting `JSON.parse`.
- Wrap `localStorage` writes in `try/catch` and tell the user when a save fails.

## 8. Workflow

- **Read the project docs first** (`AGENTS.md`, `CLAUDE.md`, `PROJECT_SPEC.md`, `README.md`, whichever exist).
- **Small, focused changes.** One concern per commit.
- **Do not push, deploy or change infrastructure** unless the user asks. Local commits are fine when asked to commit.
- **Commit messages.** Start every commit with the version it belongs to: `vX.Y.Z: <summary>`. Use `docs:` / `chore:` only for changes that don't need a version bump (see Versioning).

## 8a. Versioning (all projects)

- **Scheme.** Every project uses SemVer `MAJOR.MINOR.PATCH`, stored in `package.json`.
- **One change, one version.** Each change gets its own bump, and its commit is `vX.Y.Z: <summary>`. Don't batch several changes under one version.
- **Which part to bump:**
  - **PATCH** for fixes, copy and style tweaks.
  - **MINOR** for new features or user-visible behaviour.
  - **MAJOR** for breaking changes, such as renamed storage keys, changed URLs, or changed data formats.
- **How to bump.** `npm version X.Y.Z --no-git-tag-version`. This updates `package.json` and the lockfile together.
- **New projects** start at `0.1.0`.
- **Tags.** Annotate a git tag for each deployed release: `git tag -a vX.Y.Z -m "vX.Y.Z: <summary>"`. Tags are the rollback points.
- **Show the version in the UI.** Display it in the footer, read from `package.json` through Vite's `define` as `__APP_VERSION__`. Don't hard-code version numbers in the UI.
- **Record it.** If the project has a changelog or spec (for example `PROJECT_SPEC.md`), add an entry for each version.

Projects that don't follow this yet should be brought into line before their next change.
- **Verify.** Run the release gate before reporting work as done. For UI changes, also check the page in a browser at mobile and desktop widths.
- **Keep the docs current.** When a standard changes, update this file and recopy it to each project.

## 9. Known gaps (track in each project's backlog)

- Some projects have large single-file components. Split them when they pass about 400 lines.
- Not every project has tests yet. Add a test runner when a project's logic grows beyond simple UI.
