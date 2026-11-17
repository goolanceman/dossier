-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('VERIFIED', 'USER_CONFIRMED', 'IMPORTED', 'NEEDS_CLARIFICATION', 'REJECTED');

-- CreateEnum
CREATE TYPE "KnowledgeDocStatus" AS ENUM ('NEW', 'REVIEWED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SearchScheduleKind" AS ENUM ('HOURLY', 'EVERY_6_HOURS', 'DAILY', 'WEEKDAYS', 'CRON');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssessmentDecision" AS ENUM ('STRONG_MATCH', 'POTENTIAL_MATCH', 'WEAK_MATCH', 'REJECT', 'PENDING');

-- CreateEnum
CREATE TYPE "SalaryStatus" AS ENUM ('STATED', 'CONFIRMED', 'ESTIMATED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "GapQuestionStatus" AS ENUM ('OPEN', 'ANSWERED', 'SKIPPED', 'UNKNOWN', 'SAVED_FOR_LATER');

-- CreateEnum
CREATE TYPE "MockKind" AS ENUM ('TEXT', 'TECHNICAL', 'BEHAVIORAL', 'SYSTEM_DESIGN');

-- CreateEnum
CREATE TYPE "MockStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "LearningStatus" AS ENUM ('NOT_STARTED', 'LEARNING', 'PRACTICING', 'COMPLETED', 'NEEDS_REVISION');

-- CreateTable
CREATE TABLE "CareerAchievement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "detail" TEXT NOT NULL DEFAULT '',
    "company" TEXT NOT NULL DEFAULT '',
    "position" TEXT NOT NULL DEFAULT '',
    "project" TEXT NOT NULL DEFAULT '',
    "technologies" JSONB NOT NULL,
    "problem" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL DEFAULT '',
    "businessImpact" TEXT NOT NULL DEFAULT '',
    "metrics" JSONB NOT NULL,
    "scale" TEXT NOT NULL DEFAULT '',
    "ownership" TEXT NOT NULL DEFAULT '',
    "complexity" TEXT NOT NULL DEFAULT '',
    "evidenceUrl" TEXT NOT NULL DEFAULT '',
    "evidenceNotes" TEXT NOT NULL DEFAULT '',
    "status" "EvidenceStatus" NOT NULL DEFAULT 'IMPORTED',
    "tags" JSONB NOT NULL,
    "skills" JSONB NOT NULL,
    "experienceId" TEXT,
    "versions" JSONB NOT NULL,
    "origin" TEXT NOT NULL DEFAULT '',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerTarget" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "preferences" JSONB NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeDoc" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "content" TEXT NOT NULL DEFAULT '',
    "sourceUrl" TEXT NOT NULL DEFAULT '',
    "status" "KnowledgeDocStatus" NOT NULL DEFAULT 'NEW',
    "findings" JSONB,
    "achievementIds" JSONB NOT NULL,
    "reviewedWith" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSearchProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "source" "PostingSource" NOT NULL,
    "query" JSONB NOT NULL,
    "titles" JSONB NOT NULL,
    "altTitles" JSONB NOT NULL,
    "requiredKeywords" JSONB NOT NULL,
    "excludedKeywords" JSONB NOT NULL,
    "requiredTech" JSONB NOT NULL,
    "preferredTech" JSONB NOT NULL,
    "excludedTech" JSONB NOT NULL,
    "seniority" JSONB NOT NULL,
    "employmentTypes" JSONB NOT NULL,
    "remotePreference" TEXT NOT NULL DEFAULT 'REMOTE_OR_HYBRID',
    "remoteCountries" JSONB NOT NULL,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "currency" TEXT NOT NULL DEFAULT '',
    "companyBlacklist" JSONB NOT NULL,
    "companyWhitelist" JSONB NOT NULL,
    "industries" JSONB NOT NULL,
    "companySize" TEXT NOT NULL DEFAULT '',
    "startupOnly" BOOLEAN NOT NULL DEFAULT false,
    "timeZone" TEXT NOT NULL DEFAULT '',
    "scheduleKind" "SearchScheduleKind" NOT NULL DEFAULT 'DAILY',
    "cron" TEXT NOT NULL DEFAULT '',
    "maxJobsPerRun" INTEGER NOT NULL DEFAULT 20,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobSearchProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryRun" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "step" TEXT,
    "stats" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAssessment" (
    "id" TEXT NOT NULL,
    "postingId" TEXT NOT NULL,
    "profileId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'DETERMINISTIC',
    "decision" "AssessmentDecision" NOT NULL DEFAULT 'PENDING',
    "score" INTEGER,
    "confidence" TEXT NOT NULL DEFAULT '',
    "dimensions" JSONB,
    "requirements" JSONB,
    "critique" JSONB,
    "reasons" JSONB NOT NULL,
    "rejectedReason" TEXT NOT NULL DEFAULT '',
    "userOverride" TEXT NOT NULL DEFAULT '',
    "assessedWith" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryEstimate" (
    "id" TEXT NOT NULL,
    "postingId" TEXT,
    "company" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "place" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "status" "SalaryStatus" NOT NULL DEFAULT 'UNAVAILABLE',
    "minimum" INTEGER,
    "median" INTEGER,
    "maximum" INTEGER,
    "currency" TEXT NOT NULL DEFAULT '',
    "basis" TEXT NOT NULL DEFAULT 'ANNUAL',
    "confidence" TEXT NOT NULL DEFAULT 'LOW',
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "sources" JSONB NOT NULL,
    "methodology" TEXT NOT NULL DEFAULT '',
    "researchedWith" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeCritique" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "overall" JSONB NOT NULL,
    "findings" JSONB NOT NULL,
    "keywordCoverage" JSONB NOT NULL,
    "formattingIssues" JSONB NOT NULL,
    "targetId" TEXT DEFAULT '',
    "critiquedWith" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeCritique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentEvidence" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "DocumentEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GapQuestion" (
    "id" TEXT NOT NULL,
    "postingId" TEXT,
    "applicationId" TEXT,
    "question" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "relatedRequirement" TEXT NOT NULL DEFAULT '',
    "questionType" TEXT NOT NULL DEFAULT 'CLARIFICATION',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" "GapQuestionStatus" NOT NULL DEFAULT 'OPEN',
    "answer" TEXT NOT NULL DEFAULT '',
    "achievementId" TEXT,
    "generatedWith" TEXT NOT NULL DEFAULT '',
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GapQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewPlan" (
    "id" TEXT NOT NULL,
    "postingId" TEXT,
    "applicationId" TEXT,
    "role" TEXT NOT NULL DEFAULT '',
    "rounds" JSONB NOT NULL,
    "preparedWith" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewQuestion" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'INTERMEDIATE',
    "question" TEXT NOT NULL,
    "whyAsked" TEXT NOT NULL DEFAULT '',
    "relatedRequirement" TEXT NOT NULL DEFAULT '',
    "expectedTopics" JSONB NOT NULL,
    "answerStructure" JSONB NOT NULL,
    "evidenceIds" JSONB NOT NULL,
    "followUps" JSONB NOT NULL,
    "commonMistakes" JSONB NOT NULL,
    "resources" JSONB NOT NULL,
    "prepared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockSession" (
    "id" TEXT NOT NULL,
    "planId" TEXT,
    "kind" "MockKind" NOT NULL DEFAULT 'TEXT',
    "status" "MockStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "turns" JSONB NOT NULL,
    "feedback" JSONB,
    "score" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MockSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StarStory" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "situation" TEXT NOT NULL DEFAULT '',
    "task" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL DEFAULT '',
    "result" TEXT NOT NULL DEFAULT '',
    "technologies" JSONB NOT NULL,
    "businessImpact" TEXT NOT NULL DEFAULT '',
    "skills" JSONB NOT NULL,
    "achievementId" TEXT,
    "questionIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StarStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningPlan" (
    "id" TEXT NOT NULL,
    "postingId" TEXT,
    "targetId" TEXT,
    "goal" TEXT NOT NULL DEFAULT '',
    "plannedWith" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningTopic" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prerequisites" JSONB NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "effortHours" INTEGER NOT NULL DEFAULT 2,
    "exercises" JSONB NOT NULL,
    "miniProjects" JSONB NOT NULL,
    "interviewQuestions" JSONB NOT NULL,
    "resources" JSONB NOT NULL,
    "status" "LearningStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "LearningTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyResearch" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "research" JSONB NOT NULL,
    "sources" JSONB NOT NULL,
    "researchedWith" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyResearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiTaskConfig" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "temperature" TEXT NOT NULL DEFAULT '',
    "maxTokens" INTEGER,
    "timeoutSeconds" INTEGER,
    "retries" INTEGER,
    "fallbackModel" TEXT NOT NULL DEFAULT '',
    "contextLimit" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxConcurrency" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiTaskConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cachedTokens" INTEGER,
    "estimatedCost" INTEGER,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigestRun" (
    "id" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "markdown" TEXT NOT NULL DEFAULT '',
    "sentAt" TIMESTAMP(3),
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigestRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CareerAchievement_status_sort_idx" ON "CareerAchievement"("status", "sort");

-- CreateIndex
CREATE INDEX "CareerAchievement_experienceId_idx" ON "CareerAchievement"("experienceId");

-- CreateIndex
CREATE INDEX "KnowledgeDoc_status_createdAt_idx" ON "KnowledgeDoc"("status", "createdAt");

-- CreateIndex
CREATE INDEX "JobSearchProfile_enabled_lastRunAt_idx" ON "JobSearchProfile"("enabled", "lastRunAt");

-- CreateIndex
CREATE INDEX "DiscoveryRun_profileId_createdAt_idx" ON "DiscoveryRun"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscoveryRun_status_idx" ON "DiscoveryRun"("status");

-- CreateIndex
CREATE INDEX "JobAssessment_decision_score_idx" ON "JobAssessment"("decision", "score");

-- CreateIndex
CREATE INDEX "JobAssessment_profileId_idx" ON "JobAssessment"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "JobAssessment_postingId_key" ON "JobAssessment"("postingId");

-- CreateIndex
CREATE INDEX "SalaryEstimate_company_idx" ON "SalaryEstimate"("company");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryEstimate_postingId_key" ON "SalaryEstimate"("postingId");

-- CreateIndex
CREATE INDEX "ResumeCritique_createdAt_idx" ON "ResumeCritique"("createdAt");

-- CreateIndex
CREATE INDEX "DocumentEvidence_achievementId_idx" ON "DocumentEvidence"("achievementId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentEvidence_documentId_achievementId_unitId_key" ON "DocumentEvidence"("documentId", "achievementId", "unitId");

-- CreateIndex
CREATE INDEX "GapQuestion_status_priority_idx" ON "GapQuestion"("status", "priority");

-- CreateIndex
CREATE INDEX "GapQuestion_postingId_idx" ON "GapQuestion"("postingId");

-- CreateIndex
CREATE INDEX "GapQuestion_applicationId_idx" ON "GapQuestion"("applicationId");

-- CreateIndex
CREATE INDEX "InterviewPlan_postingId_idx" ON "InterviewPlan"("postingId");

-- CreateIndex
CREATE INDEX "InterviewPlan_applicationId_idx" ON "InterviewPlan"("applicationId");

-- CreateIndex
CREATE INDEX "InterviewQuestion_planId_category_idx" ON "InterviewQuestion"("planId", "category");

-- CreateIndex
CREATE INDEX "MockSession_status_startedAt_idx" ON "MockSession"("status", "startedAt");

-- CreateIndex
CREATE INDEX "StarStory_updatedAt_idx" ON "StarStory"("updatedAt");

-- CreateIndex
CREATE INDEX "LearningPlan_postingId_idx" ON "LearningPlan"("postingId");

-- CreateIndex
CREATE INDEX "LearningTopic_planId_sequence_idx" ON "LearningTopic"("planId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyResearch_company_key" ON "CompanyResearch"("company");

-- CreateIndex
CREATE INDEX "AiUsageLog_task_createdAt_idx" ON "AiUsageLog"("task", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");

-- AddForeignKey
ALTER TABLE "CareerAchievement" ADD CONSTRAINT "CareerAchievement_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryRun" ADD CONSTRAINT "DiscoveryRun_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "JobSearchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAssessment" ADD CONSTRAINT "JobAssessment_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAssessment" ADD CONSTRAINT "JobAssessment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "JobSearchProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryEstimate" ADD CONSTRAINT "SalaryEstimate_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentEvidence" ADD CONSTRAINT "DocumentEvidence_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentEvidence" ADD CONSTRAINT "DocumentEvidence_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "CareerAchievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GapQuestion" ADD CONSTRAINT "GapQuestion_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GapQuestion" ADD CONSTRAINT "GapQuestion_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GapQuestion" ADD CONSTRAINT "GapQuestion_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "CareerAchievement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewPlan" ADD CONSTRAINT "InterviewPlan_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewPlan" ADD CONSTRAINT "InterviewPlan_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InterviewPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockSession" ADD CONSTRAINT "MockSession_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InterviewPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarStory" ADD CONSTRAINT "StarStory_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "CareerAchievement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPlan" ADD CONSTRAINT "LearningPlan_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningTopic" ADD CONSTRAINT "LearningTopic_planId_fkey" FOREIGN KEY ("planId") REFERENCES "LearningPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
