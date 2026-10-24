import type { Report } from "@/lib/store";

const MAX_ATTEMPTS = 2;
const RETRY_DELAYS_MS = [300];

type FastnDelivery = { status: "sent" | "not_configured" | "failed" | "quota_exceeded"; httpStatus?: number };

function isExecutionQuotaExceeded(status: number, body: string): boolean {
  if (status !== 429) return false;
  try {
    const error = JSON.parse(body) as { error?: unknown; dimension?: unknown };
    return /quota_exceeded|executions_per_month/i.test(JSON.stringify(error));
  } catch {
    return /quota_exceeded|executions_per_month/i.test(body);
  }
}

/** Send only the fields needed for report triage; reporter name and email stay in Signal. */
export async function sendReportCreatedToFastn(report: Report): Promise<FastnDelivery> {
  const webhookUrl = process.env.FASTN_REPORT_CREATED_WEBHOOK_URL?.trim();
  const apiKey = process.env.FASTN_API_KEY?.trim();
  if (!webhookUrl || !apiKey) return { status: "not_configured" };

  let endpoint: URL;
  try {
    endpoint = new URL(webhookUrl);
  } catch {
    return { status: "failed" };
  }
  if (endpoint.protocol !== "https:" || endpoint.hostname !== "webhooks.fastn.dev") {
    return { status: "failed" };
  }

  // Fastn confirms webhook triggers use the workspace API key in x-api-key.
  const payload = {
    eventId: report.id,
    tenantId: report.tenantId,
    customerId: `signal-${report.tenantId}`,
    callbackUrl: `${(process.env.SIGNAL_PUBLIC_URL || "https://signal-bugsignal.vercel.app").replace(/\/$/, "")}/api/webhooks/fastn-callback`,
    report: {
      id: report.id,
      title: report.title,
      category: report.product,
      createdAt: report.created,
      description: report.description,
    },
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          ...(apiKey.startsWith("fsk_test_") ? { "X-fastn-Test-Mode": "true" } : {}),
        },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: AbortSignal.timeout(4_000),
      });
      const responseBody = await response.text().catch(() => "");
      if (isExecutionQuotaExceeded(response.status, responseBody)) {
        return { status: "quota_exceeded", httpStatus: response.status };
      }
      if (response.ok) return { status: "sent", httpStatus: response.status };
      if (response.status < 500 && response.status !== 429) {
        return { status: "failed", httpStatus: response.status };
      }
      if (attempt === MAX_ATTEMPTS - 1) return { status: "failed", httpStatus: response.status };
    } catch {
      if (attempt === MAX_ATTEMPTS - 1) return { status: "failed" };
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
  }
  return { status: "failed" };
}
