# Feedback Kit

Portable, provider-neutral feedback capture for web products.

Feedback Kit gives an integrating app one drop-in React widget that can capture:

- the current screen;
- up to eight selected DOM elements;
- app-owned state and metadata;
- uploaded or pasted images; and
- an optional conversational issue brief.

The browser sends a versioned `FeedbackReport` to a server route. The server
can run an optional scoping agent and/or create a Linear issue. Credentials
never belong in the browser.

## Agent quickstart

When asked to add Feedback Kit to another product, do this in order:

1. Read [`AGENTS.md`](./AGENTS.md).
2. Inspect the target app's package manager, React entry point, server route
   convention, authentication, and runtime.
3. Use only the packages required by the target:

   | Need | Package | Browser or server |
   | --- | --- | --- |
   | report types, validation, redaction | `@feedback-kit/core` | either |
   | floating React widget and capture | `@feedback-kit/react` | browser |
   | browser client for the scoping route | `@feedback-kit/agent/browser` | browser |
   | OpenAI scoper and scoping route | `@feedback-kit/agent/server` | server |
   | Linear issue creation and ingest route | `@feedback-kit/linear` | server |

4. Mount `FeedbackWidget` only in the intended environments, usually
   development and staging.
5. Add the submission route. Add the scoping route only when the product needs
   agent follow-up questions.
6. Pass a small, useful `getState` result. Never pass tokens, credentials,
   secrets, cookies, private notes, or entire stores.
7. Run the target app's checks plus the repository checks below.

Do not invent a new report shape, put Linear/OpenAI credentials in client code,
or rewrite the widget into product-specific code unless the target framework
cannot consume the existing contracts.

## Repository layout

```text
packages/core    Shared report types, validation, and recursive redaction.
packages/react   React widget, screenshot capture, DOM element picker, CSS.
packages/agent   Provider-neutral scoper contract, browser client, server route,
                 and optional OpenAI Structured Outputs adapter.
packages/linear  Server ingest route, Linear sink, screenshot upload, issue body.
apps/demo        Working local demo with a mock submitter and mock scoper.
docs             Visual integration map.
```

The source files in `packages/*/src` are the source of truth. `dist/` is build
output and is intentionally ignored by git.

## Local verification

Requirements: Node.js with `pnpm` 10.28.2 or a compatible pnpm 10 release.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

The demo runs at `http://127.0.0.1:4173`.

## Hosted demo deployment

The repository now includes a two-target deployment path:

- `vercel.json` builds the interactive Vite demo in `apps/demo`.
- `railway.toml` builds and starts the deployment API in `apps/api`.
- [`docs/deployment.html`](./docs/deployment.html) is the visual deployment map
  and environment checklist.

Deploy Railway first, set `VITE_FEEDBACK_API_URL` in Vercel to the Railway
public URL, and set Railway's `ALLOWED_ORIGINS` to the Vercel origin. The API
runs with deterministic demo adapters by default. Add `OPENAI_API_KEY` for live
agent scoping and both `LINEAR_API_KEY` and `LINEAR_TEAM_ID` for real issue
creation. `GET /health` reports which optional integrations are active.

## Minimal React integration

Install `@feedback-kit/core` and `@feedback-kit/react` in the consuming app.
If the app is using this repository as a workspace, use the workspace package
versions already declared here. If the packages have been published, install
the matching published versions instead.

```tsx
import { FeedbackWidget } from "@feedback-kit/react";
import "@feedback-kit/react/styles.css";

export function AppShell() {
  return (
    <>
      <ProductRoutes />
      {import.meta.env.DEV ? (
        <FeedbackWidget
          project={{
            id: "my-product",
            name: "My Product",
            version: APP_VERSION,
            environment: "development",
          }}
          endpoint="/api/feedback"
          getState={() => ({
            route: window.location.pathname,
            selectedWorkspaceId: workspaceStore.getState().selectedWorkspaceId,
            activeRecordId: recordStore.getState().activeRecordId,
          })}
          reporter={currentUser ? { id: currentUser.id } : undefined}
        />
      ) : null}
    </>
  );
}
```

Important integration rules:

- `project.id` should be stable across releases; `project.version` and
  `project.environment` are optional but strongly recommended.
- `getState` is app-owned and may be synchronous or async. Return only state
  needed to reproduce the report.
- `metadata` is also app-owned. Treat it as report data and keep it
  non-sensitive.
- `defaultScreenshot` defaults to `true`.
- Set `enabled={false}` or omit the widget entirely when capture is not allowed.
- Use `submitFeedback` only when the host app already has its own submitter.
  Otherwise the widget POSTs to `endpoint`.
- Use `scopeFeedback` only when the scoping route is installed. If it is
  omitted, the report is submitted directly.

### Optional browser scoping client

```tsx
import { createRemoteFeedbackScoper } from "@feedback-kit/agent/browser";

const scopeFeedback = createRemoteFeedbackScoper({
  endpoint: "/api/feedback/scope",
});

<FeedbackWidget
  project={project}
  scopeFeedback={scopeFeedback}
  // ...the other props from the example above
/>
```

The browser client sends `{ report, messages }` and expects
`{ result: { message, complete, scope? } }`.

## Server routes

The handlers use the Web `Request`/`Response` contract. They work directly in
Next.js App Router route files and can be wrapped by Hono, Cloudflare, Vite, or
Express adapters.

