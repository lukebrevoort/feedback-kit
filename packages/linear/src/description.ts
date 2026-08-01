import type {
  FeedbackAttachment,
  FeedbackReport,
} from "@feedback-kit/core";

const KIND_LABELS = {
  bug: "Bug",
  idea: "Idea",
  question: "Question",
  other: "Feedback",
} as const;

export function issueTitle(report: FeedbackReport): string {
  return `[${report.project.name}] ${report.scope?.title ?? report.title}`;
}

function jsonBlock(value: unknown, maxLength = 12_000): string {
  const json = JSON.stringify(value, null, 2) ?? "null";
  const truncated =
    json.length > maxLength
      ? `${json.slice(0, maxLength)}\n… [truncated by Feedback Kit]`
      : json;
  return `\`\`\`json\n${truncated.replaceAll("```", "\\`\\`\\`")}\n\`\`\``;
}

export interface UploadedFeedbackAttachment {
  attachment: FeedbackAttachment;
  url: string;
}

export function buildIssueDescription(
  report: FeedbackReport,
  uploads: UploadedFeedbackAttachment[],
): string {
  const lines = [
    `## ${KIND_LABELS[report.kind]} report`,
    "",
    report.description,
    "",
  ];

  if (uploads.length > 0) {
    lines.push("## Screenshots", "");
    for (const { attachment, url } of uploads) {
      lines.push(`![${attachment.name}](${url})`, "");
    }
  }

  if (report.scope) {
    lines.push(
      "## Agent-scoped brief",
      "",
      report.scope.summary,
      "",
      "### Reproduction steps",
      "",
      ...report.scope.reproductionSteps.map((step, index) => `${index + 1}. ${step}`),
      "",
      `**Expected:** ${report.scope.expectedBehavior}`,
      "",
      `**Actual:** ${report.scope.actualBehavior}`,
      "",
      "### Acceptance criteria",
      "",
      ...report.scope.acceptanceCriteria.map((criterion) => `- [ ] ${criterion}`),
      "",
    );
    if (report.scope.technicalNotes.length > 0) {
      lines.push(
        "### Technical notes",
        "",
        ...report.scope.technicalNotes.map((note) => `- ${note}`),
        "",
      );
    }
    if (report.scope.openQuestions.length > 0) {
      lines.push(
        "### Open questions",
        "",
        ...report.scope.openQuestions.map((question) => `- ${question}`),
        "",
      );
    }
    lines.push(`**Scoping confidence:** ${report.scope.confidence}`, "");
  }

  if (report.elements.length > 0) {
    lines.push(
      `## Selected elements (${report.elements.length})`,
      "",
    );
    report.elements.forEach((element, index) => {
      lines.push(
        `### ${index + 1}. \`${element.selector}\``,
        "",
        `- **Element:** \`${element.tagName}\``,
        `- **Bounds:** ${element.bounds.width} × ${element.bounds.height} at (${element.bounds.x}, ${element.bounds.y})`,
      );
      if (element.ariaLabel) lines.push(`- **ARIA label:** ${element.ariaLabel}`);
      if (element.text) lines.push(`- **Text:** ${element.text}`);
      if (element.html) {
        lines.push("", "<details><summary>Element HTML</summary>", "", "```html");
        lines.push(element.html.replaceAll("```", "\\`\\`\\`"));
        lines.push("```", "", "</details>", "");
      }
    });
  }

  lines.push(
    "## Runtime",
    "",
    `- **Project:** ${report.project.id}`,
    `- **Environment:** ${report.project.environment ?? "not provided"}`,
    `- **Version:** ${report.project.version ?? "not provided"}`,
    `- **Route:** \`${report.context.route}\``,
    `- **URL:** ${report.context.url}`,
    `- **Viewport:** ${report.context.viewport.width} × ${report.context.viewport.height} @ ${report.context.viewport.pixelRatio}x`,
    `- **Browser:** ${report.context.userAgent}`,
    `- **Captured:** ${report.context.capturedAt}`,
    `- **Feedback ID:** \`${report.id}\``,
    "",
  );

  if (report.reporter) {
    lines.push(
      "## Reporter",
      "",
      report.reporter.name ? `- **Name:** ${report.reporter.name}` : "",
      report.reporter.email ? `- **Email:** ${report.reporter.email}` : "",
      report.reporter.id ? `- **App user ID:** \`${report.reporter.id}\`` : "",
      "",
    );
  }

  if (report.state !== undefined) {
    lines.push(
      "<details><summary>Application state</summary>",
      "",
      jsonBlock(report.state),
      "",
      "</details>",
      "",
    );
  }

  if (report.metadata) {
    lines.push(
      "<details><summary>Custom metadata</summary>",
      "",
      jsonBlock(report.metadata, 5_000),
      "",
      "</details>",
    );
  }

  if (report.scopingConversation?.length) {
    lines.push(
      "",
      "<details><summary>Scoping conversation</summary>",
      "",
      ...report.scopingConversation.flatMap((message) => [
        `**${message.role === "assistant" ? "Scoper" : "Reporter"}:**`,
        "",
        message.content,
        "",
      ]),
      "</details>",
    );
  }

  return lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
}
