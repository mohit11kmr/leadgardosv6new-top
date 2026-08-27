# LeadGuard OS V6 — Role-Based Access Control (RBAC)

LeadGuard OS V6 enforces organization-level RBAC via `OrganizationMember.role`.

---

## 1. Supported Roles

- `OWNER`: Full administrative control over the workspace, billing, members, and organizational settings.
- `ADMIN`: Manages websites, audits, API keys, and workspace members (cannot delete workspace).
- `MEMBER`: Regular operator capable of viewing workspace resources and launching diagnostic audits.
- `VIEWER`: Read-only auditor with access to view completed audits and website statuses.
- `AGENCY_ADMIN`: Agency administrator with multi-client diagnostic capabilities.
- `AGENCY_MEMBER`: Agency staff member with scan-running capabilities.

---

## 2. Capability Permission Matrix

| Capability | Resource | OWNER | ADMIN | MEMBER | VIEWER | AGENCY_ADMIN | AGENCY_MEMBER |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `AUDIT_VIEW` | View audits & dossiers | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `AUDIT_RUN` | Start diagnostic scans | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `AUDIT_CANCEL` | Cancel in-flight scans | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| `AUDIT_DELETE` | Archive audit history | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `WEBSITE_VIEW` | View website catalog | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `WEBSITE_MANAGE`| Add/Edit/Archive sites | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| `API_KEY_MANAGE`| Create/Revoke API keys | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `MEMBER_MANAGE` | Invite/Remove members | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `ORG_MANAGE` | Rename/Delete workspace | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 3. Enforcement Pattern

API routes declare capabilities using `requirePermission(capability)`:
```ts
apiRouter.post('/audits', requirePermission('AUDIT_RUN'), ...);
apiRouter.post('/websites', requirePermission('WEBSITE_MANAGE'), ...);
apiRouter.get('/api-keys', requirePermission('API_KEY_MANAGE'), ...);
```
Attempts by unauthorized roles immediately reject with `403 FORBIDDEN`.