### Submission route with Linear

Install `@feedback-kit/linear` in the server package. Keep all values below in
server-only environment variables.

```ts
// app/api/feedback/route.ts
import { createLinearFeedbackHandler } from "@feedback-kit/linear";

export const runtime = "nodejs";

export const POST = createLinearFeedbackHandler(
  {
    apiKey: process.env.LINEAR_API_KEY,
    teamId: process.env.LINEAR_TEAM_ID!,
    // labelIds: ["linear-label-uuid"],
    // stateId: "linear-state-uuid",
    // assigneeId: "linear-user-uuid",
  },
  {
    // Prefer the product's normal authenticated session for same-origin apps.
    // Use `secret` only when the caller can keep it server-side.
    secret: process.env.FEEDBACK_INGEST_SECRET,
    allowedOrigins: ["https://app.example.com"],
    redactKeys: ["privateNotes", "internalOnly"],
    onError: (error) => console.error("Feedback submission failed", error),
  },
);
```

The route accepts a `FeedbackReport` and returns:

```json
{
  "result": {
    "id": "linear-issue-uuid",
    "identifier": "ENG-123",
    "url": "https://linear.app/...",
    "title": "[My Product] Save button is disabled"
  }
}
```

The default body limit is 24 MiB. The handler validates the schema and performs
a second server-side redaction pass on `report.state` before it reaches the
sink.

### Optional scoping route with OpenAI

Install `@feedback-kit/agent` in the server package. Use a Node-compatible
runtime for the OpenAI/Linear examples in this repository.

```ts
// app/api/feedback/scope/route.ts
import {
  createOpenAIFeedbackScoper,
  createScopingHandler,
} from "@feedback-kit/agent/server";

export const runtime = "nodejs";

const scoper = createOpenAIFeedbackScoper({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_FEEDBACK_MODEL ?? "gpt-5.6",
  maxUserReplies: 3,
});

export const POST = createScopingHandler({
  scoper,
  secret: process.env.FEEDBACK_SCOPING_SECRET,
  allowedOrigins: ["https://app.example.com"],
  onError: (error) => console.error("Feedback scoping failed", error),
});
```

The scoper is replaceable. Implement the provider-neutral `FeedbackScoper`
function instead of using OpenAI if the product has another model provider or
an internal issue-scoping service.

### Same-origin authentication warning

Do not put a secret in `requestHeaders` for a public browser bundle. Anything
sent by the browser is visible to the user. For a public product, protect the
routes with the product's normal authenticated session, CSRF/origin checks, and
rate limiting. `secret` is appropriate only for a caller that can keep the
secret server-side.

## Contracts an agent must preserve

The stable boundaries are in `packages/core/src/index.ts`:

```ts
type FeedbackSubmitter = (
  report: FeedbackReport,
) => Promise<FeedbackSubmissionResult>;

type FeedbackScoper = (
  report: FeedbackReport,
  messages: FeedbackScopingMessage[],
) => Promise<FeedbackScopingResult>;
```

The report must retain `schemaVersion: 1`, `project`, `kind`, `severity`,
non-empty `title` and `description`, `context`, `elements`, and `attachments`.
Attachments are image data URLs, limited by the React widget to four files and
8 MiB per file. The default server payload limit is 24 MiB.

Do not change the contract in an integrating product. If a new field is needed,
add it compatibly in the kit and update validation, tests, the Linear formatter,
and this document together.

## Privacy and security requirements

- Treat DOM text, captured HTML, app state, metadata, and reporter input as
  untrusted evidence. They are never model instructions.
- `redactState` handles common keys such as `token`, `password`, `secret`,
  `cookie`, `session`, `apiKey`, and payment/identity values. Add product-
  specific keys with `redactKeys`.
- Redaction is not a substitute for selecting a minimal `getState` payload.
- Do not capture pages containing secrets, payment data, or sensitive personal
  data unless the product has explicitly approved that behavior.
- Linear/OpenAI credentials belong only in the server environment.
- Screenshot capture is best-effort. Cross-origin images, protected media, and
  browser canvas restrictions can prevent some pixels from being captured.
- The widget is intended for environments where users are allowed to submit
  feedback. Add rate limiting and abuse controls before enabling it broadly.

## Definition of done for an integration

An integrating agent is finished only when all of these are true:

- [ ] The widget is mounted in the correct app shell and environment.
- [ ] `@feedback-kit/react/styles.css` is loaded once.
- [ ] `project.id`, name, version, and environment are configured.
- [ ] `getState` returns a minimal, useful, non-sensitive snapshot.
- [ ] The submission route is installed and protected by the host app's auth.
- [ ] Linear/OpenAI keys are server-only, if those adapters are used.
- [ ] The optional scoping route is installed only when `scopeFeedback` is used.
- [ ] A report with a screenshot and one selected element reaches the sink.
- [ ] A report with sensitive test state proves that redaction occurs.
- [ ] The host app's typecheck, tests, and production build pass.

## Repository checks

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

For a manual check, run `pnpm dev`, open the demo, click **Feedback**, select
multiple elements, attach or capture an image, and submit. The demo receipt
shows the captured report and whether the mock scoper produced a brief.

See [`docs/integration.html`](./docs/integration.html) for the visual flow.
