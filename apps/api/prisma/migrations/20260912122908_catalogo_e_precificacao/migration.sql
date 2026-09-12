-- CreateEnum
CREATE TYPE "Especie" AS ENUM ('CANINO', 'FELINO', 'EQUINO', 'AVE', 'ROEDOR', 'REPTIL');

-- CreateTable
CREATE TABLE "insumo" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "custoPorGramaEmMicro" INTEGER NOT NULL,
    "custoDeReferenciaPorGramaEmMicro" INTEGER NOT NULL DEFAULT 0,
    "markupEmCentesimos" INTEGER NOT NULL,
    "estoqueEmMiligramas" INTEGER NOT NULL DEFAULT 0,
    "controlado" BOOLEAN NOT NULL DEFAULT false,
    "listaDeControle" TEXT,
    "desativadoEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "insumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forma_farmaceutica" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "desativadaEm" TIMESTAMPTZ(3),
    "criadaEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "forma_farmaceutica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restricao_de_forma" (
    "id" UUID NOT NULL,
    "insumoId" UUID NOT NULL,
    "formaId" UUID NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadaEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restricao_de_forma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faixa_terapeutica" (
    "id" UUID NOT NULL,
    "insumoId" UUID NOT NULL,
    "especie" "Especie" NOT NULL,
    "pesoMinimoEmGramas" INTEGER,
    "pesoMaximoEmGramas" INTEGER,
    "doseMinimaEmMicrogramasPorKg" INTEGER NOT NULL,
    "doseMaximaEmMicrogramasPorKg" INTEGER NOT NULL,
    "duracaoMaximaEmDias" INTEGER,
    "observacao" TEXT,
    "criadaEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "faixa_terapeutica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condicoes_comerciais" (
    "id" TEXT NOT NULL DEFAULT 'padrao',
    "taxaDeManipulacaoEmCentavos" INTEGER NOT NULL DEFAULT 0,
    "custoDeEmbalagensEmCentavos" INTEGER NOT NULL DEFAULT 0,
    "descontoEmPontosBase" INTEGER NOT NULL DEFAULT 0,
    "adicionalDeEntregaEmCentavos" INTEGER NOT NULL DEFAULT 0,
    "adicionalDeBiscoitoEmCentavos" INTEGER NOT NULL DEFAULT 0,
    "atualizadasEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "condicoes_comerciais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "insumo_codigo_key" ON "insumo"("codigo");

-- CreateIndex
CREATE INDEX "insumo_descricao_idx" ON "insumo"("descricao");

-- CreateIndex
CREATE INDEX "insumo_controlado_idx" ON "insumo"("controlado");

-- CreateIndex
CREATE UNIQUE INDEX "forma_farmaceutica_nome_key" ON "forma_farmaceutica"("nome");

-- CreateIndex
CREATE INDEX "restricao_de_forma_insumoId_idx" ON "restricao_de_forma"("insumoId");

-- CreateIndex
CREATE UNIQUE INDEX "restricao_de_forma_insumoId_formaId_key" ON "restricao_de_forma"("insumoId", "formaId");

-- CreateIndex
CREATE INDEX "faixa_terapeutica_insumoId_especie_idx" ON "faixa_terapeutica"("insumoId", "especie");

-- AddForeignKey
ALTER TABLE "restricao_de_forma" ADD CONSTRAINT "restricao_de_forma_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restricao_de_forma" ADD CONSTRAINT "restricao_de_forma_formaId_fkey" FOREIGN KEY ("formaId") REFERENCES "forma_farmaceutica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faixa_terapeutica" ADD CONSTRAINT "faixa_terapeutica_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
