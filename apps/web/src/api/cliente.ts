import { criarClienteApi } from '@pharmopet/api-client';
import { ambiente } from '@/config/ambiente';

/**
 * Instância única do cliente da API para o app.
 *
 * Uma só, e criada num lugar só, porque é aqui que mora a decisão de para onde
 * o front fala. Componente nenhum monta URL na mão.
 */
export const api = criarClienteApi({ baseUrl: ambiente.VITE_API_URL });
