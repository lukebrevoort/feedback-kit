import {
  redactState,
  validateFeedbackReport,
  type FeedbackReport,
  type FeedbackSubmissionResult,
} from "@feedback-kit/core";
import { LinearClient } from "@linear/sdk";
import {
  buildIssueDescription,
  issueTitle,
  type UploadedFeedbackAttachment,
} from "./description";

export interface FeedbackSink {
  submit(report: FeedbackReport): Promise<FeedbackSubmissionResult>;
}

export interface LinearFeedbackOptions {
  apiKey?: string;
  accessToken?: string;
  teamId: string | ((report: FeedbackReport) => string | Promise<string>);
  labelIds?: string[] | ((report: FeedbackReport) => string[] | Promise<string[]>);
  stateId?: string;
  assigneeId?: string;
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mimeType: string } {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!match?.[1] || !match[2]) {
    throw new Error("Attachment must be a base64 data URL.");
  }
  return {
    mimeType: match[1],
    bytes: Uint8Array.from(Buffer.from(match[2], "base64")),
  };
}

export function createLinearFeedbackSink(
  options: LinearFeedbackOptions,
): FeedbackSink {
  if (Boolean(options.apiKey) === Boolean(options.accessToken)) {
    throw new Error("Provide exactly one of apiKey or accessToken.");
  }

  const client = options.apiKey
    ? new LinearClient({ apiKey: options.apiKey })
    : new LinearClient({ accessToken: options.accessToken });

  async function uploadAttachments(
    report: FeedbackReport,
  ): Promise<UploadedFeedbackAttachment[]> {
    return Promise.all(
      report.attachments.map(async (attachment) => {
        const { bytes, mimeType } = decodeDataUrl(attachment.dataUrl);
        const uploadPayload = await client.fileUpload(
          mimeType,
          attachment.name,
          bytes.byteLength,
        );
        const upload = uploadPayload.uploadFile;
        if (!uploadPayload.success || !upload) {
          throw new Error(`Linear did not create an upload URL for ${attachment.name}.`);
        }

        const headers = new Headers({
          "content-type": mimeType,
          "cache-control": "public, max-age=31536000",
        });
        upload.headers.forEach(({ key, value }) => headers.set(key, value));
        const response = await fetch(upload.uploadUrl, {
          method: "PUT",
          headers,
          body: bytes.buffer as ArrayBuffer,
        });
        if (!response.ok) {
          throw new Error(
            `Linear upload failed for ${attachment.name} (${response.status}).`,
          );
        }
        return { attachment, url: upload.assetUrl };
      }),
    );
  }

  return {
    async submit(report) {
      const [teamId, labelIds, uploads] = await Promise.all([
        typeof options.teamId === "function"
          ? options.teamId(report)
          : options.teamId,
        typeof options.labelIds === "function"
          ? options.labelIds(report)
          : (options.labelIds ?? []),
        uploadAttachments(report),
      ]);

      const payload = await client.createIssue({
        teamId,
        title: issueTitle(report),
        description: buildIssueDescription(report, uploads),
        ...(labelIds.length > 0 ? { labelIds } : {}),
        ...(options.stateId ? { stateId: options.stateId } : {}),
        ...(options.assigneeId ? { assigneeId: options.assigneeId } : {}),
        priority: { low: 4, normal: 3, high: 2, urgent: 1 }[report.severity],
      });
      const issue = await payload.issue;
      if (!payload.success || !issue) {
        throw new Error("Linear did not create an issue.");
      }
      return {
        id: issue.id,
        identifier: issue.identifier,
        url: issue.url,
        title: issue.title,
      };
    },
  };
}

export interface FeedbackHandlerOptions {
  sink: FeedbackSink;
  secret?: string;
  allowedOrigins?: string[];
  maxBodyBytes?: number;
  redactKeys?: string[];
  onError?: (error: unknown, request: Request) => void;
}

function corsHeaders(request: Request, allowedOrigins?: string[]): Headers {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    vary: "origin",
  });
  const origin = request.headers.get("origin");
  if (
    origin &&
    (allowedOrigins?.includes("*") || allowedOrigins?.includes(origin))
  ) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-methods", "POST, OPTIONS");
    headers.set(
      "access-control-allow-headers",
      "content-type, x-feedback-secret",
    );
  }
  return headers;
}

export function createFeedbackHandler(options: FeedbackHandlerOptions) {
  const maxBodyBytes = options.maxBodyBytes ?? 24 * 1024 * 1024;

  return async function handleFeedback(request: Request): Promise<Response> {
    const headers = corsHeaders(request, options.allowedOrigins);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      return Response.json(
        { error: "Method not allowed." },
        { status: 405, headers },
      );
    }
    if (
      options.secret &&
      request.headers.get("x-feedback-secret") !== options.secret
    ) {
      return Response.json(
        { error: "Unauthorized feedback request." },
        { status: 401, headers },
      );
    }

    try {
      const contentLength = Number(request.headers.get("content-length") ?? 0);
      if (contentLength > maxBodyBytes) {
        return Response.json(
          { error: "Feedback payload is too large." },
          { status: 413, headers },
        );
      }
      const body = await request.text();
      if (Buffer.byteLength(body, "utf8") > maxBodyBytes) {
        return Response.json(
          { error: "Feedback payload is too large." },
          { status: 413, headers },
        );
      }
      const validation = validateFeedbackReport(JSON.parse(body));
      if (!validation.ok) {
        return Response.json(
          { error: validation.error },
          { status: 400, headers },
        );
      }

      const report: FeedbackReport = {
        ...validation.report,
        ...(validation.report.state === undefined
          ? {}
          : {
              state: redactState(validation.report.state, {
                keys: options.redactKeys,
              }),
            }),
      };
      const result = await options.sink.submit(report);
      return Response.json({ result }, { status: 201, headers });
    } catch (error) {
      options.onError?.(error, request);
      return Response.json(
        { error: "Feedback could not be submitted." },
        { status: 500, headers },
      );
    }
  };
}

export function createLinearFeedbackHandler(
  linear: LinearFeedbackOptions,
  handler: Omit<FeedbackHandlerOptions, "sink"> = {},
) {
  return createFeedbackHandler({
    ...handler,
    sink: createLinearFeedbackSink(linear),
  });
}

export { buildIssueDescription, issueTitle } from "./description";
