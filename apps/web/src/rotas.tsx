import type { RouteObject } from 'react-router';
import { Layout } from '@/Layout';
import { Estado } from '@/paginas/estado/Estado';
import { NaoEncontrada } from '@/paginas/NaoEncontrada';
import { Sistema } from '@/paginas/sistema/Sistema';

/**
 * Rotas da aplicação.
 *
 * Ficam num arquivo só, como dado, para que "quais telas existem" seja uma
 * pergunta com uma resposta — e para o teste montar a árvore numa rota
 * específica sem subir o app inteiro.
 */
export const rotas: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Estado /> },
      { path: 'sistema', element: <Sistema /> },
      { path: '*', element: <NaoEncontrada /> },
    ],
  },
];
