CREATE TABLE "OperationRun" (
 "id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL, "kind" TEXT NOT NULL, "targetId" TEXT,
 "requestKey" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'queued', "input" JSONB NOT NULL,
 "output" JSONB, "decisions" JSONB NOT NULL DEFAULT '{}', "generation" INTEGER NOT NULL DEFAULT 0,
 "attemptCount" INTEGER NOT NULL DEFAULT 0, "maxAttempts" INTEGER NOT NULL DEFAULT 3,
 "activeAttemptId" TEXT, "leaseUntil" TIMESTAMP(3), "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "dispatchedAt" TIMESTAMP(3), "errorCode" TEXT, "errorReason" TEXT, "retryable" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 "completedAt" TIMESTAMP(3),
 CONSTRAINT "OperationRun_status_check" CHECK ("status" IN ('queued','running','retrying','succeeded','failed')),
 CONSTRAINT "OperationRun_budget_check" CHECK ("attemptCount" >= 0 AND "maxAttempts" BETWEEN 1 AND 30)
);
CREATE UNIQUE INDEX "OperationRun_ownerId_requestKey_key" ON "OperationRun"("ownerId","requestKey");
CREATE INDEX "OperationRun_status_nextAttemptAt_idx" ON "OperationRun"("status","nextAttemptAt");
CREATE INDEX "OperationRun_ownerId_createdAt_idx" ON "OperationRun"("ownerId","createdAt");
CREATE TABLE "OperationAttempt" (
 "id" TEXT PRIMARY KEY, "runId" TEXT NOT NULL REFERENCES "OperationRun"("id") ON DELETE CASCADE,
 "number" INTEGER NOT NULL, "workerId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'running',
 "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "finishedAt" TIMESTAMP(3), "errorCode" TEXT, "errorReason" TEXT, "retryable" BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX "OperationAttempt_runId_number_key" ON "OperationAttempt"("runId","number");
CREATE TABLE "WorkerHeartbeat" (
 "id" TEXT PRIMARY KEY, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "queueHealthy" BOOLEAN NOT NULL DEFAULT false,
 "aiStatus" TEXT NOT NULL
);
