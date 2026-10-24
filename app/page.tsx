"use client";

import { useEffect, useMemo, useState } from "react";
import { FastnHub } from "@fastn-ai/embed/react";
import type { BetaTask } from "@/lib/hosted";

type Report = { id: string; tenantId: string; title: string; customer: string; initials: string; email: string; product: string; status: "Investigating" | "In progress" | "Fixed"; priority: "High" | "Medium" | "Low"; issue: string; created: string; lastUpdate: string; description: string; };

const tenants = [
  { id: "northstar", name: "Northstar Cloud", mark: "N", color: "#d9f36a", plan: "Pro plan", domain: "northstar.io" },
  { id: "orbit", name: "Orbit Analytics", mark: "O", color: "#e9b86d", plan: "Growth plan", domain: "orbitdata.com" },
];

const emptyReports: Record<string, Report[]> = { northstar: [], orbit: [] };

const statusStyles: Record<string, string> = { "Investigating": "status-investigating", "In progress": "status-progress", "Fixed": "status-fixed" };

export default function Home() {
  const [tenantId, setTenantId] = useState("northstar");
  const [authState, setAuthState] = useState<"checking" | "signed-out" | "signed-in">("checking");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [setupLink, setSetupLink] = useState<{ accessToken: string; refreshToken: string; expiresIn: number; recovery: boolean } | null>(null);
  const [setupPassword, setSetupPassword] = useState("");
  const [setupPasswordConfirm, setSetupPasswordConfirm] = useState("");
  const [forgotPassword, setForgotPassword] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [authMode, setAuthMode] = useState<"local" | "supabase">("local");
  const [memberWorkspaces, setMemberWorkspaces] = useState<string[]>([]);
  const [sendingReportId, setSendingReportId] = useState<string | null>(null);
  const [reports, setReports] = useState(emptyReports);
  const [loadedTenantId, setLoadedTenantId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("All reports");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [showBeta, setShowBeta] = useState(false);
  const [betaTasks, setBetaTasks] = useState<BetaTask[]>([]);
  const [betaLoaded, setBetaLoaded] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", description: "", product: "" });
  const [form, setForm] = useState({ title: "", customer: "", email: "", product: "", description: "", priority: "Medium" as Report["priority"] });
  const tenant = tenants.find(t => t.id === tenantId)!;
  const loaded = loadedTenantId === tenantId;
  const current = reports[tenantId];
  const filtered = useMemo(() => current.filter(r => (filter === "All reports" || r.status === filter) && `${r.title} ${r.customer} ${r.id} ${r.issue}`.toLowerCase().includes(query.toLowerCase())), [current, filter, query]);
  const active = current.find(r => r.id === selected);
  const counts = { all: current.length, needs: current.filter(r => r.status === "Fixed").length, linked: current.filter(r => r.issue !== "Not linked").length };
  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const expiresIn = Number(hash.get("expires_in"));
    const linkType = hash.get("type");
    if (accessToken && refreshToken && Number.isInteger(expiresIn) && expiresIn > 0 && (linkType === "invite" || linkType === "recovery")) {
      setSetupLink({ accessToken, refreshToken, expiresIn, recovery: linkType === "recovery" });
      setAuthMode("supabase");
      setAuthState("signed-out");
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      return;
    }
    const authError = hash.get("error_description");
    if (authError) {
      setAuthMode("supabase");
      setLoginError(authError.replace(/\+/g, " "));
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
    fetch("/api/auth/session", { cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (cancelled) return;
      if (response.ok) { setTenantId(data.tenantId); setAuthMode(data.authMode === "supabase" ? "supabase" : "local"); setMemberWorkspaces(data.tenantIds || [data.tenantId]); setLoginEmail(data.email || ""); setAuthState("signed-in"); }
      else { setAuthMode(data.authMode === "supabase" ? "supabase" : "local"); setAuthState("signed-out"); }
    }).catch(() => { if (!cancelled) setAuthState("signed-out"); });
    };
    void initialize();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (authState !== "signed-in") return;
    let cancelled = false;
    fetch(`/api/tenants/${tenantId}/reports`, { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) { if (response.status === 401) { setReports(emptyReports); setAuthState("signed-out"); } throw new Error(data.error || "Could not load reports"); }
        if (!cancelled) setReports(prev => ({ ...prev, [tenantId]: data.reports }));
      })
      .catch(error => { if (!cancelled) setNotice(error instanceof Error ? error.message : "Could not load reports"); })
      .finally(() => { if (!cancelled) setLoadedTenantId(tenantId); });
    return () => { cancelled = true; };
  }, [tenantId, authState]);
  useEffect(() => {
    if (authState !== "signed-in" || !showBeta || authMode !== "supabase") return;
    let cancelled = false;
    fetch(`/api/tenants/${tenantId}/beta-tasks`, { cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load beta tasks");
      if (!cancelled) setBetaTasks(data.tasks);
    }).catch(error => { if (!cancelled) setNotice(error instanceof Error ? error.message : "Could not load beta tasks"); }).finally(() => { if (!cancelled) setBetaLoaded(true); });
    return () => { cancelled = true; };
  }, [tenantId, authState, authMode, showBeta]);
  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setLoginBusy(true); setLoginError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId, email: loginEmail, password: loginPassword }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not sign in");
      setTenantId(data.tenantId); setAuthMode(data.authMode === "supabase" ? "supabase" : "local"); setMemberWorkspaces(data.tenantIds || [data.tenantId]); setReports(emptyReports); setLoadedTenantId(null); setLoginPassword(""); setAuthState("signed-in");
    } catch (error) { setLoginError(error instanceof Error ? error.message : "Could not sign in"); }
    finally { setLoginBusy(false); }
  };
  const finishSetup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!setupLink) return;
    if (setupPassword.length < 12) { setLoginError("Choose a password with at least 12 characters."); return; }
    if (setupPassword !== setupPasswordConfirm) { setLoginError("The passwords don’t match."); return; }
    setLoginBusy(true); setLoginError("");
    try {
      const response = await fetch("/api/auth/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken: setupLink.accessToken, refreshToken: setupLink.refreshToken, expiresIn: setupLink.expiresIn, password: setupPassword }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not complete account setup");
      setTenantId(data.tenantId); setAuthMode("supabase"); setMemberWorkspaces(data.tenantIds || [data.tenantId]); setLoginEmail(data.email || ""); setReports(emptyReports); setLoadedTenantId(null); setSetupLink(null); setSetupPassword(""); setSetupPasswordConfirm(""); setAuthState("signed-in");
    } catch (error) { setLoginError(error instanceof Error ? error.message : "Could not complete account setup"); }
    finally { setLoginBusy(false); }
  };
  const requestPasswordReset = async (event: React.FormEvent) => {
    event.preventDefault(); setLoginBusy(true); setLoginError(""); setRecoveryMessage("");
    try {
      const response = await fetch("/api/auth/recover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: loginEmail }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not request a new link");
      setRecoveryMessage(data.message || "If an account matches that email, a fresh reset link is on its way.");
    } catch (error) { setLoginError(error instanceof Error ? error.message : "Could not request a new link"); }
    finally { setLoginBusy(false); }
  };
  const switchWorkspace = async () => {
    if (authMode === "supabase") {
      const nextWorkspace = memberWorkspaces.find(id => id !== tenantId);
      if (!nextWorkspace) { setNotice("Your account only has access to this workspace."); return; }
      setTenantId(nextWorkspace); setReports(emptyReports); setSelected(null); setLoadedTenantId(null); return;
    }
    await fetch("/api/auth/session", { method: "DELETE" });
    setTenantId(tenantId === "northstar" ? "orbit" : "northstar"); setAuthState("signed-out"); setReports(emptyReports); setSelected(null); setLoadedTenantId(null);
  };
  const signOut = async () => {
    await fetch("/api/auth/session", { method: "DELETE" });
    setAuthState("signed-out"); setReports(emptyReports); setSelected(null); setLoadedTenantId(null);
  };
  const setStatus = async (id: string, status: Report["status"]) => {
    const response = await fetch(`/api/tenants/${tenantId}/reports/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const data = await response.json();
    if (!response.ok) { if (response.status === 401) await signOut(); setNotice(data.error || "Could not update report"); return; }
    setReports(prev => ({ ...prev, [tenantId]: prev[tenantId].map(r => r.id === id ? data.report : r) }));
  };
  const notify = async (r: Report) => {
    setSendingReportId(r.id);
    try {
      const response = await fetch("/api/email/report-update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId, reportId: r.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send customer update");
      setNotice(`Update sent to ${r.customer}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not send customer update"); }
    finally { setSendingReportId(null); }
  };
  const addReport = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) { if (response.status === 401) await signOut(); throw new Error(data.error || "Could not save report"); }
      const report = data.report as Report;
      setReports(prev => ({ ...prev, [tenantId]: [report, ...prev[tenantId]] })); setSelected(report.id); setFilter("All reports"); setForm({ title: "", customer: "", email: "", product: "", description: "", priority: "Medium" }); setShowNew(false); setNotice(data.fastn?.status === "sent" ? "Report saved and sent to Fastn for triage." : data.fastn?.status === "failed" ? "Report saved, but Fastn triage could not be reached." : data.fastn?.status === "not_configured" ? "Report saved. Fastn triage is not configured yet." : "Report saved to this workspace.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save report"); }
    finally { setSaving(false); }
  };
  const createBetaTask = async (e: React.FormEvent) => {
    e.preventDefault(); setTaskSaving(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/beta-tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(taskForm) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not create beta task");
      setBetaTasks(prev => [data.task, ...prev]); setTaskForm({ title: "", description: "", product: "" }); setShowNewTask(false); setNotice("Beta task created.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not create beta task"); }
    finally { setTaskSaving(false); }
  };
  const updateBetaTask = async (task: BetaTask, action: "join" | BetaTask["status"]) => {
    const response = await fetch(`/api/tenants/${tenantId}/beta-tasks/${encodeURIComponent(task.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "join" ? { action } : { action: "status", status: action }) });
    const data = await response.json();
    if (!response.ok) { setNotice(data.error || "Could not update task"); return; }
    if (action === "join") setBetaTasks(prev => prev.map(item => item.id === task.id ? { ...item, joined: true, participantCount: item.participantCount + 1 } : item));
    else setBetaTasks(prev => prev.map(item => item.id === task.id ? { ...item, status: action } : item));
  };

  if (authState !== "signed-in") return <main className="auth-screen"><section className="auth-card"><div className="brand auth-brand"><span className="brand-mark"><PulseIcon /></span><span>signal<span className="brand-period">.</span></span></div><div className="eyebrow"><span className="eyebrow-line" /> CUSTOMER SUPPORT, IN SYNC</div><h1>{authState === "checking" ? "Checking your workspace…" : setupLink ? (setupLink.recovery ? "Choose a new password" : "Set up your account") : forgotPassword ? "Reset your password" : "Welcome back"}</h1><p className="auth-intro">{setupLink ? "Choose a secure password to finish setting up your Signal account and open your workspaces." : forgotPassword ? "Enter your account email and we’ll send a fresh reset link." : "Sign in with your individual account. Your workspace access determines which customer reports you can see."}</p>{authState === "checking" ? <div className="auth-check"><span className="integration-spinner" /> Checking secure session…</div> : setupLink ? <form className="auth-form" onSubmit={finishSetup}><label>NEW PASSWORD<input required minLength={12} maxLength={256} autoComplete="new-password" type="password" value={setupPassword} onChange={event => setSetupPassword(event.target.value)} placeholder="At least 12 characters" /></label><label>CONFIRM PASSWORD<input required minLength={12} maxLength={256} autoComplete="new-password" type="password" value={setupPasswordConfirm} onChange={event => setSetupPasswordConfirm(event.target.value)} placeholder="Enter it again" /></label>{loginError && <p className="auth-error" role="alert">{loginError}</p>}<button className="primary-button" disabled={loginBusy}>{loginBusy ? "Setting up account…" : "Set password and continue"}</button></form> : forgotPassword ? <form className="auth-form" onSubmit={requestPasswordReset}><label>EMAIL<input required autoComplete="email" type="email" value={loginEmail} onChange={event => setLoginEmail(event.target.value)} placeholder="you@company.com" /></label>{loginError && <p className="auth-error" role="alert">{loginError}</p>}{recoveryMessage && <p className="auth-success" role="status">{recoveryMessage}</p>}<button className="primary-button" disabled={loginBusy}>{loginBusy ? "Sending link…" : "Send reset link"}</button><button type="button" className="auth-text-button" onClick={() => { setForgotPassword(false); setLoginError(""); setRecoveryMessage(""); }}>Back to sign in</button></form> : <form className="auth-form" onSubmit={login}>{authMode === "local" && <label>WORKSPACE<select value={tenantId} onChange={event => setTenantId(event.target.value)}><option value="northstar">Northstar Cloud · Pro</option><option value="orbit">Orbit Analytics · Growth</option></select></label>}{authMode === "supabase" && <label>EMAIL<input required autoComplete="username" type="email" value={loginEmail} onChange={event => setLoginEmail(event.target.value)} placeholder="you@company.com" /></label>}<label>{authMode === "supabase" ? "PASSWORD" : "LOCAL PREVIEW PASSWORD"}<input required autoComplete="current-password" type="password" value={loginPassword} onChange={event => setLoginPassword(event.target.value)} placeholder="Enter your password" /></label>{loginError && <p className="auth-error" role="alert">{loginError}</p>}<button className="primary-button" disabled={loginBusy}>{loginBusy ? "Signing in…" : "Sign in"}</button>{authMode === "supabase" && <button type="button" className="auth-text-button" onClick={() => { setForgotPassword(true); setLoginError(""); setRecoveryMessage(""); }}>Forgot password?</button>}</form>}<div className="auth-foot">{authMode === "supabase" ? "Workspace access is managed by your administrator." : "Local preview account. Hosted accounts activate when Supabase is configured."}</div></section></main>;

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><PulseIcon /></span><span>signal<span className="brand-period">.</span></span><span className="brand-beta">BETA</span></div>
      <div className="workspace-label">WORKSPACE</div>
      <button className={`tenant-picker tenant-${tenantId}`} onClick={switchWorkspace} aria-label={`Switch workspace. Current: ${tenant.name}, ${tenant.plan}. Sign in to the other workspace.`}><span className="tenant-avatar" style={{ background: tenant.color }}>{tenant.mark}</span><span className="tenant-meta"><b>{tenant.name}</b><small><span className="plan-dot" />{tenant.plan}</small></span><Chevron /></button>
      <div className="side-nav"><div className="nav-caption">WORKSPACE</div><button aria-label="Reports" className={`nav-item ${!showIntegrations && !showBeta ? "active" : ""}`} onClick={() => { setShowIntegrations(false); setShowBeta(false); }}><InboxIcon /><span>Reports</span><span className="nav-count">{current.length}</span></button><button aria-label="Beta testing" className={`nav-item ${showBeta ? "active" : ""}`} onClick={() => { setShowIntegrations(false); setShowBeta(true); setBetaLoaded(false); }}><BetaIcon /><span>Beta testing</span><span className="nav-new">NEW</span></button><button aria-label="Integrations" className={`nav-item ${showIntegrations ? "active" : ""}`} onClick={() => { setShowBeta(false); setShowIntegrations(true); }}><PlugIcon /><span>Integrations</span><span className="connection-dot" /></button></div>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon">✳</div><b>Make every report count.</b><p>Keep customers in the loop from first report to final fix.</p><button onClick={() => setNotice("Guide opened.")}>Read the quick guide <span>↗</span></button></div><button className="profile"><span className="profile-avatar">SK</span><span className="profile-meta"><b>Sarim Khan</b><small>Workspace admin</small></span><MoreIcon /></button></div>
    </aside>

    <section className="main-area">
      <header className="topbar"><div className="breadcrumbs"><b>{showBeta ? "Beta testing" : showIntegrations ? "Integrations" : "Reports"}</b></div><div className="top-actions"><div className="live-pill"><span /> Signed in · {tenant.name}</div><button className="icon-button" aria-label="Help" onClick={() => setNotice("Help and integration setup will be available here.")}><HelpIcon /></button><button className="top-avatar" aria-label="Sign out" title="Sign out" onClick={signOut}>SK</button></div></header>
      <div className="content">
        {showBeta ? <>
          <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> TEST TOGETHER, SHIP WITH CONFIDENCE</div><h1>Beta testing<span className="heading-dot">.</span></h1><p className="subheading">Put every test task, participant, and finding in one shared place.</p></div><button className="primary-button" onClick={() => setShowNewTask(true)}><PlusIcon /> Create test task</button></div>
          {authMode !== "supabase" && <div className="beta-note"><b>Hosted accounts required</b><span>Beta tasks are stored in Supabase. Sign in with your invited workspace account to create and join tasks.</span></div>}
          <div className="beta-summary"><div><span>OPEN TASKS</span><b>{betaTasks.filter(t => t.status === "Open").length}</b></div><div><span>IN PROGRESS</span><b>{betaTasks.filter(t => t.status === "In progress").length}</b></div><div><span>COMPLETED</span><b>{betaTasks.filter(t => t.status === "Completed").length}</b></div><div className="beta-summary-note"><b>How it works</b><p>Claim an open test, try the feature, then file any bugs under Reports so findings stay linked to real reports.</p></div></div>
          <div className="beta-panel"><div className="beta-panel-head"><div><h2>Testing tasks</h2><p>Tasks and participation for {tenant.name}.</p></div><span className="report-total">{betaLoaded ? `${betaTasks.length} tasks` : "Loading…"}</span></div>{authMode !== "supabase" ? <div className="empty-state">Sign in to your hosted account to load workspace testing tasks.</div> : betaLoaded && betaTasks.length === 0 ? <div className="beta-empty"><span className="beta-empty-icon"><BetaIcon /></span><b>No test tasks yet</b><p>Create the first focused test task, then invite your beta testers to this workspace.</p><button className="outline-button" onClick={() => setShowNewTask(true)}>Create the first task</button></div> : <div className="beta-task-list">{betaTasks.map(task => <article className="beta-task" key={task.id}><div className="beta-task-main"><div className="beta-task-meta"><span className={`beta-status beta-${task.status.toLowerCase().replace(" ", "-")}`}>{task.status}</span><span>{task.product}</span><span>Created {formatDate(task.createdAt)}</span></div><h3>{task.title}</h3><p>{task.description}</p><div className="beta-task-foot"><span><PeopleIcon /> {task.participantCount} {task.participantCount === 1 ? "tester" : "testers"}</span>{task.joined && <b className="joined-label"><CheckIcon /> You’re participating</b>}</div></div><div className="beta-task-actions">{task.status !== "Completed" && !task.joined && <button className="primary-button" onClick={() => void updateBetaTask(task, "join")}>Join test</button>}{task.joined && task.status === "Open" && <button className="outline-button" onClick={() => void updateBetaTask(task, "In progress")}>Start testing</button>}{task.status === "In progress" && <button className="outline-button" onClick={() => void updateBetaTask(task, "Completed")}>Mark complete</button>}</div></article>)}</div>}</div>
          <div className="beta-footer-hint"><span>✳</span> Keep tasks small and specific—one feature or user journey per test makes findings easier to act on.</div>
        </> : <>
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> CUSTOMER SUPPORT, IN SYNC</div><h1>Bug reports<span className="heading-dot">.</span></h1><p className="subheading">Every report has a person waiting on the other side.</p></div><button className="primary-button" onClick={() => setShowNew(true)}><PlusIcon /> New report</button></div>
        {counts.needs > 0 && <div className="attention-banner"><span className="attention-icon"><BellIcon /></span><span className="attention-copy"><b>{counts.needs} fixes are ready to share</b><small>These customers are waiting to hear back.</small></span><button onClick={() => setFilter("Fixed")}>Review fixes <span>→</span></button></div>}

        <div className="report-panel"><div className="panel-header"><div className="panel-title"><div><h2>Customer reports</h2><p>Choose a report to see its progress and reply.</p></div><span className="report-total">{loaded ? `${filtered.length} shown` : "Loading…"}</span></div><div className="panel-tools"><label className="search-box"><SearchIcon /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search reports" aria-label="Search reports" /></label><div className="filter-tabs" aria-label="Filter reports">{["All reports", "Investigating", "In progress", "Fixed"].map(item => { const n = item === "All reports" ? current.length : current.filter(r => r.status === item).length; return <button key={item} className={filter === item ? "filter-tab active" : "filter-tab"} onClick={() => setFilter(item)}>{item}<span className="filter-count">{n}</span></button>; })}</div></div></div>
        <div className="table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="Select all" /></th><th>REPORT</th><th>CUSTOMER</th><th>STATUS</th><th>PRIORITY</th><th>GITHUB ISSUE</th><th>UPDATED</th><th></th></tr></thead><tbody>{filtered.map(r => <tr key={r.id} className={active?.id === r.id ? "row-selected" : ""} onClick={() => setSelected(r.id)}><td><input type="checkbox" aria-label={`Select ${r.id}`} onClick={e => e.stopPropagation()} /></td><td><div className="report-name"><b>{r.title}</b><small>{r.id} <span>·</span> {r.product}</small></div></td><td><div className="customer-cell"><span className="customer-avatar" style={{ background: avatarColor(r.initials) }}>{r.initials}</span><span><b>{r.customer}</b><small>{r.email}</small></span></div></td><td><button className={`status-badge ${statusStyles[r.status]}`} onClick={e => { e.stopPropagation(); setStatus(r.id, r.status === "Investigating" ? "In progress" : r.status === "In progress" ? "Fixed" : "Investigating"); }}>{r.status === "Fixed" ? <CheckIcon /> : <span className="status-dot" />} {r.status}</button></td><td><span className={`priority priority-${r.priority.toLowerCase()}`}><span />{r.priority}</span></td><td>{r.issue === "Not linked" ? <span className="unlinked-label">Not linked</span> : <span className="issue-ref"><GitHubIcon />{r.issue.split("#")[1]}</span>}</td><td><span className="updated-cell">{formatDate(r.lastUpdate)}</span></td><td><button className="row-more" disabled={sendingReportId === r.id} onClick={e => { e.stopPropagation(); void notify(r); }} aria-label={`Send update to ${r.customer}`} title="Send customer update"><SendIcon /></button></td></tr>)}</tbody></table>{loaded && filtered.length === 0 && <div className="empty-state">{current.length === 0 ? "No reports in this workspace yet. Select “New report” to log the first customer issue." : "No reports match that search."}</div>}</div>
          <div className="table-footer"><span>Showing <b>{filtered.length ? 1 : 0}–{filtered.length}</b> of <b>{current.length}</b> reports</span><div><button disabled>← Previous</button><button disabled>Next →</button></div></div>
        </div>

        {active && <div className="detail-backdrop" onClick={() => setSelected(null)}><div className="detail-panel" role="dialog" aria-modal="true" aria-label={`Report ${active.id} details`} onClick={e => e.stopPropagation()}><div className="detail-top"><div className="detail-kicker"><span className="detail-id">{active.id}</span><span>·</span><span>Reported {formatDate(active.created)}</span></div><div className="detail-actions"><button className="outline-button" onClick={() => active.issue === "Not linked" ? setNotice("Connect GitHub through Fastn before linking this report.") : window.open(`https://github.com/${active.issue.replace("#", "/issues/")}`, "_blank", "noopener,noreferrer")}><GitHubIcon /> Open issue</button><button className="primary-button notify-button" disabled={sendingReportId === active.id} onClick={() => void notify(active)}><SendIcon /> {sendingReportId === active.id ? "Sending…" : "Send update"}</button><button className="detail-close" aria-label="Close report details" onClick={() => setSelected(null)}>×</button></div></div><div className="detail-grid"><div className="detail-main"><h3>{active.title}</h3><div className="detail-description">{active.description}</div><div className="reporter-card"><div className="reporter-avatar" style={{ background: avatarColor(active.initials) }}>{active.initials}</div><div><b>{active.customer}</b><span>{active.email}</span></div><span className="reporter-label">REPORTER</span></div></div><div className="detail-aside"><div className="aside-section"><label>STATUS</label><button className={`status-badge ${statusStyles[active.status]}`} onClick={() => setStatus(active.id, active.status === "Investigating" ? "In progress" : active.status === "In progress" ? "Fixed" : "Investigating")}><span className="status-dot" />{active.status}<Chevron /></button></div><div className="aside-section"><label>PRIORITY</label><span className={`priority priority-${active.priority.toLowerCase()}`}><span />{active.priority}</span></div><div className="aside-section"><label>GITHUB ISSUE</label><span className="issue-ref"><GitHubIcon />{active.issue}</span></div><div className="aside-section"><label>PRODUCT AREA</label><span className="product-chip">{active.product}</span></div></div></div><div className="detail-bottom"><span><span className="activity-pulse" /> Last activity <b>{formatDate(active.lastUpdate)}</b></span><button onClick={() => setNotice("The update time is saved with each report status change.")}>View activity <span>→</span></button></div></div></div>}
        <footer className="page-footer"><span>© 2026 Signal</span><span><i /> {authMode === "supabase" ? "Workspace data stored securely" : "Local preview data"} <span className="footer-divider">·</span> Connections available under Integrations</span><button onClick={() => setNotice("Open Integrations to connect this workspace's accounts through Fastn.")}>Integration setup <span>↗</span></button></footer>
        </>}
      </div>
    </section>
    {notice && <div className="toast"><span className="toast-check"><CheckIcon /></span>{notice}<button onClick={() => setNotice("")}>×</button></div>}
    {showNew && <div className="modal-backdrop" onClick={() => setShowNew(false)}><form className="new-modal" onSubmit={addReport} onClick={e => e.stopPropagation()}><button type="button" className="modal-close" onClick={() => setShowNew(false)}>×</button><div className="eyebrow"><span className="eyebrow-line" /> INTAKE</div><h2>Log a customer report</h2><p>This report will be saved to {tenant.name}.</p><label>WHAT&apos;S BROKEN?<input required autoFocus maxLength={180} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Export is missing custom fields" /></label><div className="form-two"><label>CUSTOMER NAME<input required maxLength={180} value={form.customer} onChange={e => setForm({ ...form, customer: e.target.value })} placeholder="Jamie Chen" /></label><label>CUSTOMER EMAIL<input required maxLength={180} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="jamie@company.com" /></label></div><div className="form-two"><label>PRODUCT AREA<input required maxLength={180} value={form.product} onChange={e => setForm({ ...form, product: e.target.value })} placeholder="e.g. Billing" /></label><label>PRIORITY<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as Report["priority"] })}><option>Low</option><option>Medium</option><option>High</option></select></label></div><label>WHAT HAPPENED?<textarea required maxLength={5000} rows={4} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Describe the steps and what the customer expected…" /></label><button className="primary-button modal-submit" disabled={saving}><PlusIcon /> {saving ? "Saving…" : "Save report"}</button></form></div>}
    {showNewTask && <div className="modal-backdrop" onClick={() => setShowNewTask(false)}><form className="new-modal" onSubmit={createBetaTask} onClick={e => e.stopPropagation()}><button type="button" className="modal-close" onClick={() => setShowNewTask(false)}>×</button><div className="eyebrow"><span className="eyebrow-line" /> BETA PROGRAM</div><h2>Create a test task</h2><p>Give testers one clear goal and a place to report what they find.</p><label>TASK NAME<input required autoFocus maxLength={160} value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="e.g. Test password reset on mobile" /></label><label>PRODUCT AREA<input required maxLength={100} value={taskForm.product} onChange={e => setTaskForm({ ...taskForm, product: e.target.value })} placeholder="e.g. Account access" /></label><label>TEST BRIEF<textarea required maxLength={3000} rows={5} value={taskForm.description} onChange={e => setTaskForm({ ...taskForm, description: e.target.value })} placeholder="What should testers try? Include steps, expected result, and anything to watch for." /></label><button className="primary-button modal-submit" disabled={taskSaving || authMode !== "supabase"}><PlusIcon /> {taskSaving ? "Creating…" : "Create test task"}</button></form></div>}
    {showIntegrations && <FastnIntegrationPanel key={tenantId} tenantId={tenantId} onClose={() => setShowIntegrations(false)} />}
  </main>;
}

