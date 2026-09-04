import type { FeedbackReport } from "@feedback-kit/core";
import { describe, expect, it } from "vitest";
import { createApi } from "./server";

const report: FeedbackReport = {
  schemaVersion: 1,
  id: "report-1",
  project: { id: "demo", name: "Demo" },
  kind: "bug",
  severity: "normal",
  title: "Save button does nothing",
  description: "The form stays open after Save is clicked.",
  context: {
    url: "https://demo.example/settings",
    route: "/settings",
    title: "Settings",
    userAgent: "test",
    viewport: { width: 1280, height: 720, pixelRatio: 1 },
    locale: "en-US",
    timezone: "UTC",
    capturedAt: "2026-09-04T00:00:00.000Z",
  },
  elements: [],
  attachments: [],
};

describe("Feedback Kit deployment API", () => {
  it("reports optional integration status", async () => {
    const response = await createApi({})(
      new Request("http://localhost/health", {
        headers: { origin: "https://demo.example" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://demo.example",
    );
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      integrations: { linear: false, openai: false },
    });
  });

  it("accepts feedback with the demo sink", async () => {
    const response = await createApi({ ALLOWED_ORIGINS: "https://demo.example" })(
      new Request("http://localhost/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://demo.example",
        },
        body: JSON.stringify(report),
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://demo.example",
    );
    await expect(response.json()).resolves.toMatchObject({
      result: { identifier: "DEMO-001", title: report.title },
    });
  });

  it("completes a deterministic scoping conversation", async () => {
    const api = createApi({});
    const first = await api(
      new Request("http://localhost/api/feedback/scope", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ report, messages: [] }),
      }),
    );
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({
      result: { complete: false },
    });

    const second = await api(
      new Request("http://localhost/api/feedback/scope", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          report,
          messages: [
            { id: "reply-1", role: "user", content: "Open settings and click Save." },
          ],
        }),
      }),
    );
    await expect(second.json()).resolves.toMatchObject({
      result: { complete: true, scope: { confidence: "medium" } },
    });
  });
});
