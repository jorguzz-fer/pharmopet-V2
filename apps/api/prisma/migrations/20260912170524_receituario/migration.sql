-- CreateEnum
CREATE TYPE "Sexo" AS ENUM ('MACHO', 'FEMEA');

-- CreateEnum
CREATE TYPE "EstadoDaReceita" AS ENUM ('RASCUNHO', 'EMITIDA', 'CANCELADA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcaoAuditada" ADD VALUE 'RECEITA_EMITIDA';
ALTER TYPE "AcaoAuditada" ADD VALUE 'RECEITA_CANCELADA';

-- CreateTable
CREATE TABLE "tutor" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" CHAR(2),
    "observacoes" TEXT,
    "cadastradoPorId" UUID NOT NULL,
    "desativadoEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tutor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paciente" (
    "id" UUID NOT NULL,
    "tutorId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "especie" "Especie" NOT NULL,
    "raca" TEXT,
    "sexo" "Sexo",
    "castrado" BOOLEAN NOT NULL DEFAULT false,
    "pesoEmGramas" INTEGER,
    "pesoAferidoEm" TIMESTAMPTZ(3),
    "nascimentoEm" DATE,
    "observacoes" TEXT,
    "obitoEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "paciente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receita" (
    "id" UUID NOT NULL,
    "numero" INTEGER,
    "estado" "EstadoDaReceita" NOT NULL DEFAULT 'RASCUNHO',
    "veterinarioId" UUID NOT NULL,
    "pacienteId" UUID NOT NULL,
    "crmvDoVeterinario" TEXT,
    "pesoDoPacienteEmGramas" INTEGER,
    "emitidaEm" TIMESTAMPTZ(3),
    "validaAte" TIMESTAMPTZ(3),
    "prazoEmDias" INTEGER,
    "prazoMotivo" TEXT,
    "canceladaEm" TIMESTAMPTZ(3),
    "motivoDoCancelamento" TEXT,
    "observacoes" TEXT,
    "criadaEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "receita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formulacao" (
    "id" UUID NOT NULL,
    "receitaId" UUID NOT NULL,
    "formaId" UUID NOT NULL,
    "formaNome" TEXT,
    "frequenciaHoras" INTEGER NOT NULL,
    "dias" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "orientacao" TEXT,
    "valorEmCentavos" INTEGER,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "formulacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_da_formulacao" (
    "id" UUID NOT NULL,
    "formulacaoId" UUID NOT NULL,
    "insumoId" UUID NOT NULL,
    "insumoCodigo" TEXT,
    "insumoDescricao" TEXT,
    "listaDeControle" TEXT,
    "dosePorUnidadeEmMicrogramas" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "item_da_formulacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tutor_cpf_key" ON "tutor"("cpf");

-- CreateIndex
CREATE INDEX "tutor_nome_idx" ON "tutor"("nome");

-- CreateIndex
CREATE INDEX "tutor_cadastradoPorId_idx" ON "tutor"("cadastradoPorId");

-- CreateIndex
CREATE INDEX "paciente_tutorId_idx" ON "paciente"("tutorId");

-- CreateIndex
CREATE INDEX "paciente_nome_idx" ON "paciente"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "receita_numero_key" ON "receita"("numero");

-- CreateIndex
CREATE INDEX "receita_veterinarioId_criadaEm_idx" ON "receita"("veterinarioId", "criadaEm");

-- CreateIndex
CREATE INDEX "receita_pacienteId_idx" ON "receita"("pacienteId");

-- CreateIndex
CREATE INDEX "receita_estado_idx" ON "receita"("estado");

-- CreateIndex
CREATE INDEX "formulacao_receitaId_idx" ON "formulacao"("receitaId");

-- CreateIndex
CREATE INDEX "item_da_formulacao_insumoId_idx" ON "item_da_formulacao"("insumoId");

-- CreateIndex
CREATE UNIQUE INDEX "item_da_formulacao_formulacaoId_insumoId_key" ON "item_da_formulacao"("formulacaoId", "insumoId");

-- AddForeignKey
ALTER TABLE "tutor" ADD CONSTRAINT "tutor_cadastradoPorId_fkey" FOREIGN KEY ("cadastradoPorId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paciente" ADD CONSTRAINT "paciente_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "tutor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receita" ADD CONSTRAINT "receita_veterinarioId_fkey" FOREIGN KEY ("veterinarioId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receita" ADD CONSTRAINT "receita_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulacao" ADD CONSTRAINT "formulacao_receitaId_fkey" FOREIGN KEY ("receitaId") REFERENCES "receita"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulacao" ADD CONSTRAINT "formulacao_formaId_fkey" FOREIGN KEY ("formaId") REFERENCES "forma_farmaceutica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_da_formulacao" ADD CONSTRAINT "item_da_formulacao_formulacaoId_fkey" FOREIGN KEY ("formulacaoId") REFERENCES "formulacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_da_formulacao" ADD CONSTRAINT "item_da_formulacao_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Numeração da receita.
--
-- Sequence, e não `max(numero) + 1`: duas emissões no mesmo instante leriam o
-- mesmo máximo e tentariam gravar o mesmo número — uma falharia no índice
-- único, e o veterinário veria um erro sem causa aparente. A sequence entrega
-- número distinto a cada chamada, sem bloquear a tabela.
--
-- Fora do modelo do Prisma de propósito: `@default(autoincrement())` daria
-- número na inserção, isto é, ao rascunho. Rascunho que ninguém emite não
-- gasta número, e receita numerada que nunca foi emitida é um buraco que
-- alguém vai ter que explicar numa fiscalização.
CREATE SEQUENCE "receita_numero_seq" AS integer START WITH 1 INCREMENT BY 1;
