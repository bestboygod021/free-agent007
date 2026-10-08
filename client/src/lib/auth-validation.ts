// Field-level validation codes for the auth form (login + first-run setup).
//
// The RULES come from the shared zod schemas — the very objects the dual-sample
// contract tests pin to the server — so the form can never drift from what the
// API will accept. Only the wording is chosen by the caller, via i18n keys;
// the server's English messages stay a server concern.
//
// Login deliberately checks presence only: the server MATCHES addresses rather
// than validating their format (the seeded desktop@localhost account has no
// TLD — #807/#1250), so the form must not block what the API accepts.
import {
  changeEmailInputSchema,
  changePasswordInputSchema,
  resetPasswordInputSchema,
  signupInputSchema,
} from '../../../shared/schemas'

export type AuthMode = 'setup' | 'login'
export type AuthFieldErrorCode = 'required' | 'invalidEmail' | 'passwordTooShort' | null

export type AuthFieldErrors = {
  email: AuthFieldErrorCode
  password: AuthFieldErrorCode
}

export function authErrors(mode: AuthMode, email: string, password: string): AuthFieldErrors {
  // Whitespace-only addresses count as empty on both modes (UX); everything
  // else is the shared schema's call.
  const emailCode = !email.trim()
    ? 'required'
    : mode === 'setup' && !signupInputSchema.shape.email.safeParse(email).success
      ? 'invalidEmail'
      : null

  // The floor (and its absence on login) comes straight from the schema: setup
  // mirrors signupInputSchema.password, login mirrors loginInputSchema's
  // presence-only rule.
  const passwordCode = !password
    ? 'required'
    : mode === 'setup' && !signupInputSchema.shape.password.safeParse(password).success
      ? 'passwordTooShort'
      : null

  return { email: emailCode, password: passwordCode }
}

export type CredentialMode = 'password' | 'email'

export type CredentialFieldErrors = {
  current: AuthFieldErrorCode
  value: AuthFieldErrorCode
}

/**
 * Field codes for the change-credentials modal — same contract-first approach
 * as authErrors(): the password floor and the email shape come from the shared
 * changePasswordInputSchema/changeEmailInputSchema, not from hand-rolled
 * checks beside them. The reset flow shares the floor via
 * resetPasswordInputSchema (asserted in the tests).
 */
export function credentialErrors(mode: CredentialMode, currentPassword: string, value: string): CredentialFieldErrors {
  const current = !currentPassword ? 'required' : null

  const valueCode = !value.trim()
    ? 'required'
    : mode === 'password'
      ? (!changePasswordInputSchema.shape.newPassword.safeParse(value).success ? 'passwordTooShort' : null)
      : (!changeEmailInputSchema.shape.newEmail.safeParse(value).success ? 'invalidEmail' : null)

  return { current, value: valueCode }
}

/** The reset form's floor, straight from the shared reset contract. */
export function resetPasswordTooShort(newPassword: string): boolean {
  return !resetPasswordInputSchema.shape.newPassword.safeParse(newPassword).success
}
