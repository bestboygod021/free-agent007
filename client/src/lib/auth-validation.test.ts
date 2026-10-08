import { describe, it, expect } from 'vitest'
import {
  PASSWORD_MIN_LENGTH,
  changeEmailInputSchema,
  changePasswordInputSchema,
  loginInputSchema,
  resetPasswordInputSchema,
  signupInputSchema,
} from '../../../shared/schemas'
import { authErrors, credentialErrors, resetPasswordTooShort } from './auth-validation'

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

describe('credentialErrors (change-credentials modal, shared contract)', () => {
  it('password mode: current required, floor identical to changePasswordInputSchema', () => {
    expect(credentialErrors('password', '', 'longenough1').current).toBe('required')
    expect(credentialErrors('password', 'password123', '').value).toBe('required')

    const exact = 'a'.repeat(PASSWORD_MIN_LENGTH)
    expect(credentialErrors('password', 'password123', exact).value).toBeNull()
    expect(credentialErrors('password', 'password123', 'a'.repeat(PASSWORD_MIN_LENGTH - 1)).value).toBe('passwordTooShort')
    expect(changePasswordInputSchema.safeParse({ currentPassword: 'password123', newPassword: exact }).success).toBe(true)
    expect(changePasswordInputSchema.safeParse({ currentPassword: 'password123', newPassword: 'a'.repeat(PASSWORD_MIN_LENGTH - 1) }).success).toBe(false)
  })

  it('email mode: format identical to changeEmailInputSchema', () => {
    expect(credentialErrors('email', 'password123', 'ok@example.com').value).toBeNull()
    expect(credentialErrors('email', 'password123', 'not-an-email').value).toBe('invalidEmail')
    expect(credentialErrors('email', 'password123', '   ').value).toBe('required')
    expect(changeEmailInputSchema.safeParse({ currentPassword: 'password123', newEmail: 'ok@example.com' }).success).toBe(true)
    expect(changeEmailInputSchema.safeParse({ currentPassword: 'password123', newEmail: 'not-an-email' }).success).toBe(false)
  })
})

describe('resetPasswordTooShort (forgot/reset form, shared contract)', () => {
  it('floor matches resetPasswordInputSchema exactly, including the boundary', () => {
    const exact = 'a'.repeat(PASSWORD_MIN_LENGTH)
    expect(resetPasswordTooShort(exact)).toBe(false)
    expect(resetPasswordTooShort('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe(true)
    expect(resetPasswordTooShort('')).toBe(true) // the schema rejects empty as well; the form reports "required" first

    expect(resetPasswordInputSchema.safeParse({ resetCode: 'x', newPassword: exact }).success).toBe(true)
    expect(resetPasswordInputSchema.safeParse({ resetCode: 'x', newPassword: 'a'.repeat(PASSWORD_MIN_LENGTH - 1) }).success).toBe(false)
    expect(resetPasswordInputSchema.safeParse({ resetCode: '', newPassword: exact }).success).toBe(false)
  })
})
