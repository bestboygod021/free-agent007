/* ForgePilot live playground — talks to the server over SSE. No dependencies. */

const $ = (id) => document.getElementById(id);
const timeline = $("timeline");

let mode = "free";

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function pill(text, kind) {
  const span = el("span", `pill pill-${kind || "muted"}`, text);
  return span;
}

function card(title, badge, badgeKind) {
  const box = el("div", "event");
  const head = el("div", "event-head");
  head.appendChild(el("span", "event-title", title));
  if (badge) head.appendChild(pill(badge, badgeKind));
  box.appendChild(head);
  const body = el("div", "event-body");
  box.appendChild(body);
  timeline.appendChild(box);
  box.scrollIntoView({ behavior: "smooth", block: "end" });
  return body;
}

function kv(body, key, value, kind) {
  const row = el("div", "kv");
  row.appendChild(el("span", "kv-k", key));
  row.appendChild(el("span", `kv-v ${kind || ""}`, String(value)));
  body.appendChild(row);
}

function pre(body, value) {
  const p = el("pre", "mono", typeof value === "string" ? value : JSON.stringify(value, null, 2));
  body.appendChild(p);
}

// ── SSE ─────────────────────────────────────────────────────────────────────

const source = new EventSource("/api/events");

source.addEventListener("open", () => {
  $("conn").textContent = "متصل";
  $("conn").className = "pill pill-ok";
});
source.addEventListener("error", () => {
  $("conn").textContent = "قطع";
  $("conn").className = "pill pill-bad";
});
source.addEventListener("hello", (e) => {
  const d = JSON.parse(e.data);
  $("conn").textContent = `متصل · رویداد ${d.eventSeq}`;
});

source.addEventListener("run", (e) => {
  const d = JSON.parse(e.data);
  renderStage(d);
});

source.addEventListener("approval", (e) => {
  const d = JSON.parse(e.data);
  if (d.decision) {
    $("approval").classList.add("hidden");
    return;
  }
  if (d.timedOut) {
    $("approval").classList.add("hidden");
    const body = card("تصویب", "منقضی شد", "bad");
    kv(body, "نتیجه", "اجرا بدون تصویب ادامه پیدا نکرد");
    return;
  }
  $("approvalDetail").textContent =
    `${d.planGoal} — ${d.taskCount} تسک · سقف خودمختاری: ${d.autonomyCeiling}`;
  $("approval").classList.remove("hidden");
});

source.addEventListener("settings", (e) => {
  const d = JSON.parse(e.data);
  $("hash").textContent = `settings: ${d.settingsHash}`;
  renderResolutions(d.resolutions, d.issues);
});

source.addEventListener("done", (e) => {
  const d = JSON.parse(e.data);
  const body = card("پایان اجرا", d.outcome === "completed" ? "کامل شد" : "مسدود شد",
    d.outcome === "completed" ? "ok" : "bad");
  kv(body, "حالت نهایی", d.finalState ?? d.state ? "—") ;
  if (d.reason) kv(body, "دلیل توقف", d.reason, "bad");
  kv(body, "رشته ممیزی", d.audit && d.audit.valid ? "سالم" : `شکسته در ${d.audit && d.audit.brokenAtSeq}`,
    d.audit && d.audit.valid ? "ok" : "bad");
  kv(body, "تعداد رویداد ممیزی", d.auditCount);
  if (d.recentAudit) pre(body, d.recentAudit);
  $("chain").textContent = `audit: ${d.auditCount} رویداد`;
});

source.addEventListener("reset", () => {
  timeline.innerHTML = "";
  $("approval").classList.add("hidden");
  const body = card("بازنشانی", "انجام شد", "muted");
  kv(body, "وضعیت", "همه حالت‌ها به پیش‌فرض برگشت");
});

source.addEventListener("error-event", () => {});

