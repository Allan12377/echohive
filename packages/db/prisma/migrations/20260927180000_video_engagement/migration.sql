CREATE TABLE "video_likes" (
    "id" TEXT NOT NULL,
    "videoPostId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "video_likes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "video_comments" (
    "id" TEXT NOT NULL,
    "videoPostId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "video_comments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "video_likes_videoPostId_userId_key" ON "video_likes"("videoPostId", "userId");
CREATE INDEX "video_likes_videoPostId_createdAt_idx" ON "video_likes"("videoPostId", "createdAt");
CREATE INDEX "video_comments_videoPostId_createdAt_idx" ON "video_comments"("videoPostId", "createdAt");

ALTER TABLE "video_likes" ADD CONSTRAINT "video_likes_videoPostId_fkey" FOREIGN KEY ("videoPostId") REFERENCES "video_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_likes" ADD CONSTRAINT "video_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_comments" ADD CONSTRAINT "video_comments_videoPostId_fkey" FOREIGN KEY ("videoPostId") REFERENCES "video_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_comments" ADD CONSTRAINT "video_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
