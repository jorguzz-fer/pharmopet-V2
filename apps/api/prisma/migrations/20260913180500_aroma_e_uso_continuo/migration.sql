-- CreateEnum
CREATE TYPE "Aroma" AS ENUM ('CARNE', 'FRANGO', 'BANANA', 'MORANGO');

-- AlterTable
ALTER TABLE "forma_farmaceutica" ADD COLUMN     "aceitaAroma" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "formulacao" ADD COLUMN     "aroma" "Aroma",
ADD COLUMN     "usoContinuo" BOOLEAN NOT NULL DEFAULT false;


-- Marca as formas que o animal come, uma vez, pelo nome.
--
-- Casar por nome é frágil como regra permanente — por isso a coluna existe —,
-- mas serve como ponto de partida para o catálogo já cadastrado: sem isto,
-- toda forma nasceria sem aroma e alguém teria que marcar uma a uma.
UPDATE "forma_farmaceutica"
SET "aceitaAroma" = true
WHERE "nome" ILIKE '%BISCOIT%'
   OR "nome" ILIKE '%PETISC%'
   OR "nome" ILIKE '%PASTA%'
   OR "nome" ILIKE '%SUSPENS%'
   OR "nome" ILIKE '%PALAT%';
