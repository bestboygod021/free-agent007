import { readFileSync } from "node:fs";

/**
 * Gap register.
 *
 * The audit of "what is still missing" lives in `docs/gap-register.json`, not in
 * prose, so it cannot quietly rot: `docs/16-gap-analysis.md` is rendered from it
 * between markers, and `test/gap-register.test.ts` fails if the rendered tables
 * drift from the register or if an entry is malformed.
 *
 * Status vocabulary:
 *   done_tested   code exists and tests cover it
 *   partial       part of it exists, the decisive part does not
 *   designed_only documented in /docs, zero code
 *   missing       neither designed nor implemented
 */

export type GapStatus = "done_tested" | "partial" | "designed_only" | "missing";
export type GapSeverity = "blocker" | "high" | "medium" | "low";
export type GapMilestone = "M1" | "M2" | "M3" | "M4" | "M5" | "M6" | "M7" | "M9" | "M10" | "M11" | "M12" | "M13" | "M14" | "M15" | "M16" | "M17" | "M18" | "M119" | "M120" | "M121" | "M122" | "M123" | "M124" | "M125" | "M126" | "M127" | "M128" | "M129" | "M130" | "M131" | "M132" | "M133" | "M134" | "M135" | "M136" | "M137" | "M138" | "M139" | "M140" | "M141" | "M142" | "M143" | "M144" | "M145" | "M146" | "M147" | "M148" | "M149" | "M150" | "M151" | "M152" | "M153" | "M159" | "M160" | "M161" | "M162" | "M163" | "M164" | "M165" | "M166" | "M167" | "M168" | "M169" | "M170" | "M171" | "M172" | "M173" | "M174" | "M175" | "M176" | "M177" | "M178" | "M179" | "M180" | "M181" | "M182" | "M183" | "M184" | "M185" | "M186" | "M187" | "M188" | "M189" | "M190" | "M191" | "M192" | "M193" | "M194" | "M195" | "M196" | "M197" | "M198" | "M199" | "M200" | "M201" | "M202" | "M203" | "M204" | "M205" | "M206" | "M207" | "M208" | "POST";

export interface Gap {
  id: string;
  area: string;
  title: string;
  status: GapStatus;
  severity: GapSeverity;
  milestone: GapMilestone;
  why: string;
  closure: string;
}

export interface GapRegister {
  $id: string;
  generatedAt: string;
  baseline: Record<string, unknown>;
  /**
   * Paths named in `why` / `closure` that deliberately do not exist yet — they
   * are closure targets. Declaring them keeps the register honest in both
   * directions: the test fails if a cited path is neither real nor declared,
   * and it also fails once a declared path *appears* without the register being
   * updated, which is the signal to mark the gap closed.
   */
  plannedPaths: string[];
  statusVocabulary: Record<GapStatus, string>;
  severityVocabulary: Record<GapSeverity, string>;
  areas: Record<string, string>;
  gaps: Gap[];
}

const REGISTER_URL = new URL("../../docs/gap-register.json", import.meta.url);

export const MILESTONE_ORDER: readonly GapMilestone[] = [
  "M1",
  "M2",
  "M3",
  "M4",
  "M5",
  "M6",
  "M7",
  "M9",
  "M10",
  "M11",
  "M12",
  "M13",
  "M14",
  "M15",
  "M16",
  "M17",
  "M18",
  "M119",
  "M120",
  "M121",
  "M122",
  "M123",
  "M124",
  "M125",
  "M126",
  "M127",
  "M128",
  "M129",
  "M130",
  "M131",
  "M132",
  "M133",
  "M134",
  "M135",
  "M136",
  "M137",
  "M138",
  "M139",
  "M140",
  "M141",
  "M142",
  "M143",
  "M144",
  "M145",
  "M146",
  "M147",
  "M148",
  "M149",
  "M150",
  "M151",
  "M152",
  "M153",
  "M159",
  "M160",
  "M161",
  "M162",
  "M163",
  "M164",
  "M165",
  "M166",
  "M167",
  "M168",
  "M169",
  "M170",
  "M171",
  "M172",
  "M173",
  "M174",
  "M175",
  "M176",
  "M177",
  "M178",
  "M179",
  "M180",
  "M181",
  "M182",
  "M183",
  "M184",
  "M185",
  "M186",
  "M187",
  "M188",
  "M189",
  "M190",
  "M191",
  "M192",
  "M193",
  "M194",
  "M195",
  "M196",
  "M197",
  "M198",
  "M199",
  "M200",
  "M201",
  "M202",
  "M203",
  "M204",
  "M205",
  "M206",
  "M207",
  "M208",
  "POST",
];

