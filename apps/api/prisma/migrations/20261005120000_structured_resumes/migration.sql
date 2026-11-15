-- CreateTable
CREATE TABLE "CandidateProfile" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "content" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeDraft" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "profileRevision" INTEGER NOT NULL,
    "profileSnapshot" JSONB NOT NULL,
    "vacancySnapshot" JSONB NOT NULL,
    "content" JSONB NOT NULL,
    "baseline" JSONB NOT NULL,
    "requirements" JSONB NOT NULL,
    "parentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResumeDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeVersion" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "parentVersionId" TEXT,
    "profileSnapshot" JSONB NOT NULL,
    "vacancySnapshot" JSONB NOT NULL,
    "content" JSONB NOT NULL,
    "requirements" JSONB NOT NULL,
    "acceptedDiff" JSONB NOT NULL,
    "artifactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateProfile_ownerId_key" ON "CandidateProfile"("ownerId");

-- CreateIndex
CREATE INDEX "ResumeDraft_ownerId_updatedAt_idx" ON "ResumeDraft"("ownerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeVersion_artifactId_key" ON "ResumeVersion"("artifactId");

-- CreateIndex
CREATE INDEX "ResumeVersion_ownerId_createdAt_idx" ON "ResumeVersion"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeVersion_draftId_number_key" ON "ResumeVersion"("draftId", "number");

-- AddForeignKey
ALTER TABLE "ResumeVersion" ADD CONSTRAINT "ResumeVersion_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ResumeDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeVersion" ADD CONSTRAINT "ResumeVersion_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "ResumeArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
