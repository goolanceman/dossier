-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "applicationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ResumeCritique" ADD COLUMN     "appliedDocumentId" TEXT;

-- CreateTable
CREATE TABLE "CareerPlan" (
    "id" TEXT NOT NULL,
    "targetId" TEXT,
    "basedOn" TEXT NOT NULL DEFAULT 'PROFILE',
    "headline" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "items" JSONB NOT NULL,
    "critiqueId" TEXT,
    "planWith" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CareerPlan_updatedAt_idx" ON "CareerPlan"("updatedAt");

-- AddForeignKey
ALTER TABLE "ResumeCritique" ADD CONSTRAINT "ResumeCritique_appliedDocumentId_fkey" FOREIGN KEY ("appliedDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerPlan" ADD CONSTRAINT "CareerPlan_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "CareerTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

