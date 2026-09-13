-- AlterEnum
ALTER TYPE "AcaoAuditada" ADD VALUE 'PEDIDO_ENVIADO';
ALTER TYPE "AcaoAuditada" ADD VALUE 'PEDIDO_MUDOU_DE_ESTADO';

-- CreateEnum
CREATE TYPE "EstadoDoPedido" AS ENUM ('EM_ANALISE', 'EM_PRODUCAO', 'PRONTO', 'ENTREGUE', 'CANCELADO');

-- CreateEnum
CREATE TYPE "DestinoDaEntrega" AS ENUM ('CLINICA', 'TUTOR');

-- CreateTable
CREATE TABLE "pedido" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "receitaId" UUID NOT NULL,
    "estado" "EstadoDoPedido" NOT NULL DEFAULT 'EM_ANALISE',
    "enviadoPorId" UUID NOT NULL,
    "destino" "DestinoDaEntrega" NOT NULL,
    "enderecoDeEntrega" TEXT NOT NULL,
    "observacoes" TEXT,
    "motivoDoCancelamento" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "producaoEm" TIMESTAMPTZ(3),
    "prontoEm" TIMESTAMPTZ(3),
    "entregueEm" TIMESTAMPTZ(3),

    CONSTRAINT "pedido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pedido_numero_key" ON "pedido"("numero");

-- CreateIndex
CREATE INDEX "pedido_estado_criadoEm_idx" ON "pedido"("estado", "criadoEm");

-- CreateIndex
CREATE INDEX "pedido_receitaId_idx" ON "pedido"("receitaId");

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_receitaId_fkey" FOREIGN KEY ("receitaId") REFERENCES "receita"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Uma receita tem no máximo um pedido vivo.
--
-- Índice parcial, e não conferência no serviço: a conferência perde a corrida
-- entre dois cliques no mesmo botão, e o que sai do outro lado são duas
-- manipulações do mesmo controlado. Cancelado o pedido, a receita volta a
-- poder ser enviada.
--
-- Não é representável no schema.prisma (índices parciais não têm sintaxe), por
-- isso mora aqui. Ao gerar a próxima migration por `migrate diff`, confira se
-- ela não está propondo remover este índice.
CREATE UNIQUE INDEX "pedido_um_vivo_por_receita"
    ON "pedido" ("receitaId")
    WHERE "estado" <> 'CANCELADO';
