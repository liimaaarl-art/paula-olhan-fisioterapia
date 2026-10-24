-- Additive schema generated from Better Auth 1.7.12 configured models.
-- RLS has no public policies: only the server database owner accesses identity.
CREATE TABLE IF NOT EXISTS "olhan_auth_user" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  "image" text,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  "twoFactorEnabled" boolean DEFAULT false,
  "role" text DEFAULT 'member'
);
ALTER TABLE "olhan_auth_user" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "olhan_auth_user" FROM PUBLIC;
CREATE TABLE IF NOT EXISTS "olhan_auth_session" (
  "id" text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "olhan_auth_user"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "olhan_auth_session_userId_idx" ON "olhan_auth_session" ("userId");
ALTER TABLE "olhan_auth_session" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "olhan_auth_session" FROM PUBLIC;
CREATE TABLE IF NOT EXISTS "olhan_auth_account" (
  "id" text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "olhan_auth_user"("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "olhan_auth_account_userId_idx" ON "olhan_auth_account" ("userId");
ALTER TABLE "olhan_auth_account" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "olhan_auth_account" FROM PUBLIC;
CREATE TABLE IF NOT EXISTS "olhan_auth_verification" (
  "id" text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "olhan_auth_verification_identifier_idx" ON "olhan_auth_verification" ("identifier");
ALTER TABLE "olhan_auth_verification" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "olhan_auth_verification" FROM PUBLIC;
CREATE TABLE IF NOT EXISTS "olhan_auth_two_factor" (
  "id" text PRIMARY KEY,
  "secret" text NOT NULL,
  "backupCodes" text NOT NULL,
  "userId" text NOT NULL REFERENCES "olhan_auth_user"("id"),
  "verified" boolean DEFAULT true,
  "failedVerificationCount" integer DEFAULT 0,
  "lockedUntil" timestamptz
);
CREATE INDEX IF NOT EXISTS "olhan_auth_two_factor_secret_idx" ON "olhan_auth_two_factor" ("secret");
CREATE INDEX IF NOT EXISTS "olhan_auth_two_factor_userId_idx" ON "olhan_auth_two_factor" ("userId");
ALTER TABLE "olhan_auth_two_factor" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "olhan_auth_two_factor" FROM PUBLIC;
CREATE TABLE IF NOT EXISTS "olhan_auth_rate_limit" (
  "id" text PRIMARY KEY,
  "key" text NOT NULL UNIQUE,
  "count" integer NOT NULL,
  "lastRequest" bigint NOT NULL
);
ALTER TABLE "olhan_auth_rate_limit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "olhan_auth_rate_limit" FROM PUBLIC;