function renderStage(d) {
  switch (d.stage) {
    case "start": {
      const body = card("شروع اجرا", d.opts.computeMode, "info");
      kv(body, "حالت محاسباتی", d.opts.computeMode);
      kv(body, "سطح محرمانگی", d.opts.privacyLevel);
      kv(body, "تنظیمات مؤثر", d.settings);
      kv(body, "هش تنظیمات", d.settingsHash);
      break;
    }
    case "settings": {
      const body = card("دروازه تنظیمات", d.violations.length ? "رد شد" : "گذشت",
        d.violations.length ? "bad" : "ok");
      if (d.violations.length) pre(body, d.violations);
      else kv(body, "نتیجه", "درخواست با تنظیمات مؤثر سازگار است", "ok");
      break;
    }
    case "state": {
      const body = card("ماشین حالت", d.allowed ? (d.to || "—") : "رد شد",
        d.allowed ? "ok" : "bad");
      kv(body, "رویداد", d.event);
      if (d.from) kv(body, "از", d.from);
      if (d.to) kv(body, "به", d.to, "ok");
      if (d.label) kv(body, "توضیح", d.label);
      if (d.reason) kv(body, "دلیل رد", d.reason, "bad");
      break;
    }
    case "redaction": {
      const body = card("پاک‌سازی ورودی نامعتبر",
        d.hadSecrets ? `${d.hits.length} رمز پیدا شد` : "پاک",
        d.hadSecrets ? "warn" : "ok");
      if (d.untrustedMarker) {
        kv(body, "تزریق پرامپت", "به‌عنوان داده نامعتبر علامت خورد، نه دستور", "warn");
      }
      kv(body, "تعداد پاک‌سازی", d.totalRedacted);
      if (d.hits.length) pre(body, d.hits);
      kv(body, "خروجی پاک‌شده", "");
      pre(body, d.output);
      break;
    }
    case "canary": {
      const body = card("حلقه canary — یادگیری با اندازه‌گیری", `${d.allocations.length} بازو`, "info");
      kv(body, "بودجه مصرف‌شده", `${d.tokensCommitted.toLocaleString("fa-IR")} توکن · باقی ${d.tokensRemaining.toLocaleString("fa-IR")}`);
      for (const a of d.allocations) {
        kv(body, a.subject, `${a.trials} آزمایش · ${Math.round(a.probBest * 100)}٪ probBest`, "ok");
      }
      kv(body, "توقف زودهنگام (SPRT)", "");
      for (const st of d.stopping) {
        kv(body, `↳ ${st.subject}`,
          `${st.trialsRun} اجرا → تصمیم در ${st.decidedAt > 0 ? st.decidedAt : "—"}` +
          (st.trialsSaved ? ` · ${st.trialsSaved} آزمایش صرفه‌جویی` : "") +
          ` · ${st.decision}`,
          st.decision === "continue" ? "warn" : "ok");
      }
      kv(body, "شواهد تازه (tier=measured)", "");
      for (const c of d.newClaims) {
        kv(body, `↳ ${c.subject}`, `نرخ ${c.value} از ${c.sampleSize} آزمایش`, "ok");
      }
      kv(body, "ترتیب قبل", d.beforeOrder.join(" ← "));
      kv(body, "ترتیب بعد", d.afterOrder.join(" ← "), d.orderChanged ? "warn" : "ok");
      kv(body, "ترتیب عوض شد", d.orderChanged ? "بله" : "خیر", d.orderChanged ? "warn" : "ok");
      if (d.promotion) {
        kv(body, `تصمیم ارتقا (${d.promotion.challenger})`, d.promotion.action,
          d.promotion.action === "promote" ? "ok" : "warn");
        for (const r of d.promotion.reasons) kv(body, "↳ دلیل", r);
        if (d.promotion.blockedBy) kv(body, "↳ مسدود توسط", d.promotion.blockedBy, "bad");
      }
      kv(body, "هش شواهد", `${d.digestBefore} → ${d.digestAfter}`);
      break;
    }
    case "evidence": {
      const body = card("شواهد توانمندی — کدام مدل و چرا", `${d.ranked.length} نامزد`, "info");
      kv(body, "قاعده", d.rule, "warn");
      kv(body, "هش شواهد", d.digest);
      for (const r of d.ranked) {
        const label = `#${r.rank} ${r.subject}`;
        const state = r.unmeasured ? "اندازه‌گیری‌نشده" : `اطمینان ${Math.round(r.confidence * 100)}٪`;
        kv(body, label,
          `امتیاز ${r.value} → تعدیل‌شده ${r.adjusted} · ${state}` +
          (r.canaryShare ? ` · canary ${Math.round(r.canaryShare * 100)}٪` : ""),
          r.unmeasured ? "bad" : "ok");
        const notes = [];
        if (r.webShare) notes.push(`سهم وب ${Math.round(r.webShare * 100)}٪`);
        if (r.manipulation) notes.push(`${r.manipulation} نشانه دستکاری`);
        if (r.contested) notes.push(`contested ${r.contested}`);
        if (notes.length) kv(body, "↳", notes.join(" · "), "warn");
        kv(body, "↳ چرا", r.explanationFa);
      }
      break;
    }
    case "egress": {
      const v = d.verdict;
      const body = card("دیوار خروج داده", v.allowed ? (v.approvalRequired ? "نیاز به رضایت" : "مجاز") : "ممنوع",
        v.allowed ? (v.approvalRequired ? "warn" : "ok") : "bad");
      kv(body, "ارائه‌دهنده", d.provider);
      kv(body, "حالت", d.mode);
      kv(body, "سطح ریسک", v.riskLevel, v.riskLevel === "critical" ? "bad" : "");
      pre(body, v.reasons);
      if (v.denyReason) kv(body, "دلیل رد", v.denyReason, "bad");
      break;
    }
    case "routing": {
      const body = card("مسیریابی مدل", d.modeLabel, "info");
      for (const r of d.routes) {
        kv(body, r.taskType,
          r.primary ? `${r.primary.provider}/${r.primary.model}` : "بدون ارائه‌دهنده مجاز",
          r.primary ? "ok" : "bad");
        if (r.fallbacks.length) kv(body, `↳ fallback`, r.fallbacks.join(" ← "));
        if (r.rejected.length) kv(body, `↳ رد شده`, r.rejected.map((x) => `${x.provider}: ${x.reason}`).join(" | "));
      }
      break;
    }
    case "pool": {
      const body = card("استخر ارائه‌دهندگان رایگان", d.strategy, "info");
      if (d.rateLimited) kv(body, "اتفاق", "هر دو کلید Groq نرخ‌محدود شدند", "warn");
      kv(body, "انتخاب اصلی", d.primary ?? "هیچ", d.primary ? "ok" : "bad");
      kv(body, "گروه یکپارچه", d.groupKey ?? "—");
      if (d.fallbacks.length) kv(body, "fallback", d.fallbacks.join(" ← "));
      if (d.rejected.length) pre(body, d.rejected);
      if (d.usage && d.usage.length) pre(body, d.usage);
      break;
    }
    case "dag": {
      const body = card("گراف تسک", `${d.waves.length} موج`, d.valid ? "ok" : "bad");
      kv(body, "تعداد تسک", d.totalTasks);
      d.waves.forEach((w, i) => kv(body, `موج ${i + 1}`, w.join(", ")));
      if (d.conflicts.length) {
        kv(body, "تعارض قفل فایل", `${d.conflicts.length} مورد`, "bad");
        pre(body, d.conflicts);
      }
      if (d.errors.length) pre(body, d.errors);
      break;
    }
    case "policy": {
      const body = card("سیاست Tool Call", `${d.verdicts.length} فراخوانی`, "info");
      for (const v of d.verdicts) {
        const verdict = v.verdict;
        const label = verdict.allowed
          ? verdict.approvalRequired ? "مجاز با تصویب" : "مجاز"
          : "رد شد";
        kv(body, v.tool + (v.action ? ` (${v.action})` : "") + (v.targetRef ? ` → ${v.targetRef}` : ""),
          `${label} · ${verdict.riskLevel} · ${verdict.sideEffect}`,
          verdict.allowed ? (verdict.approvalRequired ? "warn" : "ok") : "bad");
        if (verdict.reasons.length) kv(body, "↳ دلیل", verdict.reasons.join(" | "));
      }
      break;
    }
    case "evidence": {
      const a = d.audit;
      const body = card("قاعده شواهد", a.accepted ? "پذیرفته شد" : "رد شد", a.accepted ? "ok" : "bad");
      kv(body, "ادعا", d.claimedStatus);
      kv(body, "بدون شواهد", d.withoutEvidence ? "بله" : "خیر", d.withoutEvidence ? "bad" : "ok");
      kv(body, "قابل تعمیر", a.repairable ? "بله" : "خیر");
      if (a.violations.length) pre(body, a.violations);
      kv(body, "قاعده", d.rule);
      break;
    }
    case "deploy": {
      const body = card("تصویب استقرار", d.approvalValid ? "معتبر" : "نامعتبر",
        d.approvalValid ? "ok" : "bad");
      kv(body, "نتیجه", d.reason, d.approvalValid ? "ok" : "bad");
      kv(body, "نکته", d.note);
      break;
    }
    default: {
      const body = card(d.stage || "رویداد", "", "muted");
      pre(body, d);
    }
  }
}

