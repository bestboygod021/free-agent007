// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/i18n'
import { apiFetch } from '@/lib/api'
import ForgePilotPage from '@/pages/ForgePilotPage'

/**
 * The ForgePilot page reads three kernel endpoints and renders the compute
 * mode the operator selects. These tests prove the page actually mounts, that
 * switching modes re-reads the right profile (rather than showing the free
 * profile under a "Paid" label), and that every i18n key it uses resolves —
 * a missing key renders as the raw key string, which is easy to ship by
 * accident and impossible to see in a passing typecheck.
 */

const profile = (
  mode: 'free' | 'paid' | 'local',
  overrides: Record<string, unknown> = {},
) => ({
  mode,
  labelFa: mode,
  summaryFa: mode,
  providerPolicy: {
    allowLocal: true,
    allowCloudFreeTier: mode !== 'local',
    allowPaidCloud: mode === 'paid',
    maxRelativeCost: mode === 'paid' ? 100 : 0,
    allowTrainOnInput: false,
    maxCloudPrivacyLevel: mode === 'local' ? 'confidential' : 'internal',
    requiresCloudConsent: true,
    requiresByok: mode === 'paid',
  },
  budget: {
    perRunTokens: 100_000,
    perDayTokensPerUser: 1_000_000,
    hardStopTokens: 2_000_000,
    maxCostPerRun: mode === 'paid' ? 1000 : 0,
  },
  execution: {
    maxRepairAttempts: 2,
    maxParallelTasks: mode === 'paid' ? 4 : 2,
    sandboxTimeoutSeconds: 300,
    qualityGates: mode === 'paid' ? ['lint', 'test', 'a11y'] : ['lint', 'test'],
    allowPreview: true,
    allowBrowserAutomation: mode !== 'local',
  },
  disabledCapabilities: mode === 'free' ? ['paid_models'] : [],
  warningsFa: [],
  ...overrides,
})

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }))

let root: Root
let container: HTMLDivElement
let client: QueryClient

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  vi.mocked(apiFetch).mockReset().mockImplementation(async (path: string) => {
    if (path === '/api/agent/modes') {
      return {
        modes: (['free', 'paid', 'local'] as const).map(m => ({
          mode: m,
          profile: profile(m),
          descriptionFa: `${m} description`,
        })),
      }
    }
    if (path === '/api/agent/states') {
      return {
        states: ['INTAKE', 'PLAN', 'DONE', 'FAILED'],
        terminal: ['DONE', 'FAILED', 'CANCELLED'],
        initialState: 'INTAKE',
      }
    }
    if (path === '/api/agent/prompts') {
      return {
        count: 13,
        prompts: [
          { file: '00-orchestrator.md', meta: { version: '1.1.0', role: 'Orchestrator' } },
          { file: '05-coding-agent.md', meta: { version: '1.1.0', role: 'Software Engineer' } },
        ],
      }
    }
    throw new Error(`unexpected path: ${path}`)
  })

  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  client.clear()
  container.remove()
})

async function flush() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })
  }
}

async function mount() {
  act(() =>
    root.render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <I18nProvider initialLocale="en">
            <ForgePilotPage />
          </I18nProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    ),
  )
  await flush()
}

it('renders the kernel surface and defaults to the free mode', async () => {
  await mount()

  expect(container.textContent).toContain('ForgePilot agent kernel')
  // free mode ships a disabled capability, so that card must be present
  expect(container.textContent).toContain('Disabled capabilities')
  expect(container.textContent).toContain('paid_models')
  // $0 per run in free mode
  expect(container.textContent).toContain('$0')
})

it('switches the rendered profile when another compute mode is picked', async () => {
  await mount()
  expect(container.textContent).toContain('$0')

  const paid = [...container.querySelectorAll('button')].find(b => b.textContent === 'Paid')
  expect(paid).toBeDefined()
  act(() => paid!.click())
  await flush()

  // the paid profile's ceiling and its extra quality gate
  expect(container.textContent).toContain('$1000')
  expect(container.textContent).toContain('a11y')
  // and the free-only disabled capability is gone
  expect(container.textContent).not.toContain('paid_models')
})

it('lists run states and the prompt library', async () => {
  await mount()

  expect(container.textContent).toContain('INTAKE')
  expect(container.textContent).toContain('DONE')
  expect(container.textContent).toContain('00-orchestrator.md')
  expect(container.textContent).toContain('v1.1.0')
  // the {count} placeholder must interpolate, not render literally
  expect(container.textContent).toContain('13 versioned agent prompts')
  expect(container.textContent).not.toContain('{count}')
})

it('resolves every i18n key it renders', async () => {
  await mount()

  // A missing key renders as the dotted key itself. Nothing on the page
  // should look like "forgepilot.something" or "common.something".
  expect(container.textContent).not.toMatch(/forgepilot\.[a-zA-Z.]+/)
  expect(container.textContent).not.toMatch(/\bnav\.[a-zA-Z]+/)
})
