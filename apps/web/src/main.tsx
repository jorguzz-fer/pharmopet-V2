import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { ProvedorDeSessao } from '@/sessao/ProvedorDeSessao';
import { rotas } from '@/rotas';
import '@/estilos/global.css';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado no index.html.');

createRoot(raiz).render(
  <StrictMode>
    {/* Fora do router: a sessão é consultada uma vez só, e não a cada
        navegação — e o estado sobrevive à troca de rota. */}
    <ProvedorDeSessao>
      <RouterProvider router={createBrowserRouter(rotas)} />
    </ProvedorDeSessao>
  </StrictMode>,
);
