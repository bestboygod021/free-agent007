import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, ShieldAlert, Cpu, Cloud, Lock } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useI18n } from '@/i18n'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

/**
 * ForgePilot — the deterministic agent kernel merged in from the `code-agent`
 * blueprint. This page surfaces the decisions the *code* makes (never the
 * model): which compute mode is active, what each mode permits, which run
 * states exist, and which versioned prompts ship with the platform.
 *
 * Everything here is read-only and served by GET /api/agent/*.
 */

type ComputeMode = 'free' | 'paid' | 'local'

interface ModeProfile {
  mode: ComputeMode
  labelFa: string
  summaryFa: string
  providerPolicy: {
    allowLocal: boolean
    allowCloudFreeTier: boolean
    allowPaidCloud: boolean
    maxRelativeCost: number
    allowTrainOnInput: boolean
    maxCloudPrivacyLevel: string
    requiresCloudConsent: boolean
    requiresByok: boolean
  }
  budget: {
    perRunTokens: number
    perDayTokensPerUser: number
    hardStopTokens: number
    maxCostPerRun: number
  }
  execution: {
    maxRepairAttempts: number
    maxParallelTasks: number
    sandboxTimeoutSeconds: number
    qualityGates: readonly string[]
    allowPreview: boolean
    allowBrowserAutomation: boolean
  }
  disabledCapabilities: readonly string[]
  warningsFa: readonly string[]
}

interface ModesResponse {
  modes: Array<{ mode: ComputeMode; profile: ModeProfile; descriptionFa: string }>
}

interface StatesResponse {
  states: string[]
  terminal: string[]
  initialState: string
}

interface PromptsResponse {
  count: number
  prompts: Array<{ file: string; meta: Record<string, unknown> }>
}

const MODE_ICON: Record<ComputeMode, typeof Cpu> = {
  free: Cloud,
  paid: Cloud,
  local: Cpu,
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`
  return String(n)
}

export default function ForgePilotPage() {
  const { t } = useI18n()
  const [selected, setSelected] = useState<ComputeMode>('free')

  const { data: modesData, isLoading: modesLoading } = useQuery<ModesResponse>({
    queryKey: ['agent-modes'],
    queryFn: () => apiFetch<ModesResponse>('/api/agent/modes'),
  })

  const { data: statesData } = useQuery<StatesResponse>({
    queryKey: ['agent-states'],
    queryFn: () => apiFetch<StatesResponse>('/api/agent/states'),
  })

  const { data: promptsData } = useQuery<PromptsResponse>({
    queryKey: ['agent-prompts'],
    queryFn: () => apiFetch<PromptsResponse>('/api/agent/prompts'),
  })

  const active = modesData?.modes.find((m) => m.mode === selected)

  return (
    <div>
      <PageHeader
        title={t('forgepilot.title')}
        description={t('forgepilot.description')}
      />

      {/* Compute mode switch — everything else is configured from this. */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(['free', 'paid', 'local'] as ComputeMode[]).map((mode) => {
          const Icon = MODE_ICON[mode]
          const isActive = selected === mode
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setSelected(mode)}
              className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-muted'
              }`}
              aria-pressed={isActive}
            >
              <Icon className="size-4" />
              {t(`forgepilot.mode.${mode}`)}
            </button>
          )
        })}
      </div>

      {modesLoading && (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      )}

      {active && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="size-4" />
                {t('forgepilot.providerPolicy')}
              </CardTitle>
              <CardDescription>{t('forgepilot.providerPolicyHint')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row
                label={t('forgepilot.allowLocal')}
                value={active.profile.providerPolicy.allowLocal}
              />
              <Row
                label={t('forgepilot.allowFreeCloud')}
                value={active.profile.providerPolicy.allowCloudFreeTier}
              />
              <Row
                label={t('forgepilot.allowPaidCloud')}
                value={active.profile.providerPolicy.allowPaidCloud}
              />
              <Row
                label={t('forgepilot.allowTraining')}
                value={active.profile.providerPolicy.allowTrainOnInput}
              />
              <div className="flex items-center justify-between pt-1">
                <span className="text-muted-foreground">
                  {t('forgepilot.cloudPrivacyCeiling')}
                </span>
                <Badge variant="secondary">
                  {active.profile.providerPolicy.maxCloudPrivacyLevel}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('forgepilot.budget')}</CardTitle>
              <CardDescription>{t('forgepilot.budgetHint')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('forgepilot.perRun')}</span>
                <span className="font-mono">
                  {formatTokens(active.profile.budget.perRunTokens)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('forgepilot.perDay')}</span>
                <span className="font-mono">
                  {formatTokens(active.profile.budget.perDayTokensPerUser)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('forgepilot.hardStop')}</span>
                <span className="font-mono">
                  {formatTokens(active.profile.budget.hardStopTokens)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('forgepilot.maxCost')}</span>
                <span className="font-mono">${active.profile.budget.maxCostPerRun}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('forgepilot.execution')}</CardTitle>
              <CardDescription>{t('forgepilot.executionHint')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('forgepilot.parallelTasks')}</span>
                <span className="font-mono">{active.profile.execution.maxParallelTasks}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('forgepilot.repairAttempts')}</span>
                <span className="font-mono">{active.profile.execution.maxRepairAttempts}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('forgepilot.sandboxTimeout')}</span>
                <span className="font-mono">
                  {active.profile.execution.sandboxTimeoutSeconds}s
                </span>
              </div>
              <div className="pt-1">
                <span className="text-muted-foreground">{t('forgepilot.qualityGates')}</span>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {active.profile.execution.qualityGates.map((gate) => (
                    <Badge key={gate} variant="outline" className="font-normal">
                      {gate}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {active && active.profile.disabledCapabilities.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4" />
              {t('forgepilot.disabledCapabilities')}
            </CardTitle>
            <CardDescription>{t('forgepilot.disabledHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {active.profile.disabledCapabilities.map((cap) => (
                <Badge key={cap} variant="destructive" className="font-normal">
                  {cap}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('forgepilot.runStates')}</CardTitle>
            <CardDescription>{t('forgepilot.runStatesHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {statesData?.states.map((state) => (
                <Badge
                  key={state}
                  variant={statesData.terminal.includes(state) ? 'secondary' : 'outline'}
                  className="font-mono text-xs font-normal"
                >
                  {state}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" />
              {t('forgepilot.promptLibrary')}
            </CardTitle>
            <CardDescription>
              {t('forgepilot.promptLibraryHint', { count: String(promptsData?.count ?? 0) })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {promptsData?.prompts.map((p) => (
                <li key={p.file} className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs truncate">{p.file}</span>
                  {typeof p.meta.version === 'string' && (
                    <Badge variant="outline" className="font-normal shrink-0">
                      v{p.meta.version}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <Badge variant={value ? 'default' : 'secondary'} className="font-normal">
        {value ? '✓' : '✕'}
      </Badge>
    </div>
  )
}
