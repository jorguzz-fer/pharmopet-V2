import type { RouteObject } from 'react-router';
import { Layout } from '@/Layout';
import { Estado } from '@/paginas/estado/Estado';
import { Login } from '@/paginas/login/Login';
import { NaoEncontrada } from '@/paginas/NaoEncontrada';
import { Sistema } from '@/paginas/sistema/Sistema';
import { ExigeSessao } from '@/sessao/ExigeSessao';

/**
 * Rotas da aplicação.
 *
 * Ficam num arquivo só, como dado, para que "quais telas existem, e quais
 * exigem sessão" seja uma pergunta com uma resposta — e para o teste montar a
 * árvore numa rota específica sem subir o app inteiro.
 *
 * Tudo que não for a de entrada nasce dentro do `ExigeSessao`, pelo mesmo motivo
 * de a API negar por padrão: esquecer de proteger não deve ser possível por
 * omissão.
 */
export const rotas: RouteObject[] = [
  { path: '/entrar', element: <Login /> },
  {
    element: <ExigeSessao />,
    children: [
      {
        path: '/',
        element: <Layout />,
        children: [
          { index: true, element: <Estado /> },
          { path: 'sistema', element: <Sistema /> },
          { path: '*', element: <NaoEncontrada /> },
        ],
      },
    ],
  },
];
