import type {
  FeedbackReport,
  FeedbackScoper,
  FeedbackSubmissionResult,
} from "@feedback-kit/core";
import { createRemoteFeedbackScoper } from "@feedback-kit/agent/browser";
import { FeedbackWidget } from "@feedback-kit/react";
import { useEffect, useMemo, useState } from "react";

const feedbackApiUrl = import.meta.env.VITE_FEEDBACK_API_URL?.replace(/\/$/, "");

const initialTasks = [
  { id: "tsk-1", title: "Review onboarding flow", done: true, tag: "Product" },
  { id: "tsk-2", title: "Prepare customer interview", done: false, tag: "Research" },
  { id: "tsk-3", title: "Ship weekly changelog", done: false, tag: "Writing" },
];

export function App() {
  const [tasks, setTasks] = useState(initialTasks);
  const [filter, setFilter] = useState<"all" | "open">("all");
  const [lastReport, setLastReport] = useState<FeedbackReport>();
  const [apiStatus, setApiStatus] = useState<
    "local" | "checking" | "connected" | "unavailable"
  >(feedbackApiUrl ? "checking" : "local");
  const remoteScoper = useMemo(
    () =>
      feedbackApiUrl
        ? createRemoteFeedbackScoper({
            endpoint: `${feedbackApiUrl}/api/feedback/scope`,
          })
        : undefined,
    [],
  );

  useEffect(() => {
    if (!feedbackApiUrl) return;
    const controller = new AbortController();
    void fetch(`${feedbackApiUrl}/health`, { signal: controller.signal })
      .then((response) => {
        setApiStatus(response.ok ? "connected" : "unavailable");
      })
      .catch(() => setApiStatus("unavailable"));
    return () => controller.abort();
  }, []);

  const visibleTasks =
    filter === "open" ? tasks.filter((task) => !task.done) : tasks;

  const submitDemoFeedback = async (
    report: FeedbackReport,
  ): Promise<FeedbackSubmissionResult> => {
    if (feedbackApiUrl) {
      const response = await fetch(`${feedbackApiUrl}/api/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(report),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        result?: FeedbackSubmissionResult;
      };
      if (!response.ok || !body.result) {
        throw new Error(body.error ?? `Feedback request failed (${response.status}).`);
      }
      setLastReport(report);
      return body.result;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 650));
    setLastReport(report);
    return {
      id: report.id,
      identifier: "DEMO-104",
      url: "https://linear.app",
      title: report.title,
    };
  };

  const scopeDemoFeedback: FeedbackScoper = async (report, messages) => {
    if (remoteScoper) return remoteScoper(report, messages);
    await new Promise((resolve) => window.setTimeout(resolve, 550));
    const userReplies = messages.filter((message) => message.role === "user");
    if (userReplies.length === 0) {
      return {
        message:
          "Can you reproduce this after refreshing the page, and what did you expect the selected UI to do?",
        complete: false,
      };
    }
    return {
      message:
        "That gives me enough to hand this off. I prepared reproduction steps and observable acceptance criteria.",
      complete: true,
      scope: {
        title: report.title,
        summary: `${report.description} The reporter confirmed: ${userReplies.at(-1)?.content}`,
        reproductionSteps: [
          `Open ${report.context.route}.`,
          "Refresh the page.",
          `Interact with ${report.elements.map((item) => item.selector).join(", ") || "the affected UI"}.`,
          "Observe the reported behavior.",
        ],
        expectedBehavior: "The selected UI responds consistently after refresh.",
        actualBehavior: report.description,
        acceptanceCriteria: [
          "The affected interaction works after a fresh page load.",
          "The behavior is covered by a regression test.",
        ],
        technicalNotes: [
          `${report.elements.length} DOM element traces and app state were captured.`,
        ],
        openQuestions: [],
        confidence: "medium",
      },
    };
  };

  return (
    <div className="demo-shell">
      <aside className="demo-sidebar">
        <div className="demo-brand">
          <span>F</span>
          <strong>Focusboard</strong>
        </div>
        <nav aria-label="Main navigation">
          <a className="is-active" href="#today">
            <span>⌁</span> Today
          </a>
          <a href="#inbox">
            <span>◫</span> Inbox <small>4</small>
          </a>
          <a href="#projects">
            <span>◇</span> Projects
          </a>
          <a href="#notes">
            <span>⌑</span> Notes
          </a>
        </nav>
        <div className="demo-sidebar-note">
          <span>DEMO MODE</span>
          <p>Try reporting any part of this interface.</p>
          <small className={`demo-api-status is-${apiStatus}`}>
            <i />
            {apiStatus === "connected"
              ? "Hosted API connected"
              : apiStatus === "checking"
                ? "Checking hosted API"
                : apiStatus === "unavailable"
                  ? "Hosted API unavailable"
                  : "Local simulation"}
          </small>
        </div>
        <div className="demo-person">
          <span>LB</span>
          <div>
            <strong>Lucas</strong>
            <small>Personal workspace</small>
          </div>
        </div>
      </aside>

      <main className="demo-main">
        <header className="demo-topbar">
          <div>
            <p>MONDAY, JULY 28</p>
            <h1>Good morning, Lucas.</h1>
          </div>
          <div className="demo-top-actions">
            <button aria-label="Search">⌕</button>
            <button className="demo-new">+ New task</button>
          </div>
        </header>

        <section className="demo-stats" aria-label="Day summary">
          <article>
            <span className="demo-stat-icon lavender">✓</span>
            <div><strong>5</strong><small>completed</small></div>
            <em>+2 today</em>
          </article>
          <article>
            <span className="demo-stat-icon peach">◷</span>
            <div><strong>3h 40m</strong><small>focused</small></div>
            <em>72% of goal</em>
          </article>
          <article>
            <span className="demo-stat-icon mint">↗</span>
            <div><strong>8 days</strong><small>current streak</small></div>
            <em>Personal best</em>
          </article>
        </section>

        <div className="demo-grid">
          <section className="demo-tasks" id="today">
            <div className="demo-section-header">
              <div>
                <p>TODAY</p>
                <h2>What’s on your plate</h2>
              </div>
              <div className="demo-filter">
                <button
                  className={filter === "all" ? "is-active" : ""}
                  onClick={() => setFilter("all")}
                >
                  All
                </button>
                <button
                  className={filter === "open" ? "is-active" : ""}
                  onClick={() => setFilter("open")}
                >
                  Open
                </button>
              </div>
            </div>
            <div className="demo-task-list">
              {visibleTasks.map((task) => (
                <article data-testid={`task-${task.id}`} key={task.id}>
                  <button
                    aria-label={`Mark ${task.title} ${task.done ? "open" : "complete"}`}
                    className={task.done ? "demo-check is-done" : "demo-check"}
                    onClick={() =>
                      setTasks((current) =>
                        current.map((item) =>
                          item.id === task.id ? { ...item, done: !item.done } : item,
                        ),
                      )
                    }
                  >
                    {task.done ? "✓" : ""}
                  </button>
                  <div>
                    <strong className={task.done ? "is-done" : ""}>{task.title}</strong>
                    <small>{task.tag} · Today</small>
                  </div>
                  <button aria-label={`More actions for ${task.title}`}>•••</button>
                </article>
              ))}
            </div>
            <button className="demo-add-task">+ Add a task</button>
          </section>

          <aside className="demo-focus">
            <p>NEXT UP</p>
            <h2>Design review</h2>
            <span>Product refresh</span>
            <div className="demo-clock">
              <strong>42:18</strong>
              <small>of 50 minutes</small>
            </div>
            <div className="demo-progress">
              <span />
            </div>
            <button>Continue focus session</button>
          </aside>
        </div>

        {lastReport ? (
          <section className="demo-receipt">
            <span>LAST CAPTURE</span>
            <strong>{lastReport.title}</strong>
            <small>
              {lastReport.attachments.length} screenshot
              {lastReport.attachments.length === 1 ? "" : "s"} ·{" "}
              {lastReport.elements.length} selected element
              {lastReport.elements.length === 1 ? "" : "s"} ·{" "}
              {lastReport.scope ? "agent scoped" : "unscoped"} · app state attached
            </small>
          </section>
        ) : (
          <section className="demo-tip">
            <span>TRY IT</span>
            <p>
              Open <strong>Feedback</strong>, select several{" "}
              <strong>Elements</strong>, then scope the report with the agent.
            </p>
          </section>
        )}
      </main>

      <FeedbackWidget
        accentColor="#765df6"
        getState={() => ({
          tasks,
          filter,
          currentWorkspace: "personal",
          sessionToken: "this-will-be-redacted",
          featureFlags: { focusTimer: true, quickCapture: true },
        })}
        metadata={{
          demo: true,
          build: import.meta.env.PROD ? "hosted" : "local",
          apiStatus,
        }}
        project={{
          id: "focusboard-demo",
          name: "Focusboard",
          version: "0.1.0",
          environment: "development",
        }}
        reporter={{ id: "usr-demo", name: "Lucas" }}
        scopeFeedback={scopeDemoFeedback}
        submitFeedback={submitDemoFeedback}
      />
    </div>
  );
}
