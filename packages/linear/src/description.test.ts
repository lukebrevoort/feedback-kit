import type { FeedbackReport } from "@feedback-kit/core";
import { describe, expect, it } from "vitest";
import { buildIssueDescription, issueTitle } from "./description";

const report: FeedbackReport = {
  schemaVersion: 1,
  id: "feedback-1",
  project: { id: "demo", name: "Demo", environment: "development" },
  kind: "bug",
  severity: "high",
  title: "Save button is stuck",
  description: "The save button stays disabled.",
  context: {
    url: "https://example.test/editor",
    route: "/editor",
    title: "Editor",
    userAgent: "Test Browser",
    viewport: { width: 1200, height: 800, pixelRatio: 2 },
    locale: "en-US",
    timezone: "UTC",
    capturedAt: "2026-07-28T00:00:00.000Z",
  },
  state: { draftId: "draft-3" },
  elements: [],
  attachments: [],
};

describe("Linear issue formatting", () => {
  it("builds a recognizable title and a useful issue body", () => {
    expect(issueTitle(report)).toBe("[Demo] Save button is stuck");
    const description = buildIssueDescription(report, []);
    expect(description).toContain("## Bug report");
    expect(description).toContain("Application state");
    expect(description).toContain('"draftId": "draft-3"');
  });
});
