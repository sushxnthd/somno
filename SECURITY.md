# Security and secrets

This public repository intentionally excludes production credentials and signing material.

Do not commit:

- `.env` or production environment files
- Supabase `service_role` keys
- OAuth client secrets
- Android `.jks` / `.keystore` files
- private keys or certificates
- `google-services.json` tied to a private project
- release APK/AAB artifacts when they contain sensitive configuration you do not intend to distribute

Use `.env.example` only as a configuration template. Public client identifiers that are designed to ship in a mobile binary are not authentication secrets; server-side secrets must remain outside the repository.

If a secret is accidentally committed, rotate/revoke it first, then remove it from repository history.