// ── controls ────────────────────────────────────────────────────────────────

document.querySelectorAll("#mode button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#mode button").forEach((b) => b.classList.remove("on"));
    btn.classList.add("on");
    mode = btn.dataset.mode;
  });
});

$("start").addEventListener("click", async () => {
  timeline.innerHTML = "";
  $("start").disabled = true;
  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      computeMode: mode,
      privacyLevel: $("privacy").value,
      injectSecret: $("injectSecret").checked,
      injectPromptInjection: $("injectPromptInjection").checked,
      claimWithoutEvidence: $("claimWithoutEvidence").checked,
      rateLimitProvider: $("rateLimitProvider").checked,
      idempotencyKey: `run-${Date.now()}`,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const body = card("درخواست رد شد", String(res.status), "bad");
    pre(body, data);
  }
  setTimeout(() => { $("start").disabled = false; }, 3000);
});

$("reset").addEventListener("click", () => fetch("/api/reset", { method: "POST" }));

$("approve").addEventListener("click", () => {
  fetch("/api/approval", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "approve" }),
  });
});
$("reject").addEventListener("click", () => {
  fetch("/api/approval", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "reject" }),
  });
});

// ── settings ────────────────────────────────────────────────────────────────

function settingsPatch() {
  return {
    security: {
      autonomyCeiling: $("autonomy").value,
      requireMfaForApproval: $("mfa").checked,
      requireApprovalForDeploy: $("deployApproval").checked,
    },
    execution: {
      perRunTokenBudget: Number($("budget").value),
      routingStrategy: $("strategy").value,
    },
    connectors: { allowRawPasswordAuth: $("rawPassword").checked },
  };
}

