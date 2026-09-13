-- Bulário magistral: o que a farmácia publica como referência clínica.
-- Ver ADR 0015 para por que é separado do catálogo.
CREATE TABLE "formulacao_do_bulario" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "linhaTerapeutica" TEXT NOT NULL,
    "linhaExclusiva" TEXT,
    "formaFarmaceutica" TEXT,
    "indicacao" TEXT,
    "diferencial" TEXT,
    "composicao" TEXT,
    "modoDeUsar" TEXT,
    "observacoes" TEXT,
    "especies" "Especie"[],
    "criadaEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "formulacao_do_bulario_pkey" PRIMARY KEY ("id")
);

-- O número do guia é a chave da reimportação: rodar de novo atualiza, não duplica.
CREATE UNIQUE INDEX "formulacao_do_bulario_numero_key" ON "formulacao_do_bulario"("numero");

CREATE INDEX "formulacao_do_bulario_linhaTerapeutica_idx" ON "formulacao_do_bulario"("linhaTerapeutica");