const SEVERITY_ORDER: readonly GapSeverity[] = ["blocker", "high", "medium", "low"];

export function loadGapRegister(): GapRegister {
  return JSON.parse(readFileSync(REGISTER_URL, "utf8")) as GapRegister;
}

export interface RegisterProblem {
  gapId: string;
  problem: string;
}

/** Structural validation — used by the test suite as a lint on the register. */
export function validateRegister(register: GapRegister): RegisterProblem[] {
  const problems: RegisterProblem[] = [];
  const seen = new Set<string>();

  for (const gap of register.gaps) {
    if (seen.has(gap.id)) {
      problems.push({ gapId: gap.id, problem: "duplicate id" });
    }
    seen.add(gap.id);

    if (!/^GAP-[A-Z]{2,3}-\d{2}$/.test(gap.id)) {
      problems.push({ gapId: gap.id, problem: "id does not match GAP-XX-NN" });
    }
    if (!Object.prototype.hasOwnProperty.call(register.areas, gap.area)) {
      problems.push({ gapId: gap.id, problem: `unknown area "${gap.area}"` });
    }
    if (!Object.prototype.hasOwnProperty.call(register.statusVocabulary, gap.status)) {
      problems.push({ gapId: gap.id, problem: `unknown status "${gap.status}"` });
    }
    if (!Object.prototype.hasOwnProperty.call(register.severityVocabulary, gap.severity)) {
      problems.push({ gapId: gap.id, problem: `unknown severity "${gap.severity}"` });
    }
    if (!MILESTONE_ORDER.includes(gap.milestone)) {
      problems.push({ gapId: gap.id, problem: `unknown milestone "${gap.milestone}"` });
    }
    if (gap.title.trim().length < 8) {
      problems.push({ gapId: gap.id, problem: "title too short to be useful" });
    }
    if (gap.why.trim().length < 20) {
      problems.push({ gapId: gap.id, problem: "why must explain the consequence" });
    }
    if (gap.closure.trim().length < 10) {
      problems.push({ gapId: gap.id, problem: "closure must state what closes it" });
    }
    if (gap.status === "done_tested" && gap.severity === "blocker") {
      problems.push({
        gapId: gap.id,
        problem: "a done_tested item is not a gap; remove it from the register",
      });
    }
  }

  return problems;
}

export interface GapSummary {
  total: number;
  byStatus: Record<GapStatus, number>;
  bySeverity: Record<GapSeverity, number>;
  byMilestone: Record<string, number>;
  byArea: Array<{ area: string; label: string; count: number; blockers: number }>;
}

export function summarize(register: GapRegister): GapSummary {
  const byStatus = { done_tested: 0, partial: 0, designed_only: 0, missing: 0 };
  const bySeverity = { blocker: 0, high: 0, medium: 0, low: 0 };
  const byMilestone: Record<string, number> = {};
  const perArea = new Map<string, { count: number; blockers: number }>();

  for (const gap of register.gaps) {
    byStatus[gap.status] += 1;
    bySeverity[gap.severity] += 1;
    byMilestone[gap.milestone] = (byMilestone[gap.milestone] ?? 0) + 1;
    const entry = perArea.get(gap.area) ?? { count: 0, blockers: 0 };
    entry.count += 1;
    if (gap.severity === "blocker") entry.blockers += 1;
    perArea.set(gap.area, entry);
  }

  return {
    total: register.gaps.length,
    byStatus,
    bySeverity,
    byMilestone,
    byArea: Object.entries(register.areas).map(([area, label]) => ({
      area,
      label,
      count: perArea.get(area)?.count ?? 0,
      blockers: perArea.get(area)?.blockers ?? 0,
    })),
  };
}

