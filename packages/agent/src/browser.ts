import type {
  FeedbackScoper,
  FeedbackScopingResult,
} from "@feedback-kit/core";

export interface RemoteFeedbackScoperOptions {
  endpoint?: string;
  headers?: Record<string, string>;
}

export function createRemoteFeedbackScoper(
  options: RemoteFeedbackScoperOptions = {},
): FeedbackScoper {
  return async (report, messages) => {
    const response = await fetch(options.endpoint ?? "/api/feedback/scope", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(options.headers ?? {}),
      },
      body: JSON.stringify({ report, messages }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      result?: FeedbackScopingResult;
      error?: string;
    };
    if (!response.ok || !body.result) {
      throw new Error(body.error ?? `Scoping request failed (${response.status}).`);
    }
    return body.result;
  };
}
