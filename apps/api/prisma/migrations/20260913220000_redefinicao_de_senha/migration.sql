-- Pedido de redefinição de senha. O token é guardado como hash: um vazamento
-- desta tabela não entrega link de redefinição funcionando.
CREATE TABLE "token_de_redefinicao" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMPTZ(3) NOT NULL,
    "usadoEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_de_redefinicao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "token_de_redefinicao_tokenHash_key" ON "token_de_redefinicao"("tokenHash");
CREATE INDEX "token_de_redefinicao_usuarioId_idx" ON "token_de_redefinicao"("usuarioId");

-- Cascade: conta apagada não deixa para trás um caminho de redefinição órfão.
ALTER TABLE "token_de_redefinicao" ADD CONSTRAINT "token_de_redefinicao_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
