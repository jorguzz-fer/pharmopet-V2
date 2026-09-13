-- O pedido de redefinição entra na trilha de auditoria: é uma tentativa de
-- tomar posse de uma conta, e precisa deixar rastro mesmo quando não resulta
-- em e-mail nenhum (conta inexistente ou desativada).
ALTER TYPE "AcaoAuditada" ADD VALUE 'REDEFINICAO_PEDIDA';
