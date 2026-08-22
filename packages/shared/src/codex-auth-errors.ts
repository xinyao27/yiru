const CODEX_AUTH_ERROR_PATTERNS = [
  /access token could not be refreshed/i,
  /authentication session could not be refreshed/i,
  /refresh token (?:has expired|was already used|was revoked)/i,
  /you have since logged out or signed in to another account/i,
  /please (?:log out and )?sign in again/i,
  /please reauthenticate/i,
  /not logged in/i,
  /token data is not available/i,
  /auth (?:is missing|tokens are missing|does not expose)/i,
  // Why: app-server rejects account/rateLimits/read with this when auth.json
  // holds only an API key. Classifying it lets the UI ask for a ChatGPT sign-in
  // instead of showing a bare protocol error.
  /chatgpt authentication required/i
]

export function isCodexAuthError(error: string | null | undefined): boolean {
  const message = error?.trim()
  if (!message) {
    return false
  }
  return CODEX_AUTH_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}
