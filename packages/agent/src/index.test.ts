import type { FeedbackReport } from "@feedback-kit/core";
import { describe, expect, it, vi } from "vitest";
import { createScopingHandler } from "./index";

const report: FeedbackReport = {
  schemaVersion: 1,
  id: "feedback-1",
  project: { id: "demo", name: "Demo" },
  kind: "bug",
  severity: "normal",
  title: "Save button is disabled",
  description: "I cannot save the draft.",
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
  elements: [],
  attachments: [],
};

describe("createScopingHandler", () => {
  it("validates input and returns a provider-neutral scoping turn", async () => {
    const scoper = vi.fn(async () => ({
      message: "What changed immediately before this happened?",
      complete: false,
    }));
    const handler = createScopingHandler({ scoper });
    const response = await handler(
      new Request("https://app.test/api/feedback/scope", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ report, messages: [] }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      result: {
        message: "What changed immediately before this happened?",
        complete: false,
      },
    });
    expect(scoper).toHaveBeenCalledWith(report, []);
  });
});
