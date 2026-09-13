-- CreateEnum
CREATE TYPE "SituacaoDaClinica" AS ENUM ('PENDENTE', 'ATIVA', 'SUSPENSA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcaoAuditada" ADD VALUE 'CLINICA_CRIADA';
ALTER TYPE "AcaoAuditada" ADD VALUE 'CLINICA_ALTERADA';
ALTER TYPE "AcaoAuditada" ADD VALUE 'VINCULO_CRIADO';
ALTER TYPE "AcaoAuditada" ADD VALUE 'VINCULO_REMOVIDO';

-- AlterEnum
ALTER TYPE "Papel" ADD VALUE 'CLINICA';

-- AlterTable
ALTER TABLE "condicoes_comerciais" ADD COLUMN     "clinicaId" UUID,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "receita" ADD COLUMN     "clinicaCnpj" TEXT,
ADD COLUMN     "clinicaId" UUID,
ADD COLUMN     "clinicaNome" TEXT;

-- AlterTable
ALTER TABLE "tutor" ADD COLUMN     "clinicaId" UUID;

-- CreateTable
CREATE TABLE "clinica" (
    "id" UUID NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "inscricaoEstadual" TEXT,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" CHAR(2),
    "logotipo" BYTEA,
    "logotipoTipo" TEXT,
    "responsavelLegal" TEXT NOT NULL,
    "cpfDoResponsavel" TEXT,
    "situacao" "SituacaoDaClinica" NOT NULL DEFAULT 'PENDENTE',
    "observacoesInternas" TEXT,
    "criadaEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "clinica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinica_usuario" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "cargo" TEXT,
    "encerradoEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinica_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinica_cnpj_key" ON "clinica"("cnpj");

-- CreateIndex
CREATE INDEX "clinica_nomeFantasia_idx" ON "clinica"("nomeFantasia");

-- CreateIndex
CREATE INDEX "clinica_situacao_idx" ON "clinica"("situacao");

-- CreateIndex
CREATE INDEX "clinica_usuario_usuarioId_idx" ON "clinica_usuario"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "clinica_usuario_clinicaId_usuarioId_key" ON "clinica_usuario"("clinicaId", "usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "condicoes_comerciais_clinicaId_key" ON "condicoes_comerciais"("clinicaId");

-- CreateIndex
CREATE INDEX "receita_clinicaId_idx" ON "receita"("clinicaId");

-- CreateIndex
CREATE INDEX "tutor_clinicaId_idx" ON "tutor"("clinicaId");

-- AddForeignKey
ALTER TABLE "condicoes_comerciais" ADD CONSTRAINT "condicoes_comerciais_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor" ADD CONSTRAINT "tutor_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinica"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receita" ADD CONSTRAINT "receita_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinica_usuario" ADD CONSTRAINT "clinica_usuario_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinica_usuario" ADD CONSTRAINT "clinica_usuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

