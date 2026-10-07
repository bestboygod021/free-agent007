// The monthly-budget legend: one flat list of models, smartest first.
//
// It used to nest model rows under provider pool headers (#1010), which read
// as "arranged by provider" — the first thing on the Models page and the one
// place it was grouped that way. The legend is back to models only, ordered by
// intelligence so the top of the list is what the router reaches for first
// under the smartest strategy. Pool-level quota readings live on each model's
// own page.

/** The subset of a wire model row the legend renders. Kept explicit (rather
 *  than derived from the full server row) because unranked models are legal
 *  here — they sort last — and the legend never shows the rate-limit lanes. */
export type LegendModel = {
  displayName: string
  platform: string
  modelId?: string
  intelligenceRank?: number
  budget: number
  used?: number
}

export type LegendRow = LegendModel & {
  usedTokens: number
  remainingTokens: number
  /** Share of the whole budget this model's remaining allowance is. */
  widthPct: number
}

export type BudgetLegend = {
  /** Rows with a budget to show, smartest first. */
  rows: LegendRow[]
  /** Rows with no published quota, folded into the "+N" summary line. */
  unpublishedCount: number
}

/** Smartest first (rank 1 = smartest). Rows without a rank sort last, and the
 *  incoming order is kept as the tiebreaker so equal ranks stay stable. */
export function sortByIntelligence<T extends { intelligenceRank?: number }>(models: readonly T[]): T[] {
  const rank = (m: T) => (typeof m.intelligenceRank === 'number' && Number.isFinite(m.intelligenceRank)
    ? m.intelligenceRank
    : Number.POSITIVE_INFINITY)
  return models
    .map((m, i) => ({ m, i }))
    .sort((a, b) => rank(a.m) - rank(b.m) || a.i - b.i)
    .map(({ m }) => m)
}

export function buildBudgetLegend(models: readonly LegendModel[], totalBudget: number): BudgetLegend {
  const ordered = sortByIntelligence(models)
  const rows: LegendRow[] = []
  let unpublishedCount = 0
  for (const m of ordered) {
    const usedTokens = m.used ?? 0
    const remainingTokens = Math.max(0, m.budget - usedTokens)
    if (m.budget <= 0) {
      unpublishedCount += 1
      continue
    }
    rows.push({
      ...m,
      usedTokens,
      remainingTokens,
      widthPct: totalBudget > 0 ? (remainingTokens / totalBudget) * 100 : 0,
    })
  }
  return { rows, unpublishedCount }
}
