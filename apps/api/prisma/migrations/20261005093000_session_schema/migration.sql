-- Keep the session-store table represented in the Prisma schema for future migrations.
ALTER TABLE "session" ALTER COLUMN "sid" TYPE VARCHAR(255);
