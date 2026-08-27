# Security

Helmet, strict CORS, JSON limits, rate limiting, request IDs, structured logs, safe errors, Argon2id, hashed refresh tokens, and Zod configuration validation are included. `validateExternalUrl` rejects non-HTTP(S), credentials, localhost, private/link-local IPv4, IPv6 local/private prefixes, and metadata hosts. Production workers must also validate every redirect and pin/recheck resolved egress addresses to mitigate DNS rebinding.
