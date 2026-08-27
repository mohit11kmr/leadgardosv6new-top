# Multi-tenancy

Organizations own business resources. Membership uses a composite organization/user key and explicit roles. Protected services must always load resources with organizationId plus membership authorization; client-supplied organization or role values are never trusted.
