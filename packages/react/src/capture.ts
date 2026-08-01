import type {
  FeedbackAttachment,
  FeedbackElementContext,
  FeedbackRuntimeContext,
} from "@feedback-kit/core";

export function collectRuntimeContext(): FeedbackRuntimeContext {
  return {
    url: window.location.href,
    route: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    title: document.title,
    userAgent: navigator.userAgent,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      pixelRatio: window.devicePixelRatio,
    },
    locale: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    capturedAt: new Date().toISOString(),
  };
}

export async function capturePageScreenshot(
  target: HTMLElement = document.body,
): Promise<FeedbackAttachment> {
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(target, {
    backgroundColor: null,
    logging: false,
    useCORS: true,
    scale: Math.min(window.devicePixelRatio, 2),
    ignoreElements: (element) =>
      Boolean(element.closest("[data-feedback-kit-root]")),
  });

  return {
    id: crypto.randomUUID(),
    name: `feedback-${new Date().toISOString().replaceAll(":", "-")}.png`,
    mimeType: "image/png",
    dataUrl: canvas.toDataURL("image/png", 0.92),
    source: "automatic-screenshot",
  };
}

export function createSelector(element: Element): string {
  if (element.id) return `#${CSS.escape(element.id)}`;
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body && parts.length < 5) {
    let part = current.tagName.toLowerCase();
    const testId = current.getAttribute("data-testid");
    if (testId) {
      parts.unshift(`[data-testid="${CSS.escape(testId)}"]`);
      break;
    }

    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName === current?.tagName,
      );
      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
    }
    parts.unshift(part);
    current = parent;
  }

  return parts.join(" > ");
}

export function describeElement(element: Element): FeedbackElementContext {
  const rect = element.getBoundingClientRect();
  const text = element.textContent?.replace(/\s+/g, " ").trim().slice(0, 240);
  const html = element.outerHTML.replace(/\s+/g, " ").slice(0, 1_000);

  return {
    selector: createSelector(element),
    tagName: element.tagName.toLowerCase(),
    ...(text ? { text } : {}),
    ...(element.getAttribute("aria-label")
      ? { ariaLabel: element.getAttribute("aria-label") ?? undefined }
      : {}),
    ...(element.getAttribute("role")
      ? { role: element.getAttribute("role") ?? undefined }
      : {}),
    bounds: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    html,
  };
}

export async function fileToAttachment(
  file: File,
  source: FeedbackAttachment["source"],
): Promise<FeedbackAttachment> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsDataURL(file);
  });

  return {
    id: crypto.randomUUID(),
    name: file.name || `pasted-image-${Date.now()}.png`,
    mimeType: file.type || "application/octet-stream",
    dataUrl,
    source,
  };
}
