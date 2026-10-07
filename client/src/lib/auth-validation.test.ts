import { describe, it, expect } from 'vitest'
import { PASSWORD_MIN_LENGTH, loginInputSchema, signupInputSchema } from '../../../shared/schemas'
import { authErrors } from './auth-validation'

describe('authErrors (shared-contract-driven form rules)', () => {
  it('setup: rejects a malformed email and a short password, field by field', () => {
    expect(authErrors('setup', 'not-an-email', 'longenough1')).toEqual({
      email: 'invalidEmail',
      password: null,
    })
    expect(authErrors('setup', 'contract@local.dev', 'short')).toEqual({
      email: null,
      password: 'passwordTooShort',
    })
  })

  it('setup: empty fields are "required", not format errors', () => {
    expect(authErrors('setup', '', 'longenough1').email).toBe('required')
    expect(authErrors('setup', 'contract@local.dev', '').password).toBe('required')
    expect(authErrors('setup', '   ', 'longenough1').email).toBe('required')
  })

  it('setup: the floor boundary matches the shared schema exactly', () => {
    const exact = 'a'.repeat(PASSWORD_MIN_LENGTH)
    expect(authErrors('setup', 'a@b.co', exact).password).toBeNull()
    expect(authErrors('setup', 'a@b.co', 'a'.repeat(PASSWORD_MIN_LENGTH - 1)).password).toBe('passwordTooShort')

    // Same boundary on the schema itself: the form and the contract cannot
    // disagree about what "too short" means.
    expect(signupInputSchema.safeParse({ email: 'a@b.co', password: exact }).success).toBe(true)
    expect(signupInputSchema.safeParse({ email: 'a@b.co', password: 'a'.repeat(PASSWORD_MIN_LENGTH - 1) }).success).toBe(false)
  })

  it('login: presence-only — desktop@localhost and short passwords pass (#807/#1250)', () => {
    expect(authErrors('login', 'desktop@localhost', 'x')).toEqual({ email: null, password: null })
    expect(authErrors('login', 'legacy@local.dev', 'short')).toEqual({ email: null, password: null })

    // The shared login contract agrees: no format check, no floor.
    expect(loginInputSchema.safeParse({ email: 'desktop@localhost', password: 'x' }).success).toBe(true)
  })

  it('login: empty fields are still "required" client-side', () => {
    expect(authErrors('login', '', 'x').email).toBe('required')
    expect(authErrors('login', 'someone@local.dev', '').password).toBe('required')
  })

  it('format disagreement with the shared signup schema: none on the cases users hit', () => {
    // The setup form must block exactly what signupInputSchema blocks: no
    // "valid-looking" address the server would reject at the schema layer.
    const samples = ['plain', 'a@b', 'a@.b', 'a b@c.de', 'trailing@dot.', '@no-local.com', 'weird@-leading-hyphen.example', 'ok@example.com', 'user.name+tag@sub.domain.io']
    for (const email of samples) {
      const formBlocks = authErrors('setup', email, 'longenough1').email === 'invalidEmail'
      const schemaBlocks = !signupInputSchema.shape.email.safeParse(email).success
      expect(formBlocks, `email ${JSON.stringify(email)}: form=${formBlocks} schema=${schemaBlocks}`).toBe(schemaBlocks)
    }
  })
})
