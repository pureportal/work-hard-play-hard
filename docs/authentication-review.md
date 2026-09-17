# Authentication review

Password login, magic-link login, invitations, registration, and password recovery were reviewed together.

The changes add password recovery and email verification for public registrations, including domain exemptions. First-owner setup and registrations with a valid invitation retain their direct account-creation flow. Registration policy and default roles are checked again when verification completes.

Reset and verification tokens contain 32 random bytes, expire after 15 minutes, and are stored as SHA-256 hashes. Reset, registration, and sign-in tokens have separate purposes. Reset completion changes the password, revokes existing sessions and magic links, closes active realtime connections, and sends a password-change notification. The user signs in afterward.

Authentication mutations are serialized and become visible only after persistence succeeds. Tests cover concurrent token redemption, failed saves, expiry, rotation, and persistence across restarts. New passwords use scrypt with N=32768, r=8, p=3 and random salts.

Magic-link and recovery requests return a generic response before account lookup and SMTP delivery. Delivery failures are logged and their tokens revoked. Requests are limited by IP and normalized email; reset-token verification is also limited. Production responses do not expose authentication or invitation links, even if test exposure options are supplied.

Invitation issuance and revocation are persisted before acknowledgment. Failed overlapping deliveries cannot reactivate superseded invitations. Existing checks enforce the invited email, expiry, single use, registration policy, and the inviter's role authority.

Browser tokens are removed from the address bar, retained in history state only while needed for recovery after reload, and cleared after use. The client sends a no-referrer policy. Cross-origin requests are restricted, including cross-site requests with no Origin header. Production cookies are HttpOnly and Secure; SameSite=None supports the packaged clients and configured separate client origins.

SMTP requires implicit TLS or STARTTLS. Configure SMTP before enabling public registration or offering email sign-in, invitations, and password recovery. Production client URLs must use HTTPS, with HTTP permitted for loopback development installations. Create the first owner before exposing a fresh installation publicly.

Validation passed for server and client authentication tests, realtime session revocation, an isolated PostgreSQL migration and repository round trip, and the complete browser flow in `scripts/auth-invite-e2e.ts`. Server and client type checks, lint of the changed files, the server build, and direct Vite bundling passed. `pnpm audit --prod --audit-level=high` reported no known vulnerabilities. Mobile screenshots were reviewed in `artifacts/auth-review/`.

Deployment limits: authentication state and rate limits are held by one application process, so this architecture assumes a single server instance. Production SMTP delivery and deployed TLS/proxy configuration require deployment verification. The password policy remains 8–128 characters; this review does not add MFA or compromised-password screening. The normal client build also depends on completing the separate character-image inventory changes present in the workspace during this review.

Security references: [OWASP password recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) and [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
