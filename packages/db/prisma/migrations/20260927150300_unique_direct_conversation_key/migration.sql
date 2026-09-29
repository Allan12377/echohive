ALTER TABLE "conversations" ADD COLUMN "directKey" TEXT;

CREATE UNIQUE INDEX "conversations_directKey_key" ON "conversations"("directKey");