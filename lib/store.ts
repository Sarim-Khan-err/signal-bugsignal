import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type ReportStatus = "Investigating" | "In progress" | "Fixed";
export type Report = {
  id: string;
  tenantId: string;
  title: string;
  customer: string;
  initials: string;
  email: string;
  product: string;
  status: ReportStatus;
  priority: "High" | "Medium" | "Low";
  issue: string;
  created: string;
  lastUpdate: string;
  description: string;
};

const tenants = ["northstar", "orbit"] as const;
type Database = { reports: Report[] };
const file = path.join(process.cwd(), "data", "signal.json");
let queue: Promise<unknown> = Promise.resolve();

async function readDatabase(): Promise<Database> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Database;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(path.dirname(file), { recursive: true });
    const empty: Database = { reports: [] };
    await writeFile(file, JSON.stringify(empty, null, 2), { flag: "wx" }).catch(() => undefined);
    return empty;
  }
}

async function update<T>(operation: (db: Database) => T | Promise<T>): Promise<T> {
  const task = queue.then(async () => {
    const db = await readDatabase();
    const result = await operation(db);
    await mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(db, null, 2), "utf8");
    await rename(temp, file);
    return result;
  });
  queue = task.catch(() => undefined);
  return task;
}

export function isTenantId(value: string): value is (typeof tenants)[number] {
  return tenants.includes(value as (typeof tenants)[number]);
}

export async function listReports(tenantId: string) {
  if (!isTenantId(tenantId)) throw new Error("Unknown workspace");
  const db = await readDatabase();
  return db.reports.filter((report) => report.tenantId === tenantId).sort((a, b) => b.created.localeCompare(a.created));
}

export async function findReport(tenantId: string, reportId: string) {
  if (!isTenantId(tenantId)) throw new Error("Unknown workspace");
  const db = await readDatabase();
  return db.reports.find((report) => report.id === reportId && report.tenantId === tenantId) ?? null;
}

export async function createReport(tenantId: string, input: Pick<Report, "title" | "customer" | "email" | "product" | "description" | "priority">) {
  if (!isTenantId(tenantId)) throw new Error("Unknown workspace");
  return update((db) => {
    const now = new Date().toISOString();
    const report: Report = {
      ...input,
      id: `SIG-${randomUUID().slice(0, 8).toUpperCase()}`,
      tenantId,
      initials: input.customer.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      status: "Investigating",
      issue: "Not linked",
      created: now,
      lastUpdate: now,
    };
    db.reports.push(report);
    return report;
  });
}

export async function updateReport(tenantId: string, reportId: string, status: ReportStatus) {
  if (!isTenantId(tenantId)) throw new Error("Unknown workspace");
  return update((db) => {
    const report = db.reports.find((item) => item.id === reportId && item.tenantId === tenantId);
    if (!report) return null;
    report.status = status;
    report.lastUpdate = new Date().toISOString();
    return report;
  });
}
