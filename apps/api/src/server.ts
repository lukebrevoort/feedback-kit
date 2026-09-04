import {
  createOpenAIFeedbackScoper,
  createScopingHandler,
} from "@feedback-kit/agent/server";
import type {
  FeedbackReport,
  FeedbackScoper,
  FeedbackSubmissionResult,
} from "@feedback-kit/core";
import {
  createFeedbackHandler,
  createLinearFeedbackHandler,
  type FeedbackSink,
} from "@feedback-kit/linear";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

type ApiEnvironment = Record<string, string | undefined>;

function allowedOrigins(environment: ApiEnvironment): string[] {
  return (environment.ALLOWED_ORIGINS ?? "*")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function publicHeaders(request: Request, origins: string[]): Headers {
  const headers = new Headers({ vary: "origin" });
  const origin = request.headers.get("origin");
  if (origin && (origins.includes("*") || origins.includes(origin))) {
    headers.set("access-control-allow-origin", origin);
  }
  return headers;
}

export function createDemoSink(): FeedbackSink {
  let reportNumber = 0;
  return {
    async submit(report: FeedbackReport): Promise<FeedbackSubmissionResult> {
      reportNumber += 1;
      return {
        id: report.id,
        identifier: `DEMO-${String(reportNumber).padStart(3, "0")}`,
        title: report.title,
      };
    },
  };
}

export const demoScoper: FeedbackScoper = async (report, messages) => {
  const replies = messages.filter((message) => message.role === "user");
  if (replies.length === 0) {
    return {
      message:
        "What is the smallest sequence of actions that reproduces this, and what result did you expect?",
      complete: false,
    };
  }

  const latestReply = replies.at(-1)?.content ?? "No additional detail supplied.";
  return {
    message: "Thanks — the issue brief is ready to hand off.",
    complete: true,
    scope: {
      title: report.title,
      summary: `${report.description} Reporter context: ${latestReply}`,
      reproductionSteps: [
        `Open ${report.context.route}.`,
        latestReply,
        "Observe the reported behavior.",
      ],
      expectedBehavior: "The interaction produces the result described by the reporter.",
      actualBehavior: report.description,
      acceptanceCriteria: [
        "The reported workflow completes with the expected result.",
        "A regression test covers the smallest reproduction path.",
      ],
      technicalNotes: [
        `${report.elements.length} element trace(s) and ${report.attachments.length} image(s) were captured.`,
      ],
      openQuestions: [],
      confidence: "medium",
    },
  };
};

export function createApi(environment: ApiEnvironment = process.env) {
  const origins = allowedOrigins(environment);
  const hasLinear = Boolean(environment.LINEAR_API_KEY && environment.LINEAR_TEAM_ID);
  const hasOpenAI = Boolean(environment.OPENAI_API_KEY);

  const feedback = hasLinear
    ? createLinearFeedbackHandler(
        {
          apiKey: environment.LINEAR_API_KEY,
          teamId: environment.LINEAR_TEAM_ID!,
        },
        { allowedOrigins: origins, onError: console.error },
      )
    : createFeedbackHandler({
        sink: createDemoSink(),
        allowedOrigins: origins,
        onError: console.error,
      });

  const scoping = createScopingHandler({
    scoper: hasOpenAI
      ? createOpenAIFeedbackScoper({
          apiKey: environment.OPENAI_API_KEY,
          model: environment.OPENAI_FEEDBACK_MODEL ?? "gpt-5.6",
        })
      : demoScoper,
    allowedOrigins: origins,
    onError: console.error,
  });

  return async (request: Request): Promise<Response> => {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/health" || pathname === "/") {
      return Response.json({
        service: "feedback-kit-api",
        status: "ok",
        integrations: { linear: hasLinear, openai: hasOpenAI },
      }, { headers: publicHeaders(request, origins) });
    }
    if (pathname === "/api/feedback") return feedback(request);
    if (pathname === "/api/feedback/scope") return scoping(request);
    return Response.json({ error: "Not found." }, { status: 404 });
  };
}

async function toWebRequest(request: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const host = request.headers.host ?? "127.0.0.1";
  const url = new URL(request.url ?? "/", `http://${host}`);
  const body = Buffer.concat(chunks);
  return new Request(url, {
    method: request.method,
    headers: request.headers as HeadersInit,
    ...(body.byteLength > 0 ? { body } : {}),
  });
}

async function sendWebResponse(response: Response, target: ServerResponse) {
  target.statusCode = response.status;
  response.headers.forEach((value, key) => target.setHeader(key, value));
  target.end(Buffer.from(await response.arrayBuffer()));
}

export function startServer(environment: ApiEnvironment = process.env) {
  const api = createApi(environment);
  const port = Number(environment.PORT ?? 3000);
  const server = createServer(async (request, response) => {
    try {
      await sendWebResponse(await api(await toWebRequest(request)), response);
    } catch (error) {
      console.error(error);
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Internal server error." }));
    }
  });
  server.listen(port, "0.0.0.0", () => {
    console.log(`Feedback Kit API listening on port ${port}`);
  });
  return server;
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  startServer();
}
