# Security Documentation

This document outlines the security measures implemented in LifePath Planner, particularly around user authentication and financial data protection.

---

## 1. Authentication

### 1.1 Authentication Methods

LifePath Planner supports multiple authentication methods:

| Method | Description | Security Features |
|--------|-------------|-------------------|
| **Email/Password** | Traditional credentials authentication | bcrypt hashing (12 rounds), password strength requirements |
| **Google OAuth** | Sign in with Google account | OAuth 2.0, no password stored locally |

### 1.2 Password Requirements

Passwords must meet the following criteria:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

### 1.3 Password Storage

- Passwords are hashed using **bcrypt** with 12 salt rounds
- Plain-text passwords are never stored or logged
- Password hashes use a one-way cryptographic function

```typescript
// Password hashing configuration
const BCRYPT_ROUNDS = 12;
const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
```

### 1.4 Session Management

- **JWT-based sessions**: Stateless, serverless-compatible
- **30-day session lifetime**: Configurable via `maxAge`
- **Secure cookies**: `httpOnly`, `sameSite: lax`
- **CSRF protection**: Built into NextAuth.js

```typescript
session: {
  strategy: 'jwt',
  maxAge: 30 * 24 * 60 * 60, // 30 days
}
```

---

## 2. Data Protection

### 2.1 Financial Data

| Data Type | Storage | Protection |
|-----------|---------|------------|
| Budget files | Parsed, stored as JSON | Not encrypted at rest (application-level) |
| User preferences | Database | Standard database security |
| Session data | JWT token | Signed, not encrypted |

### 2.2 Database Security

- **Vercel Postgres**: Managed database with encryption at rest
- **Connection pooling**: Single connection per request (serverless)
- **SSL/TLS**: Required for production connections

### 2.3 Data Retention

| Data Type | Retention |
|-----------|-----------|
| Budget sessions | Indefinite (user can delete) |
| Audit events | 90 days |
| User accounts | Until deletion requested |

---

## 3. API Security

### 3.1 Route Protection

Protected routes require authentication:

```typescript
// Protected routes
const protectedRoutes = [
  '/upload',
  '/clarify',
  '/summarize',
  '/settings',
];
```

Middleware automatically redirects unauthenticated users to `/login`.

### 3.2 API Authentication

API routes that require authentication check the session:

```typescript
const session = await auth();
if (!session?.user?.id) {
  return NextResponse.json(
    { error: 'unauthorized' },
    { status: 401 }
  );
}
```

### 3.3 Input Validation

- **Zod schemas**: Form validation on client and server
- **Type checking**: TypeScript throughout
- **Sanitization**: User input sanitized before storage

---

## 4. OAuth Security

### 4.1 Google OAuth Configuration

- Uses OAuth 2.0 authorization code flow
- Tokens stored securely in database
- Account linking enabled for existing users

### 4.2 Token Storage

OAuth tokens are stored in the `accounts` table:
- `access_token`: Encrypted at database level
- `refresh_token`: Encrypted at database level
- `id_token`: For OIDC verification

### 4.3 Google OAuth Setup Guide

Follow these steps to enable Google sign-in for LifePath Planner:

#### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project name for reference

#### Step 2: Configure OAuth Consent Screen

1. Navigate to **APIs & Services** → **OAuth consent screen**
2. Choose **External** user type (unless using Google Workspace)
3. Fill in the required fields:
   - **App name**: LifePath Planner
   - **User support email**: Your email
   - **Developer contact email**: Your email
4. Add scopes: `email`, `profile`, `openid`
5. Add test users if in development mode
6. Save and continue

#### Step 3: Create OAuth Credentials

1. Navigate to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Web application**
4. Configure:
   - **Name**: LifePath Planner Web Client
   - **Authorized JavaScript origins**:
     - `https://lifepath-planner.vercel.app`
     - `http://localhost:3000` (for development)
   - **Authorized redirect URIs**:
     - `https://lifepath-planner.vercel.app/api/auth/callback/google`
     - `http://localhost:3000/api/auth/callback/google` (for development)
5. Click **Create**
6. Copy the **Client ID** and **Client Secret**

#### Step 4: Add Environment Variables to Vercel

Using the Vercel CLI or Dashboard, add these environment variables:

```bash
# Using Vercel CLI
vercel env add GOOGLE_CLIENT_ID
vercel env add GOOGLE_CLIENT_SECRET
```

