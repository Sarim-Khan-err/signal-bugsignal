import type { Report } from "@/lib/store";

export type FastnReportDelivery = "not_configured" | "delivered" | "failed";

export async function sendReportCreatedToFastn(tenantId: string, report: Report): Promise<FastnReportDelivery> {
  const webhookUrl = process.env.FASTN_REPORT_CREATED_WEBHOOK_URL;
  const webhookKey = process.env.FASTN_REPORT_CREATED_WEBHOOK_KEY;
  if (!webhookUrl || !webhookKey) return "not_configured";

  let target: URL;
  try {
    target = new URL(webhookUrl);
  } catch {
    return "failed";
  }
  if (target.protocol !== "https:") return "failed";

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": webhookKey },
      body: JSON.stringify({
        event: "report.created",
        eventId: report.id,
        customerId: `signal-${tenantId}`,
        tenantId,
        report: {
          id: report.id,
          title: report.title,
          customer: report.customer,
          email: report.email,
          product: report.product,
          description: report.description,
          priority: report.priority,
          status: report.status,
          created: report.created,
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.warn("Fastn report-created webhook returned a non-success status", response.status);
      return "failed";
    }
    return "delivered";
  } catch (error) {
    console.warn("Fastn report-created webhook request failed", error instanceof Error ? error.name : "unknown error");
    return "failed";
  }
}
