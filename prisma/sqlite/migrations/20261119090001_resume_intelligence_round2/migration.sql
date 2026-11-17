-- CreateTable
CREATE TABLE "CareerPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetId" TEXT,
    "basedOn" TEXT NOT NULL DEFAULT 'PROFILE',
    "headline" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "items" JSONB NOT NULL,
    "critiqueId" TEXT,
    "planWith" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CareerPlan_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "CareerTarget" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT,
    "kind" TEXT NOT NULL,
    "units" JSONB NOT NULL,
    "themeId" TEXT,
    "writtenWith" TEXT,
    "trimmed" JSONB,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Document_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("applicationId", "id", "kind", "themeId", "trimmed", "units", "updatedAt", "writtenWith") SELECT "applicationId", "id", "kind", "themeId", "trimmed", "units", "updatedAt", "writtenWith" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
CREATE UNIQUE INDEX "Document_applicationId_kind_key" ON "Document"("applicationId", "kind");
CREATE TABLE "new_ResumeCritique" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "overall" JSONB NOT NULL,
    "findings" JSONB NOT NULL,
    "keywordCoverage" JSONB NOT NULL,
    "formattingIssues" JSONB NOT NULL,
    "targetId" TEXT DEFAULT '',
    "critiquedWith" TEXT NOT NULL DEFAULT '',
    "appliedDocumentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResumeCritique_appliedDocumentId_fkey" FOREIGN KEY ("appliedDocumentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ResumeCritique" ("content", "createdAt", "critiquedWith", "fileName", "findings", "formattingIssues", "id", "keywordCoverage", "overall", "targetId") SELECT "content", "createdAt", "critiquedWith", "fileName", "findings", "formattingIssues", "id", "keywordCoverage", "overall", "targetId" FROM "ResumeCritique";
DROP TABLE "ResumeCritique";
ALTER TABLE "new_ResumeCritique" RENAME TO "ResumeCritique";
CREATE INDEX "ResumeCritique_createdAt_idx" ON "ResumeCritique"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CareerPlan_updatedAt_idx" ON "CareerPlan"("updatedAt");