Or via Vercel Dashboard:
1. Go to your project settings → **Environment Variables**
2. Add:
   - `GOOGLE_CLIENT_ID`: Your OAuth client ID
   - `GOOGLE_CLIENT_SECRET`: Your OAuth client secret
3. Set target environments: `production`, `preview`, `development`

#### Step 5: Local Development Setup

Create or update `.env.local` in `services/ui-web/`:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# NextAuth (use different secret locally)
NEXTAUTH_SECRET=your-local-development-secret
NEXTAUTH_URL=http://localhost:3000
```

#### Step 6: Verify Integration

1. Deploy your changes to Vercel
2. Visit your app and click "Sign in with Google"
3. Complete the OAuth flow
4. Verify user appears in database

#### Troubleshooting

| Issue | Solution |
|-------|----------|
| "redirect_uri_mismatch" | Ensure redirect URI exactly matches in Google Console |
| "access_denied" | Check OAuth consent screen and test users |
| OAuth not appearing | Verify `GOOGLE_CLIENT_ID` is set |
| Silent failures | Check browser console and Vercel function logs |

---

## 5. Environment Variables

### 5.1 Required Secrets

| Variable | Description | Security Notes |
|----------|-------------|----------------|
| `NEXTAUTH_SECRET` | JWT signing key | Must be 32+ characters, randomly generated |
| `NEXTAUTH_URL` | Application URL | Required for CSRF protection |
| `GOOGLE_CLIENT_ID` | OAuth client ID | Keep confidential |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret | Never expose publicly |
| `POSTGRES_URL` | Database connection | Contains credentials |

### 5.2 Secret Generation

Generate a secure `NEXTAUTH_SECRET`:

```bash
openssl rand -base64 32
```

---

## 6. Security Headers

### 6.1 Recommended Headers

The application should be deployed with these security headers:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; ...
```

### 6.2 Vercel Configuration

Add to `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" }
      ]
    }
  ]
}
```

---

## 7. Compliance

### 7.1 GDPR Considerations

- **Data access**: Users can view their data via profile settings
- **Data deletion**: Account deletion removes all user data (cascading delete)
- **Data portability**: Export functionality planned for Phase 20
- **Consent**: Users consent to terms on signup

### 7.2 CCPA Considerations

- **Right to know**: Users can access their stored data
- **Right to delete**: Users can delete their accounts
- **Right to opt-out**: No data selling; not applicable

---

## 8. Incident Response

### 8.1 Security Event Logging

Audit events are logged for:
- User sign-in/sign-out
- Budget uploads
- Profile changes
- Failed authentication attempts

### 8.2 Monitoring

- **Vercel Analytics**: Track request patterns
- **Error tracking**: Sentry integration (Phase 19)
- **Audit logs**: Database-stored events

---

## 9. Security Checklist

### Pre-Launch

- [x] Generate secure `NEXTAUTH_SECRET` ✓ (configured in Vercel)
- [ ] Configure Google OAuth with correct redirect URIs (see [Section 4.3](#43-google-oauth-setup-guide))
- [x] Enable database SSL for production ✓ (Vercel Postgres default)
- [x] Set up security headers in Vercel ✓ (configured in vercel.json)
- [x] Review and test authentication flows ✓ (verified January 2026)
- [x] Verify password hashing is working ✓ (bcrypt tests passing)

### Ongoing

- [ ] Monitor for failed login attempts
- [ ] Review audit logs periodically
- [ ] Update dependencies for security patches
- [ ] Rotate secrets annually

---

## 10. Known Limitations

### Current Phase (Phase 9)

1. **No email verification**: Users can sign up without verifying email (planned enhancement)
2. **No 2FA**: Two-factor authentication not yet implemented
3. **No password reset**: Users must use OAuth if password forgotten (planned enhancement)
4. **No rate limiting on auth**: Should be added in Phase 19

### Future Enhancements

| Feature | Phase | Description |
|---------|-------|-------------|
| Email verification | Future | Verify email before account activation |
| Password reset | Future | Self-service password recovery |
| Two-factor authentication | Future | TOTP-based 2FA |
| Rate limiting | Phase 19 | Prevent brute force attacks |
| Session revocation | Future | Ability to sign out all devices |

---

## Related Documentation

- [`docs/roadmap.md`](roadmap.md) — Phase 9 and security-related phases
- [`docs/architecture/persistence_layer.md`](architecture/persistence_layer.md) — Database schema
- [`docs/account_integration.md`](account_integration.md) — Future Plaid integration security
