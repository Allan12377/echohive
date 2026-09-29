-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "attachmentName" TEXT,
ADD COLUMN     "attachmentSize" INTEGER,
ADD COLUMN     "attachmentType" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "about" VARCHAR(139);