const STATUS_MARK: Record<GapStatus, string> = {
  done_tested: "✅",
  partial: "🟡",
  designed_only: "📄",
  missing: "🔴",
};

const SEVERITY_FA: Record<GapSeverity, string> = {
  blocker: "بلوکر",
  high: "بالا",
  medium: "متوسط",
  low: "پایین",
};

const STATUS_FA: Record<GapStatus, string> = {
  done_tested: "انجام + تست",
  partial: "ناقص",
  designed_only: "فقط سند",
  missing: "غایب",
};

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** Persian numerals for prose counts; identifiers stay Latin. */
function fa(n: number): string {
  return String(n)
    .split("")
    .map((d) => FA_DIGITS[Number(d)] ?? d)
    .join("");
}

function sortedGaps(register: GapRegister): Gap[] {
  return [...register.gaps].sort((a, b) => {
    const sev = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    if (sev !== 0) return sev;
    const ms = MILESTONE_ORDER.indexOf(a.milestone) - MILESTONE_ORDER.indexOf(b.milestone);
    if (ms !== 0) return ms;
    return a.id.localeCompare(b.id);
  });
}

/** Rendered markdown for the analysis document. Deterministic. */
export function renderGapTables(register: GapRegister): string {
  const s = summarize(register);
  const lines: string[] = [];

  lines.push("## خلاصه شمارشی");
  lines.push("");
  lines.push(`**${fa(s.total)} شکاف** ثبت شده است.`);
  lines.push("");
  lines.push("| وضعیت | تعداد |");
  lines.push("|---|---|");
  for (const k of ["missing", "designed_only", "partial", "done_tested"] as const) {
    lines.push(
      `| ${STATUS_MARK[k]} ${STATUS_FA[k]} | ${fa(s.byStatus[k])} |`,
    );
  }
  lines.push("");
  lines.push("| شدت | تعداد |");
  lines.push("|---|---|");
  for (const k of SEVERITY_ORDER) {
    lines.push(`| ${SEVERITY_FA[k]} | ${fa(s.bySeverity[k])} |`);
  }
  lines.push("");
  lines.push("| ناحیه | شکاف | بلوکر |");
  lines.push("|---|---|---|");
  for (const a of s.byArea) {
    lines.push(`| ${a.label} | ${fa(a.count)} | ${fa(a.blockers)} |`);
  }
  lines.push("");
  lines.push("| مایلستون | تعداد |");
  lines.push("|---|---|");
  for (const m of MILESTONE_ORDER) {
    if (s.byMilestone[m]) lines.push(`| ${m} | ${fa(s.byMilestone[m])} |`);
  }
  lines.push("");

  for (const area of Object.keys(register.areas)) {
    const label = register.areas[area];
    const gaps = sortedGaps(register).filter((g) => g.area === area);
    if (gaps.length === 0) continue;
    lines.push(`## ${label}`);
    lines.push("");
    lines.push("| شناسه | شکاف | وضعیت | شدت | مایلستون |");
    lines.push("|---|---|---|---|---|");
    for (const g of gaps) {
      lines.push(
        `| \`${g.id}\` | ${g.title} | ${STATUS_MARK[g.status]} ${STATUS_FA[g.status]} | ${SEVERITY_FA[g.severity]} | ${g.milestone} |`,
      );
    }
    lines.push("");
    for (const g of gaps) {
      lines.push(`### \`${g.id}\` — ${g.title}`);
      lines.push("");
      lines.push(`**چرا مهم است:** ${g.why}`);
      lines.push("");
      lines.push(`**چه چیزی آن را می‌بندد:** ${g.closure}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

export const GAPS_START = "<!-- GAPS:START (generated from docs/gap-register.json — do not edit by hand) -->";
export const GAPS_END = "<!-- GAPS:END -->";

/** Replace the generated block inside the analysis document. */
export function injectGapTables(markdown: string, register: GapRegister): string {
  const start = markdown.indexOf(GAPS_START);
  const end = markdown.indexOf(GAPS_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      "docs/16-gap-analysis.md is missing the GAPS:START / GAPS:END markers",
    );
  }
  const before = markdown.slice(0, start + GAPS_START.length);
  const after = markdown.slice(end);
  return `${before}\n\n${renderGapTables(register)}\n${after}`;
}
