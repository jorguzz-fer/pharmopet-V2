-- AlterTable
ALTER TABLE "receita" ADD COLUMN     "tokenPublico" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "receita_tokenPublico_key" ON "receita"("tokenPublico");

