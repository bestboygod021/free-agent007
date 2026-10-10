import { describe, expect, it } from 'vitest'
import { keysTutorialId, TAB_TUTORIALS, tutorialIdForPath } from './tab-tutorials'

describe('tutorialIdForPath', () => {
  it.each([
    ['/models/chat', 'models.chat'],
    ['/models/fusion', 'models.fusion'],
    ['/models/embeddings', 'models.embeddings'],
    ['/models/image', 'models.image'],
    ['/models/video', 'models.video'],
    ['/models/audio', 'models.audio'],
    ['/models/chat/model-name', 'models.chat-detail'],
    ['/models/embeddings/family-name', 'models.embeddings-detail'],
    ['/models/image/model-name', 'models.media-detail'],
    ['/models/audio/model-name', 'models.media-detail'],
    ['/models/transcription/model-name', 'models.media-detail'],
    ['/playground', 'playground'],
    ['/keys', 'keys.providers'],
    ['/agents', 'agents'],
    ['/forgepilot', 'forgepilot'],
    ['/analytics', 'analytics'],
    ['/logs', 'logs'],
    ['/premium', 'premium'],
  ] as const)('maps %s to %s', (path, expected) => {
    expect(tutorialIdForPath(path)).toBe(expected)
  })

  it('matches a route nested beneath an application base path and ignores a trailing slash', () => {
    expect(tutorialIdForPath('/dashboard/models/fusion/?source=nav')).toBe('models.fusion')
  })

  it('returns no tutorial for unrelated paths', () => {
    expect(tutorialIdForPath('/not-a-dashboard-page')).toBeNull()
  })

  it.each([
    ['providers', 'keys.providers'],
    ['quotaSignals', 'keys.quotaSignals'],
    ['apiKey', 'keys.apiKey'],
    ['anthropic', 'keys.anthropic'],
    ['agents', 'keys.agents'],
  ] as const)('resolves the %s Keys sub-tab', (tab, expected) => {
    expect(keysTutorialId(tab)).toBe(expected)
  })
})

describe('tab tutorial content', () => {
  it('provides actionable bilingual steps and a result for every tutorial', () => {
    for (const tutorial of Object.values(TAB_TUTORIALS)) {
      expect(tutorial.steps.length).toBeGreaterThanOrEqual(3)
      expect(tutorial.page.fa.trim()).not.toBe('')
      expect(tutorial.page.en.trim()).not.toBe('')
      expect(tutorial.outcome.fa.trim()).not.toBe('')
      expect(tutorial.outcome.en.trim()).not.toBe('')
      for (const item of tutorial.steps) {
        expect(item.title.fa.trim()).not.toBe('')
        expect(item.title.en.trim()).not.toBe('')
        expect(item.where.fa.trim()).not.toBe('')
        expect(item.where.en.trim()).not.toBe('')
        expect(item.action.fa.trim()).not.toBe('')
        expect(item.action.en.trim()).not.toBe('')
        expect(item.expect.fa.trim()).not.toBe('')
        expect(item.expect.en.trim()).not.toBe('')
      }
    }
  })
})
