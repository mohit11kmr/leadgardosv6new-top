export function toUserDto(user: {
  id: string;
  email: string;
  emailVerifiedAt?: Date | null;
  platformAdmin?: boolean;
  platformCapabilities?: string[];
  platformRole?: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    platformAdmin: Boolean(user.platformAdmin),
    // UI convenience only, exactly like platformAdmin above — every admin
    // route/mutation is still authorized server-side by
    // requirePlatformCapability(), never by trusting this client-visible
    // field (see rbac.ts).
    platformCapabilities: user.platformCapabilities ?? [],
    platformRole: user.platformRole ?? null,
  };
}

export function toOrganizationDto(org: { id: string; name: string; slug: string }) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
  };
}

export function toWebsiteDto(website: {
  id: string;
  name: string;
  url: string;
  normalizedUrl: string;
  domain: string;
  status: string;
  createdAt: Date;
  audits?: unknown[];
}) {
  return {
    id: website.id,
    name: website.name,
    url: website.url,
    normalizedUrl: website.normalizedUrl,
    domain: website.domain,
    status: website.status,
    createdAt: website.createdAt,
    audits: website.audits ?? [],
  };
}
