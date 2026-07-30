# KindredCube authentication API

This service owns passwords, email verification, access tokens, refresh sessions, and private user-space authorization. The Expo application must never contain database, Resend, pepper, or token-signing secrets.

## Local setup

1. Copy `.env.example` to `.env` and replace every secret.
2. Start PostgreSQL with `docker compose up -d`.
3. Apply the schema with `npm run migrate`.
4. Start the API with `npm run start:dev`.
5. Set `EXPO_PUBLIC_API_URL` in the Expo `.env` to the computer's LAN address, such as `http://192.168.1.20:3001`, then restart Expo.

When `RESEND_API_KEY` is omitted in development, registration returns a development-only verification URL. Production startup refuses email delivery without `RESEND_API_KEY` and `RESEND_FROM`.

## Required production secrets

- `DATABASE_URL`: TLS-protected connection for the restricted, non-superuser `kindred_app` runtime role.
- `MIGRATION_DATABASE_URL`: separate administrative connection used only for migrations.
- `ACCESS_TOKEN_SECRET`: at least 32 random characters, stored in a secret manager.
- `PASSWORD_PEPPER`: separate random secret, never stored in PostgreSQL.
- `SESSION_TOKEN_PEPPER`: separate random secret for opaque-token hashes.
- `RESEND_API_KEY`: server-only Resend key.
- `RESEND_FROM`: a verified Resend sending identity, for example `KindredCube <verify@kindredcube.com>`.
- `PUBLIC_API_URL`: public HTTPS API origin.
- `APP_DEEP_LINK`: `kindredcube://verify-email` until universal/app links are configured.
- `STRIPE_SECRET_KEY`: server-only Stripe key for creating Identity VerificationSessions.
- `STRIPE_WEBHOOK_SECRET`: the `whsec_...` signing secret for the Stripe webhook destination in the same mode as `STRIPE_SECRET_KEY`. Use the test destination's secret with an `sk_test_...` key and the live destination's secret with an `sk_live_...` key.

## Isolation model

- The access-token subject is the only source of the current user identity.
- Private endpoints do not accept a `userId` parameter.
- Every private-data transaction sets `app.user_id` locally in PostgreSQL.
- `user_private_spaces` has forced row-level security and an owner-only policy.
- The API database role is non-superuser; superuser credentials are never available to the running API.
- Cross-account authorization tests are required before adding each new private table.
