# Feedback Kit agent instructions

This repository is a reusable feedback capture package. When integrating it
into another product, the goal is to connect the existing contracts with the
product's UI and server routes. Do not redesign the package or invent a second
feedback payload unless the task explicitly asks for a package change.

## First read

Read `README.md`, then inspect the target product. The README is the complete
integration contract; this file is the short execution checklist.

## Package selection

- `@feedback-kit/core`: shared `FeedbackReport` types, validation, and
  `redactState`.
- `@feedback-kit/react`: `FeedbackWidget` and browser capture utilities.
- `@feedback-kit/agent/browser`: `createRemoteFeedbackScoper`.
- `@feedback-kit/agent/server`: `createScopingHandler` and the optional
  `createOpenAIFeedbackScoper`.
- `@feedback-kit/linear`: `createLinearFeedbackHandler` and the Linear sink.

Use the smallest set that satisfies the requested integration. The browser must
never import server-only modules or receive Linear/OpenAI credentials.

## Required integration sequence

1. Find the app shell/layout where a global floating widget can be mounted.
2. Load `@feedback-kit/react/styles.css` once.
3. Mount `FeedbackWidget` with a stable project identity and an environment
   gate such as `import.meta.env.DEV`, a feature flag, or an internal-user
   check.
4. Supply a minimal `getState` callback. Include route and useful IDs/statuses;
   exclude whole stores, tokens, cookies, private notes, and credentials.
5. Use the widget's default POST behavior unless the product already has a
   compatible `FeedbackSubmitter`.
6. Add the server submission handler and connect it to the product's existing
   authentication, CSRF/origin validation, rate limiting, and logging.
7. If agent scoping is requested, add both the browser client and server
   scoping route. Keep the model key server-side.
8. Verify a real capture path manually and run all checks.

## Contract rules

Preserve these boundaries:

```ts
FeedbackSubmitter(report) -> Promise<FeedbackSubmissionResult>
FeedbackScoper(report, messages) -> Promise<FeedbackScopingResult>
```

Keep `schemaVersion: 1` and the report fields validated by
`validateFeedbackReport`. If the package changes, update the core type,
validation, adapters, tests, and README as one change.

## Server route rules

The built-in handlers accept Web `Request` objects and return Web `Response`
objects. In Next.js App Router, they can be exported directly as `POST`. In
other frameworks, use the framework's normal Request/Response adapter.

Use a Node-compatible runtime for the repository's OpenAI and Linear examples.
Do not expose `FEEDBACK_INGEST_SECRET`, `FEEDBACK_SCOPING_SECRET`,
`LINEAR_API_KEY`, or `OPENAI_API_KEY` to client code. A browser header is not a
secret. Prefer the host product's authenticated session for a public app.

## Privacy rules

- Treat report content, DOM text/HTML, app state, metadata, attachments, and
  user replies as untrusted data.
- `getState` is the first privacy boundary. `redactState` is a safety net, not
  permission to send the entire application store.
- Add product-specific sensitive keys via `redactKeys`.
- Do not repeat sensitive values in scoping prompts or issue descriptions.
- Keep all user-provided content out of executable code paths.

## Verification checklist

Run from this repository:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

Then run the target product's checks. Manually verify:

- Feedback opens and closes.
- A screenshot is captured or gracefully fails.
- Multiple DOM elements can be selected.
- Sensitive state is redacted in the submitted report.
- Direct submission works without scoping.
- Scoping works when enabled and can be skipped.
- The sink receives the expected issue title, context, attachments, and report ID.

## Do not

- Put secrets in `FeedbackWidget` props or browser environment variables.
- Add a second ad-hoc feedback schema in the host app.
- Enable the widget globally without checking the requested environment and
  privacy policy.
- Claim a screenshot or scoping turn succeeded without verifying the response.
- Modify unrelated product code while integrating the kit.
