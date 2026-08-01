import { describe, expect, it } from "vitest";
import { redactState, validateFeedbackReport } from "./index";

describe("redactState", () => {
  it("redacts sensitive values, preserves useful state, and handles cycles", () => {
    const state: Record<string, unknown> = {
      route: "/inbox",
      token: "private",
      nested: { password: "also-private", count: 3 },
    };
    state.self = state;

    expect(redactState(state)).toEqual({
      route: "/inbox",
      token: "[REDACTED]",
      nested: { password: "[REDACTED]", count: 3 },
      self: "[CIRCULAR]",
    });
  });
});

describe("validateFeedbackReport", () => {
  it("rejects an unsupported payload", () => {
    expect(validateFeedbackReport({ schemaVersion: 9 })).toEqual({
      ok: false,
      error: "Unsupported feedback schema version.",
    });
  });
});
