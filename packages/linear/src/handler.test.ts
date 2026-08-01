import type { FeedbackReport } from "@feedback-kit/core";
import { describe, expect, it, vi } from "vitest";
import { createFeedbackHandler } from "./index";

function makeReport(): FeedbackReport {
  return {
    schemaVersion: 1,
    id: "feedback-1",
    project: { id: "demo", name: "Demo" },
    kind: "bug",
    severity: "normal",
    title: "Something moved",
    description: "The toolbar moved after saving.",
    context: {
      url: "https://example.test/editor",
      route: "/editor",
      title: "Editor",
      userAgent: "Test Browser",
      viewport: { width: 1200, height: 800, pixelRatio: 1 },
      locale: "en-US",
      timezone: "UTC",
      capturedAt: "2026-07-28T00:00:00.000Z",
    },
    state: { documentId: "doc-1", privateNotes: "do not send" },
    elements: [],
    attachments: [],
  };
}

describe("createFeedbackHandler", () => {
  it("validates the shared secret and redacts app-specific state on the server", async () => {
    const submit = vi.fn(async () => ({ id: "issue-1", identifier: "DEMO-1" }));
    const handler = createFeedbackHandler({
      sink: { submit },
      secret: "expected",
      redactKeys: ["privateNotes"],
    });
    const unauthorized = await handler(
      new Request("https://app.test/api/feedback", {
        method: "POST",
        body: JSON.stringify(makeReport()),
      }),
    );
    expect(unauthorized.status).toBe(401);

    const response = await handler(
      new Request("https://app.test/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-feedback-secret": "expected",
        },
        body: JSON.stringify(makeReport()),
      }),
    );
    expect(response.status).toBe(201);
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        state: { documentId: "doc-1", privateNotes: "[REDACTED]" },
      }),
    );
  });
});
