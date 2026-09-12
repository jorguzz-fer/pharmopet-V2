-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('ADMIN', 'VETERINARIO', 'FARMACIA');

-- CreateEnum
CREATE TYPE "AcaoAuditada" AS ENUM ('ENTRADA_ACEITA', 'ENTRADA_RECUSADA', 'CONTA_BLOQUEADA', 'SAIDA', 'SENHA_ALTERADA', 'USUARIO_CRIADO', 'USUARIO_DESATIVADO');

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "crmv" TEXT,
    "desativadoEm" TIMESTAMPTZ(3),
    "sessoesValidasDesde" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tentativasFalhas" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoAte" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessao" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "expiraEm" TIMESTAMPTZ(3) NOT NULL,
    "revogadaEm" TIMESTAMPTZ(3),
    "ip" TEXT,
    "agenteDeUsuario" TEXT,
    "criadaEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUsoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_de_auditoria" (
    "id" UUID NOT NULL,
    "usuarioId" UUID,
    "acao" "AcaoAuditada" NOT NULL,
    "alvo" TEXT,
    "detalhe" JSONB,
    "ip" TEXT,
    "agenteDeUsuario" TEXT,
    "ocorridoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_de_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE INDEX "usuario_papel_idx" ON "usuario"("papel");

-- CreateIndex
CREATE UNIQUE INDEX "sessao_tokenHash_key" ON "sessao"("tokenHash");

-- CreateIndex
CREATE INDEX "sessao_usuarioId_idx" ON "sessao"("usuarioId");

-- CreateIndex
CREATE INDEX "sessao_expiraEm_idx" ON "sessao"("expiraEm");

-- CreateIndex
CREATE INDEX "evento_de_auditoria_usuarioId_ocorridoEm_idx" ON "evento_de_auditoria"("usuarioId", "ocorridoEm");

-- CreateIndex
CREATE INDEX "evento_de_auditoria_acao_ocorridoEm_idx" ON "evento_de_auditoria"("acao", "ocorridoEm");

-- AddForeignKey
ALTER TABLE "sessao" ADD CONSTRAINT "sessao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_de_auditoria" ADD CONSTRAINT "evento_de_auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
