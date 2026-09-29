CREATE TABLE "video_posts" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "caption" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_posts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "video_posts_createdAt_idx" ON "video_posts"("createdAt");
CREATE INDEX "video_posts_creatorId_createdAt_idx" ON "video_posts"("creatorId", "createdAt");

ALTER TABLE "video_posts" ADD CONSTRAINT "video_posts_creatorId_fkey"
    FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