function renderResolutions(resolutions, issues) {
  const box = $("settingsResult");
  box.innerHTML = "";
  const refused = resolutions.filter((r) => r.refused);
  if (issues && issues.length) {
    const body = card("خطای اعتبارسنجی", `${issues.length} مورد`, "bad");
    for (const i of issues) kv(body, i.path, i.problem, "bad");
  }
  if (refused.length) {
    const body = card("درخواست‌های رد شده", `${refused.length} مورد`, "bad");
    for (const r of refused) {
      kv(body, r.path, `درخواست ${JSON.stringify(r.refused.requested)} از ${r.refused.scope} رد شد`, "bad");
      kv(body, "↳ دلیل", r.refused.reason);
    }
  } else {
    const body = card("تنظیمات اعمال شد", "بدون رد", "ok");
    kv(body, "هش", $("hash").textContent);
  }
}

$("applySettings").addEventListener("click", async () => {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project: settingsPatch() }),
  });
  const d = await res.json();
  if (!res.ok) {
    const body = card("رد شد", String(res.status), "bad");
    kv(body, "دلیل", d.reason || "—", "bad");
    return;
  }
  renderResolutions(d.resolutions, d.issues);
});

$("loosenAll").addEventListener("click", async () => {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project: {
        security: {
          autonomyCeiling: "full",
          requireMfaForApproval: false,
          requireApprovalForDeploy: false,
          blockOnUnredactedSecrets: false,
          sessionTtlMinutes: 100000,
        },
        execution: { hardStopTokens: 999999999, perRunTokenBudget: 999999999, maxParallelTasks: 64 },
        quality: { requireEvidenceForCompletion: false },
        connectors: { allowRawPasswordAuth: true, oauthPkceRequired: false },
        retention: { allowAuditLogDeletion: true, auditLogRetentionDays: 1 },
      },
    }),
  });
  const d = await res.json();
  renderResolutions(d.resolutions, d.issues);
});

// ── security probes ─────────────────────────────────────────────────────────

document.querySelectorAll("[data-probe]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const probe = btn.dataset.probe;
    const payload = { probe };
    if (probe === "csrf") {
      payload.cookieToken = "abc123";
      payload.headerToken = "wrong-token";
      payload.method = "POST";
    }
    if (probe === "tenant") payload.rowOrg = "org_attacker";
    const res = await fetch("/api/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    const box = $("securityResult");
    const body = card(`کاوش: ${probe}`, d.verdict ? (d.verdict.allowed ? "موفق" : "خنثی شد") : d.outcome === "denied" ? "خنثی شد" : "اجرا شد",
      (d.verdict && d.verdict.allowed) || d.outcome === "allowed" ? "bad" : "ok");
    pre(body, d);
    box.appendChild(body.parentElement || body);
  });
});

// ── initial state ───────────────────────────────────────────────────────────

fetch("/api/state")
  .then((r) => r.json())
  .then((d) => {
    $("hash").textContent = `settings: ${d.settingsHash}`;
    $("chain").textContent = `audit: ${d.auditCount} رویداد`;
    $("goal").textContent = `پلن نمونه: ${d.plan.goal} (${d.plan.taskCount} تسک)`;

    const box = $("threats");
    box.innerHTML = "";
    const strideFa = { S: "جعل", T: "دستکاری", R: "انکار", I: "افشای اطلاعات", D: "محروم‌سازی", E: "ارتقای دسترسی" };
    for (const t of d.threats) {
      const row = el("div", "threat");
      row.appendChild(pill(`${t.stride} · ${strideFa[t.stride]}`, "warn"));
      const txt = el("div", "threat-txt");
      txt.appendChild(el("b", "", t.threat));
      txt.appendChild(el("div", "muted", `کنترل: ${t.control}`));
      txt.appendChild(el("div", "muted mono", `اجرا توسط: ${t.enforcedBy}`));
      row.appendChild(txt);
      box.appendChild(row);
    }
  });
