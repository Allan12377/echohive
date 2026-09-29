CREATE TABLE "status_updates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "mediaType" VARCHAR(100) NOT NULL,
    "caption" VARCHAR(280),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "status_updates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "status_updates_expiresAt_createdAt_idx" ON "status_updates"("expiresAt", "createdAt");
CREATE INDEX "status_updates_userId_createdAt_idx" ON "status_updates"("userId", "createdAt");

ALTER TABLE "status_updates" ADD CONSTRAINT "status_updates_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
