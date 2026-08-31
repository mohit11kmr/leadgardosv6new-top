-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'AGENCY_ADMIN', 'AGENCY_MEMBER');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "FindingScope" AS ENUM ('PAGE', 'WEBSITE', 'AUDIT');

-- CreateEnum
CREATE TYPE "VaultAuditStatus" AS ENUM ('OPEN', 'TRIAGED', 'FIXED', 'VERIFIED', 'VERIFIED_IGNORED');

-- CreateEnum
CREATE TYPE "VaultRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VaultRunMode" AS ENUM ('STANDARD', 'RETEST');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('CREATED', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('SUBSCRIPTION', 'EXPRESS_FIX', 'WATCHDOG', 'PLAN_UPGRADE');

-- CreateEnum
CREATE TYPE "ExpressFixStatus" AS ENUM ('ORDER_CREATED', 'PAYMENT_PENDING', 'PAID', 'FULFILLMENT_PENDING', 'FULFILLMENT_IN_PROGRESS', 'FULFILLED', 'FULFILLMENT_FAILED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "UsageMetric" AS ENUM ('AUDITS', 'WEBSITES', 'API_REQUESTS', 'MONITORING');

-- CreateEnum
CREATE TYPE "MonitoringFrequency" AS ENUM ('FIVE_MINUTES', 'FIFTEEN_MINUTES', 'HOURLY', 'DAILY');

-- CreateEnum
CREATE TYPE "MonitoringStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "FindingChangeType" AS ENUM ('NEW', 'RESOLVED', 'PERSISTING', 'REGRESSED', 'UNCHANGED');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'SUPPRESSED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "timezone" TEXT DEFAULT 'UTC',
    "locale" TEXT DEFAULT 'en',
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "disabledReason" TEXT,
    "platformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "replacedByTokenHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "ipAddress" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "suspendedReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("organizationId","userId")
);

-- CreateTable
CREATE TABLE "Website" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientWorkspaceId" TEXT,
    "url" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Website_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteDomain" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "WebsiteDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteSettings" (
    "websiteId" TEXT NOT NULL,
    "settings" JSONB NOT NULL,

    CONSTRAINT "WebsiteSettings_pkey" PRIMARY KEY ("websiteId")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "status" "AuditStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "progressStage" TEXT NOT NULL DEFAULT 'queued',
    "idempotencyKey" TEXT,
    "scoringVersion" TEXT NOT NULL DEFAULT 'v3',
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "pagesDiscovered" INTEGER NOT NULL DEFAULT 0,
    "pagesFetched" INTEGER NOT NULL DEFAULT 0,
    "pagesScanned" INTEGER NOT NULL DEFAULT 0,
    "findingsGenerated" INTEGER NOT NULL DEFAULT 0,
    "businessImpact" JSONB,
    "executiveSummary" JSONB,
    "telemetry" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditPage" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "finalUrl" TEXT NOT NULL,
    "statusCode" INTEGER,
    "title" TEXT,
    "contentType" TEXT,
    "headers" JSONB,
    "htmlAvailable" BOOLEAN NOT NULL DEFAULT false,
    "responseTimeMs" INTEGER,
    "depth" INTEGER NOT NULL,
    "parentUrl" TEXT,
    "errorCode" TEXT,
    "redirectChain" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditRun" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "status" "AuditStatus" NOT NULL DEFAULT 'QUEUED',
    "pagesFetched" INTEGER NOT NULL DEFAULT 0,
    "findingsCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditFinding" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "internalKey" TEXT,
    "normalizedIssueKey" TEXT,
    "category" TEXT NOT NULL,
    "scope" "FindingScope" NOT NULL DEFAULT 'PAGE',
    "severity" "Severity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "affectedUrl" TEXT,
    "recommendation" TEXT NOT NULL,
    "scoreImpact" INTEGER NOT NULL,
    "businessImpact" TEXT,
    "metadata" JSONB,

    CONSTRAINT "AuditFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultAuditFinding" (
    "id" TEXT NOT NULL,
    "auditId" TEXT,
    "runId" TEXT,
    "websiteId" TEXT NOT NULL,
    "scannerKey" TEXT NOT NULL,
    "normalizedIssueKey" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "VaultAuditStatus" NOT NULL DEFAULT 'OPEN',
    "evidence" JSONB NOT NULL,
    "affectedUrl" TEXT,
    "recommendation" TEXT NOT NULL,
    "scoreImpact" INTEGER NOT NULL,
    "cwe" TEXT,
    "cvssVector" TEXT,
    "cvssScore" DOUBLE PRECISION,
    "ignoreReason" TEXT,
    "ignoredById" TEXT,
    "ignoredAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultAuditFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultAuditRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "auditId" TEXT,
    "mode" "VaultRunMode" NOT NULL DEFAULT 'STANDARD',
    "status" "VaultRunStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT,
    "triggerSource" TEXT NOT NULL DEFAULT 'api',
    "triggeredBy" TEXT,
    "pagesDiscovered" INTEGER NOT NULL DEFAULT 0,
    "pagesFetched" INTEGER NOT NULL DEFAULT 0,
    "pagesFailed" INTEGER NOT NULL DEFAULT 0,
    "findingsCount" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "cancelledAt" TIMESTAMP(3),
    "retestedFindings" INTEGER NOT NULL DEFAULT 0,
    "fixedFindings" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultAuditRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditScore" (
    "auditId" TEXT NOT NULL,
    "lead" INTEGER NOT NULL,
    "advertising" INTEGER NOT NULL,
    "seo" INTEGER NOT NULL,
    "security" INTEGER NOT NULL,
    "overall" INTEGER NOT NULL,

    CONSTRAINT "AuditScore_pkey" PRIMARY KEY ("auditId")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "auditId" TEXT,
    "vaultRunId" TEXT,
    "title" TEXT NOT NULL DEFAULT 'LeadGuard Diagnostic Audit Report',
    "version" INTEGER NOT NULL DEFAULT 1,
    "reportVersion" TEXT NOT NULL DEFAULT 'v1',
    "templateVersion" TEXT NOT NULL DEFAULT 'v1',
    "brandingVersion" TEXT NOT NULL DEFAULT 'v1',
    "status" TEXT NOT NULL DEFAULT 'READY',
    "snapshotData" JSONB,
    "pdfPath" TEXT,
    "pdfStatus" TEXT NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportVersion" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,

    CONSTRAINT "ReportVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportShareLink" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "passwordHash" TEXT,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "frequency" "MonitoringFrequency" NOT NULL DEFAULT 'HOURLY',
    "maxPages" INTEGER NOT NULL DEFAULT 10,
    "maxDepth" INTEGER NOT NULL DEFAULT 2,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "failureThreshold" INTEGER NOT NULL DEFAULT 2,
    "responseTimeThresholdMs" INTEGER NOT NULL DEFAULT 3000,
    "tlsExpiryThresholdDays" INTEGER NOT NULL DEFAULT 14,
    "lockedUntil" TIMESTAMP(3),
    "lockToken" TEXT,
    "healthChecks" JSONB,
    "alertPolicy" JSONB,
    "baseline" JSONB,
    "baselineVersion" INTEGER NOT NULL DEFAULT 1,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringRun" (
    "id" TEXT NOT NULL,
    "monitoringConfigId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scheduledSlot" TEXT,
    "idempotencyKey" TEXT,
    "status" "MonitoringStatus" NOT NULL DEFAULT 'QUEUED',
    "httpStatus" INTEGER,
    "responseTimeMs" INTEGER,
    "tlsValid" BOOLEAN,
    "tlsExpiresAt" TIMESTAMP(3),
    "redirectChain" JSONB,
    "scores" JSONB,
    "scoreDeltas" JSONB,
    "pagesEvaluated" INTEGER NOT NULL DEFAULT 1,
    "findingsCount" INTEGER NOT NULL DEFAULT 0,
    "newRegressionsCount" INTEGER NOT NULL DEFAULT 0,
    "resolvedCount" INTEGER NOT NULL DEFAULT 0,
    "telemetry" JSONB,
    "errorCode" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoringRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringFinding" (
    "id" TEXT NOT NULL,
    "monitoringRunId" TEXT NOT NULL,
    "monitoringConfigId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "changeType" "FindingChangeType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "affectedUrl" TEXT,
    "pageTitle" TEXT,
    "beforeState" JSONB,
    "afterState" JSONB,
    "evidence" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoringFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringAlert" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monitoringConfigId" TEXT,
    "monitoringRunId" TEXT,
    "websiteId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "ruleId" TEXT,
    "severity" "Severity" NOT NULL DEFAULT 'HIGH',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "lastAlertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cooldownUntil" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceInPaise" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "billingInterval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "entitlements" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "provider" TEXT NOT NULL DEFAULT 'RAZORPAY',
    "providerSubscriptionId" TEXT,
    "providerCustomerId" TEXT,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'RAZORPAY',
    "providerPaymentId" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "providerSignature" TEXT,
    "amountInPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'CAPTURED',
    "purpose" "PaymentPurpose" NOT NULL DEFAULT 'SUBSCRIPTION',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "paymentId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "amountInPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PAID',
    "billingAddress" JSONB,
    "taxInfo" JSONB,
    "pdfUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpressFixFulfillment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "auditId" TEXT,
    "paymentId" TEXT NOT NULL,
    "status" "ExpressFixStatus" NOT NULL DEFAULT 'ORDER_CREATED',
    "notes" TEXT,
    "assignedTo" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpressFixFulfillment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpressFixLead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "websiteId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "paymentId" TEXT,
    "fulfillmentId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'GUEST_CHECKOUT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpressFixLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunnelEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT,
    "auditId" TEXT,
    "leadId" TEXT,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FunnelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'RAZORPAY',
    "providerEventId" TEXT,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "metric" "UsageMetric" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "events" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Testimonial" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientWorkspaceId" TEXT,
    "authorName" TEXT NOT NULL DEFAULT 'Anonymous',
    "companyName" TEXT,
    "role" TEXT,
    "content" TEXT NOT NULL DEFAULT '',
    "rating" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientWorkspace" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "contactName" TEXT,
    "contactEmail" TEXT,
    "notes" TEXT,
    "branding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ClientWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientWorkspaceMember" (
    "id" TEXT NOT NULL,
    "clientWorkspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientWorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectCampaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientWorkspaceId" TEXT,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "targetCount" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "successfulCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "qualifiedCount" INTEGER NOT NULL DEFAULT 0,
    "qualificationCriteria" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "businessName" TEXT,
    "industry" TEXT,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISCOVERED',
    "leadScore" INTEGER,
    "criticalFindings" INTEGER NOT NULL DEFAULT 0,
    "highFindings" INTEGER NOT NULL DEFAULT 0,
    "potentialOpportunity" TEXT,
    "auditId" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pitch" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "generationType" TEXT NOT NULL DEFAULT 'DETERMINISTIC_TEMPLATE',
    "provider" TEXT NOT NULL DEFAULT 'DETERMINISTIC_TEMPLATE',
    "model" TEXT NOT NULL DEFAULT 'template-v1',
    "promptVersion" TEXT NOT NULL DEFAULT 'v1',
    "language" TEXT NOT NULL DEFAULT 'en',
    "tone" TEXT NOT NULL DEFAULT 'PROFESSIONAL',
    "subject" TEXT NOT NULL,
    "opening" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "businessImpact" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "callToAction" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "claimReferences" JSONB,
    "idempotencyKey" TEXT,
    "tokensUsed" INTEGER,
    "estimatedCost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pitch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitchGeneration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT,
    "pitchId" TEXT,
    "error" TEXT,
    "tokensUsed" INTEGER,
    "estimatedCost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PitchGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Widget" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientWorkspaceId" TEXT,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "allowedOrigins" TEXT[],
    "theme" TEXT NOT NULL DEFAULT 'LIGHT',
    "displayMode" TEXT NOT NULL DEFAULT 'EMBED',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Widget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorComparison" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientWorkspaceId" TEXT,
    "name" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "competitorUrls" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "comparisonData" JSONB,
    "strengths" JSONB,
    "weaknesses" JSONB,
    "opportunities" JSONB,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitorComparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "ipAddress" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookEndpointId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "statusCode" INTEGER,
    "responseBody" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "eventTypes" TEXT[] DEFAULT ARRAY['AUDIT_COMPLETED', 'MONITORING_ALERT', 'BILLING_INVOICE']::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_expiresAt_idx" ON "EmailVerificationToken"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_type_createdAt_idx" ON "SecurityEvent"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE INDEX "Website_organizationId_deletedAt_idx" ON "Website"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "Website_clientWorkspaceId_idx" ON "Website"("clientWorkspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Website_organizationId_url_key" ON "Website"("organizationId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteDomain_websiteId_hostname_key" ON "WebsiteDomain"("websiteId", "hostname");

-- CreateIndex
CREATE INDEX "Audit_organizationId_createdAt_idx" ON "Audit"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Audit_websiteId_status_idx" ON "Audit"("websiteId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Audit_organizationId_idempotencyKey_key" ON "Audit"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AuditPage_auditId_depth_idx" ON "AuditPage"("auditId", "depth");

-- CreateIndex
CREATE UNIQUE INDEX "AuditPage_auditId_url_key" ON "AuditPage"("auditId", "url");

-- CreateIndex
CREATE INDEX "AuditRun_auditId_createdAt_idx" ON "AuditRun"("auditId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditFinding_auditId_severity_idx" ON "AuditFinding"("auditId", "severity");

-- CreateIndex
CREATE INDEX "AuditFinding_auditId_scope_idx" ON "AuditFinding"("auditId", "scope");

-- CreateIndex
CREATE INDEX "AuditFinding_auditId_category_idx" ON "AuditFinding"("auditId", "category");

-- CreateIndex
CREATE INDEX "AuditFinding_auditId_normalizedIssueKey_idx" ON "AuditFinding"("auditId", "normalizedIssueKey");

-- CreateIndex
CREATE INDEX "AuditFinding_auditId_scoreImpact_idx" ON "AuditFinding"("auditId", "scoreImpact");

-- CreateIndex
CREATE INDEX "VaultAuditFinding_websiteId_normalizedIssueKey_status_idx" ON "VaultAuditFinding"("websiteId", "normalizedIssueKey", "status");

-- CreateIndex
CREATE INDEX "VaultAuditFinding_auditId_severity_idx" ON "VaultAuditFinding"("auditId", "severity");

-- CreateIndex
CREATE INDEX "VaultAuditFinding_websiteId_status_idx" ON "VaultAuditFinding"("websiteId", "status");

-- CreateIndex
CREATE INDEX "VaultAuditFinding_runId_idx" ON "VaultAuditFinding"("runId");

-- CreateIndex
CREATE INDEX "VaultAuditFinding_ignoredById_idx" ON "VaultAuditFinding"("ignoredById");

-- CreateIndex
CREATE UNIQUE INDEX "VaultAuditFinding_websiteId_scannerKey_normalizedIssueKey_key" ON "VaultAuditFinding"("websiteId", "scannerKey", "normalizedIssueKey");

-- CreateIndex
CREATE INDEX "VaultAuditRun_websiteId_status_idx" ON "VaultAuditRun"("websiteId", "status");

-- CreateIndex
CREATE INDEX "VaultAuditRun_websiteId_createdAt_idx" ON "VaultAuditRun"("websiteId", "createdAt");

-- CreateIndex
CREATE INDEX "VaultAuditRun_organizationId_status_idx" ON "VaultAuditRun"("organizationId", "status");

-- CreateIndex
CREATE INDEX "VaultAuditRun_auditId_idx" ON "VaultAuditRun"("auditId");

-- CreateIndex
CREATE UNIQUE INDEX "VaultAuditRun_organizationId_idempotencyKey_key" ON "VaultAuditRun"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Report_organizationId_createdAt_idx" ON "Report"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_auditId_idx" ON "Report"("auditId");

-- CreateIndex
CREATE INDEX "Report_vaultRunId_idx" ON "Report"("vaultRunId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportVersion_reportId_version_key" ON "ReportVersion"("reportId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ReportShareLink_tokenHash_key" ON "ReportShareLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ReportShareLink_reportId_revokedAt_idx" ON "ReportShareLink"("reportId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringConfig_websiteId_key" ON "MonitoringConfig"("websiteId");

-- CreateIndex
CREATE INDEX "MonitoringConfig_organizationId_enabled_archivedAt_idx" ON "MonitoringConfig"("organizationId", "enabled", "archivedAt");

-- CreateIndex
CREATE INDEX "MonitoringConfig_enabled_nextRunAt_idx" ON "MonitoringConfig"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "MonitoringRun_monitoringConfigId_createdAt_idx" ON "MonitoringRun"("monitoringConfigId", "createdAt");

-- CreateIndex
CREATE INDEX "MonitoringRun_organizationId_createdAt_idx" ON "MonitoringRun"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "MonitoringRun_createdAt_idx" ON "MonitoringRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringRun_monitoringConfigId_scheduledSlot_key" ON "MonitoringRun"("monitoringConfigId", "scheduledSlot");

-- CreateIndex
CREATE INDEX "MonitoringFinding_monitoringConfigId_detectedAt_idx" ON "MonitoringFinding"("monitoringConfigId", "detectedAt");

-- CreateIndex
CREATE INDEX "MonitoringFinding_monitoringConfigId_affectedUrl_idx" ON "MonitoringFinding"("monitoringConfigId", "affectedUrl");

-- CreateIndex
CREATE INDEX "MonitoringFinding_monitoringRunId_changeType_idx" ON "MonitoringFinding"("monitoringRunId", "changeType");

-- CreateIndex
CREATE INDEX "MonitoringFinding_detectedAt_idx" ON "MonitoringFinding"("detectedAt");

-- CreateIndex
CREATE INDEX "MonitoringAlert_organizationId_status_idx" ON "MonitoringAlert"("organizationId", "status");

-- CreateIndex
CREATE INDEX "MonitoringAlert_monitoringConfigId_fingerprint_idx" ON "MonitoringAlert"("monitoringConfigId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringAlert_monitoringConfigId_fingerprint_status_key" ON "MonitoringAlert"("monitoringConfigId", "fingerprint", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_organizationId_status_idx" ON "Subscription"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE INDEX "Payment_organizationId_createdAt_idx" ON "Payment"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_createdAt_idx" ON "Invoice"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpressFixFulfillment_paymentId_key" ON "ExpressFixFulfillment"("paymentId");

-- CreateIndex
CREATE INDEX "ExpressFixFulfillment_organizationId_status_idx" ON "ExpressFixFulfillment"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ExpressFixFulfillment_paymentId_idx" ON "ExpressFixFulfillment"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpressFixLead_paymentId_key" ON "ExpressFixLead"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpressFixLead_fulfillmentId_key" ON "ExpressFixLead"("fulfillmentId");

-- CreateIndex
CREATE INDEX "ExpressFixLead_organizationId_createdAt_idx" ON "ExpressFixLead"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ExpressFixLead_auditId_idx" ON "ExpressFixLead"("auditId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpressFixLead_email_auditId_key" ON "ExpressFixLead"("email", "auditId");

-- CreateIndex
CREATE INDEX "FunnelEvent_organizationId_type_createdAt_idx" ON "FunnelEvent"("organizationId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "FunnelEvent_auditId_createdAt_idx" ON "FunnelEvent"("auditId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingEvent_organizationId_createdAt_idx" ON "BillingEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingEvent_providerEventId_idx" ON "BillingEvent"("providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingEvent_type_providerEventId_key" ON "BillingEvent"("type", "providerEventId");

-- CreateIndex
CREATE INDEX "UsageRecord_organizationId_period_idx" ON "UsageRecord"("organizationId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "UsageRecord_organizationId_period_metric_key" ON "UsageRecord"("organizationId", "period", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_organizationId_revokedAt_idx" ON "ApiKey"("organizationId", "revokedAt");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_organizationId_enabled_idx" ON "WebhookEndpoint"("organizationId", "enabled");

-- CreateIndex
CREATE INDEX "Testimonial_organizationId_status_idx" ON "Testimonial"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Testimonial_status_publishedAt_idx" ON "Testimonial"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "ClientWorkspace_organizationId_status_archivedAt_idx" ON "ClientWorkspace"("organizationId", "status", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientWorkspace_organizationId_slug_key" ON "ClientWorkspace"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ClientWorkspaceMember_clientWorkspaceId_userId_key" ON "ClientWorkspaceMember"("clientWorkspaceId", "userId");

-- CreateIndex
CREATE INDEX "ProspectCampaign_organizationId_status_idx" ON "ProspectCampaign"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ProspectCampaign_clientWorkspaceId_idx" ON "ProspectCampaign"("clientWorkspaceId");

-- CreateIndex
CREATE INDEX "Prospect_campaignId_status_idx" ON "Prospect"("campaignId", "status");

-- CreateIndex
CREATE INDEX "Prospect_organizationId_domain_idx" ON "Prospect"("organizationId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_campaignId_normalizedUrl_key" ON "Prospect"("campaignId", "normalizedUrl");

-- CreateIndex
CREATE INDEX "Pitch_prospectId_createdAt_idx" ON "Pitch"("prospectId", "createdAt");

-- CreateIndex
CREATE INDEX "Pitch_organizationId_createdAt_idx" ON "Pitch"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Pitch_prospectId_version_key" ON "Pitch"("prospectId", "version");

-- CreateIndex
CREATE INDEX "PitchGeneration_organizationId_status_idx" ON "PitchGeneration"("organizationId", "status");

-- CreateIndex
CREATE INDEX "PitchGeneration_prospectId_createdAt_idx" ON "PitchGeneration"("prospectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PitchGeneration_organizationId_idempotencyKey_key" ON "PitchGeneration"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Widget_tokenHash_key" ON "Widget"("tokenHash");

-- CreateIndex
CREATE INDEX "Widget_organizationId_enabled_idx" ON "Widget"("organizationId", "enabled");

-- CreateIndex
CREATE INDEX "CompetitorComparison_organizationId_createdAt_idx" ON "CompetitorComparison"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiUsage_organizationId_timestamp_idx" ON "ApiUsage"("organizationId", "timestamp");

-- CreateIndex
CREATE INDEX "ApiUsage_apiKeyId_timestamp_idx" ON "ApiUsage"("apiKeyId", "timestamp");

-- CreateIndex
CREATE INDEX "ApiUsage_timestamp_idx" ON "ApiUsage"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_deliveryId_key" ON "WebhookDelivery"("deliveryId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookEndpointId_createdAt_idx" ON "WebhookDelivery"("webhookEndpointId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_organizationId_createdAt_idx" ON "WebhookDelivery"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_createdAt_idx" ON "WebhookDelivery"("createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_createdAt_idx" ON "OutboxEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_organizationId_createdAt_idx" ON "OutboxEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_userId_createdAt_idx" ON "AdminAuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_resourceType_createdAt_idx" ON "AdminAuditLog"("resourceType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_organizationId_channel_key" ON "NotificationPreference"("userId", "organizationId", "channel");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Website" ADD CONSTRAINT "Website_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Website" ADD CONSTRAINT "Website_clientWorkspaceId_fkey" FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteDomain" ADD CONSTRAINT "WebsiteDomain_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteSettings" ADD CONSTRAINT "WebsiteSettings_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPage" ADD CONSTRAINT "AuditPage_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditRun" ADD CONSTRAINT "AuditRun_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultAuditFinding" ADD CONSTRAINT "VaultAuditFinding_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultAuditFinding" ADD CONSTRAINT "VaultAuditFinding_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultAuditFinding" ADD CONSTRAINT "VaultAuditFinding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "VaultAuditRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultAuditFinding" ADD CONSTRAINT "VaultAuditFinding_ignoredById_fkey" FOREIGN KEY ("ignoredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultAuditRun" ADD CONSTRAINT "VaultAuditRun_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultAuditRun" ADD CONSTRAINT "VaultAuditRun_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditScore" ADD CONSTRAINT "AuditScore_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_vaultRunId_fkey" FOREIGN KEY ("vaultRunId") REFERENCES "VaultAuditRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportVersion" ADD CONSTRAINT "ReportVersion_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportShareLink" ADD CONSTRAINT "ReportShareLink_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringConfig" ADD CONSTRAINT "MonitoringConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringConfig" ADD CONSTRAINT "MonitoringConfig_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringRun" ADD CONSTRAINT "MonitoringRun_monitoringConfigId_fkey" FOREIGN KEY ("monitoringConfigId") REFERENCES "MonitoringConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringRun" ADD CONSTRAINT "MonitoringRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringFinding" ADD CONSTRAINT "MonitoringFinding_monitoringRunId_fkey" FOREIGN KEY ("monitoringRunId") REFERENCES "MonitoringRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringFinding" ADD CONSTRAINT "MonitoringFinding_monitoringConfigId_fkey" FOREIGN KEY ("monitoringConfigId") REFERENCES "MonitoringConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringAlert" ADD CONSTRAINT "MonitoringAlert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringAlert" ADD CONSTRAINT "MonitoringAlert_monitoringConfigId_fkey" FOREIGN KEY ("monitoringConfigId") REFERENCES "MonitoringConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringAlert" ADD CONSTRAINT "MonitoringAlert_monitoringRunId_fkey" FOREIGN KEY ("monitoringRunId") REFERENCES "MonitoringRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressFixFulfillment" ADD CONSTRAINT "ExpressFixFulfillment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressFixFulfillment" ADD CONSTRAINT "ExpressFixFulfillment_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressFixFulfillment" ADD CONSTRAINT "ExpressFixFulfillment_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressFixFulfillment" ADD CONSTRAINT "ExpressFixFulfillment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressFixLead" ADD CONSTRAINT "ExpressFixLead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressFixLead" ADD CONSTRAINT "ExpressFixLead_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressFixLead" ADD CONSTRAINT "ExpressFixLead_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressFixLead" ADD CONSTRAINT "ExpressFixLead_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressFixLead" ADD CONSTRAINT "ExpressFixLead_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "ExpressFixFulfillment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelEvent" ADD CONSTRAINT "FunnelEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelEvent" ADD CONSTRAINT "FunnelEvent_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelEvent" ADD CONSTRAINT "FunnelEvent_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingEvent" ADD CONSTRAINT "BillingEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_clientWorkspaceId_fkey" FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientWorkspace" ADD CONSTRAINT "ClientWorkspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientWorkspaceMember" ADD CONSTRAINT "ClientWorkspaceMember_clientWorkspaceId_fkey" FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientWorkspaceMember" ADD CONSTRAINT "ClientWorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectCampaign" ADD CONSTRAINT "ProspectCampaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectCampaign" ADD CONSTRAINT "ProspectCampaign_clientWorkspaceId_fkey" FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ProspectCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pitch" ADD CONSTRAINT "Pitch_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pitch" ADD CONSTRAINT "Pitch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitchGeneration" ADD CONSTRAINT "PitchGeneration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitchGeneration" ADD CONSTRAINT "PitchGeneration_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Widget" ADD CONSTRAINT "Widget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Widget" ADD CONSTRAINT "Widget_clientWorkspaceId_fkey" FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorComparison" ADD CONSTRAINT "CompetitorComparison_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorComparison" ADD CONSTRAINT "CompetitorComparison_clientWorkspaceId_fkey" FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiUsage" ADD CONSTRAINT "ApiUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiUsage" ADD CONSTRAINT "ApiUsage_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookEndpointId_fkey" FOREIGN KEY ("webhookEndpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