function avatarColor(s: string) { const colors = ["#f0ddc5", "#d8e5da", "#f2d7c9", "#e7e1cf", "#d7e1df", "#ead5c7"]; return colors[s.charCodeAt(0) % colors.length]; }
function formatDate(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return value; const elapsed = Math.max(0, Date.now() - date.getTime()); if (elapsed < 60_000) return "Just now"; if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`; if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} hr ago`; return date.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
type FastnEmbedSession = { token: string; baseUrl: string; endOrgId: string };

async function mintFastnEmbedSession(tenantId: string): Promise<FastnEmbedSession> {
  const response = await fetch("/api/fastn/embed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId }), cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not connect to Fastn");
  if (typeof data.token !== "string" || typeof data.baseUrl !== "string" || typeof data.endOrgId !== "string" || !data.endOrgId) {
    throw new Error("Fastn returned an incomplete workspace session.");
  }
  return { token: data.token, baseUrl: data.baseUrl, endOrgId: data.endOrgId };
}

function FastnIntegrationPanel({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [session, setSession] = useState<FastnEmbedSession | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionAttempt, setSessionAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    mintFastnEmbedSession(tenantId)
      .then((value) => { if (!cancelled) setSession(value); })
      .catch((error) => { if (!cancelled) setSessionError(error instanceof Error ? error.message : "Could not connect to Fastn"); });
    return () => { cancelled = true; };
  }, [tenantId, sessionAttempt]);

  const refreshToken = async () => {
    const refreshed = await mintFastnEmbedSession(tenantId);
    if (session && refreshed.endOrgId !== session.endOrgId) {
      throw new Error("Fastn returned a different workspace session. Reopen integrations to continue safely.");
    }
    return { token: refreshed.token, baseUrl: refreshed.baseUrl };
  };

  return <div className="integration-backdrop" onClick={onClose}><section className="integration-panel" role="dialog" aria-modal="true" aria-label="Workspace integrations" onClick={event => event.stopPropagation()}><header className="integration-header"><div><div className="eyebrow"><span className="eyebrow-line" /> CUSTOMER CONNECTIONS</div><h2>Integrations</h2><p>Connect tools for this workspace. Each workspace receives its own Fastn customer scope.</p></div><button className="detail-close" aria-label="Close integrations" onClick={onClose}>×</button></header>{session ? <FastnHub key={tenantId} orgId={session.endOrgId} token={session.token} baseUrl={session.baseUrl} getToken={refreshToken} height={620} fallback={<div className="integration-state"><span className="integration-spinner" /> Loading workspace integrations…</div>} renderError={(message, retry) => <div className="integration-state integration-error"><span className="integration-state-icon"><PlugIcon /></span><b>Fastn connection needs setup</b><p>{message}</p><small>Workspace identity is verified by Signal before each Fastn session.</small><button className="outline-button" onClick={retry}>Try again</button></div>} /> : <div className={sessionError ? "integration-state integration-error" : "integration-state"}>{sessionError ? <><span className="integration-state-icon"><PlugIcon /></span><b>Fastn session could not start</b><p>{sessionError}</p><small>Your workspace sign-in is checked before Fastn issues this session.</small><button className="outline-button" onClick={() => { setSessionError(null); setSessionAttempt(value => value + 1); }}>Try again</button></> : <><span className="integration-spinner" /> Requesting a secure Fastn session…</>}</div>}</section></div>;
}
function PulseIcon(){return <svg viewBox="0 0 24 24" fill="none"><path d="M3 12h4l2.2-6 4.1 12 2.1-6H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
function InboxIcon(){return <svg viewBox="0 0 24 24" fill="none"><path d="M4 4.8h16v14.4H4zM4 14h4l1.5 2h5L16 14h4" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>}
function BetaIcon(){return <svg viewBox="0 0 24 24" fill="none"><path d="M12 3 14.7 8.5 21 9.4l-4.5 4.4 1.1 6.2L12 17l-5.6 3 1.1-6.2L3 9.4l6.3-.9L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="m9.5 11.5 1.6 1.6 3.6-3.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
function PeopleIcon(){return <svg viewBox="0 0 20 20" fill="none"><path d="M13.7 16.2v-1.1a3 3 0 0 0-3-3H5.1a3 3 0 0 0-3 3v1.1m14.8 0v-1.1a3 3 0 0 0-2.2-2.9M7.9 9.1a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6.3-5.8a3 3 0 0 1 0 5.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>}
function PlugIcon(){return <svg viewBox="0 0 24 24" fill="none"><path d="M9 7V3m6 4V3M7 7h10v4a5 5 0 0 1-5 5v5m-4-14v4a4 4 0 0 0 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>}
function Chevron(){return <svg className="chevron" viewBox="0 0 16 16" fill="none"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
function MoreIcon(){return <svg viewBox="0 0 20 20" fill="currentColor"><circle cx="4" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="16" cy="10" r="1.5"/></svg>}
function SearchIcon(){return <svg viewBox="0 0 20 20" fill="none"><circle cx="8.8" cy="8.8" r="5.8" stroke="currentColor" strokeWidth="1.6"/><path d="m13.2 13.2 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>}
function GitHubIcon(){return <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 1.7a8.3 8.3 0 0 0-2.62 16.18c.41.08.56-.18.56-.4v-1.42c-2.28.5-2.76-.97-2.76-.97-.37-.95-.91-1.2-.91-1.2-.75-.52.06-.51.06-.51.83.06 1.27.85 1.27.85.74 1.27 1.94.9 2.42.69.07-.54.29-.9.53-1.1-1.82-.21-3.74-.91-3.74-4.06 0-.9.32-1.63.85-2.2-.09-.2-.37-1.04.08-2.17 0 0 .69-.22 2.28.84a7.9 7.9 0 0 1 4.15 0c1.59-1.06 2.28-.84 2.28-.84.45 1.13.17 1.97.08 2.17.53.57.85 1.3.85 2.2 0 3.16-1.93 3.85-3.76 4.05.3.26.57.75.57 1.52v2.15c0 .22.15.49.57.4A8.3 8.3 0 0 0 10 1.7Z"/></svg>}
function CheckIcon(){return <svg viewBox="0 0 20 20" fill="none"><path d="m4 10.5 4 4 8-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
function BellIcon(){return <svg viewBox="0 0 20 20" fill="none"><path d="M15.5 7.5a5.5 5.5 0 0 0-11 0c0 6-2 6-2 7.5h15c0-1.5-2-1.5-2-7.5ZM8 18h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
function HelpIcon(){return <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5"/><path d="M7.8 7.4a2.2 2.2 0 1 1 3.6 1.7c-.8.6-1.4 1-1.4 2.1M10 14.2v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>}
function PlusIcon(){return <svg viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
function SendIcon(){return <svg viewBox="0 0 20 20" fill="none"><path d="m17 3-7.2 14-1.6-6.2L2 9.2 17 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="m8.2 10.8 4-3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>}
