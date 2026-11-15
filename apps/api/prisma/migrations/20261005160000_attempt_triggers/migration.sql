ALTER TABLE "OperationRun" ADD COLUMN "nextTrigger" TEXT NOT NULL DEFAULT 'initial', ADD COLUMN "nextRequestedBy" TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE "OperationAttempt" ADD COLUMN "trigger" TEXT NOT NULL DEFAULT 'initial', ADD COLUMN "requestedBy" TEXT NOT NULL DEFAULT 'owner';
