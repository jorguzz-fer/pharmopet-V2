import type { RouteObject } from 'react-router';
import { Layout } from '@/Layout';
import { Bulario } from '@/paginas/bulario/Bulario';
import { Catalogo } from '@/paginas/catalogo/Catalogo';
import { Clinicas } from '@/paginas/clinicas/Clinicas';
import { FichaDaClinica } from '@/paginas/clinicas/FichaDaClinica';
import { NovaClinica } from '@/paginas/clinicas/NovaClinica';
import { Equipe } from '@/paginas/equipe/Equipe';
import { Estado } from '@/paginas/estado/Estado';
import { Login } from '@/paginas/login/Login';
import { NaoEncontrada } from '@/paginas/NaoEncontrada';
import { ReceitaPublica } from '@/paginas/publico/ReceitaPublica';
import { EsqueciSenha } from '@/paginas/senha/EsqueciSenha';
import { RedefinirSenha } from '@/paginas/senha/RedefinirSenha';
import { Pedidos } from '@/paginas/pedidos/Pedidos';
import { NovaReceita } from '@/paginas/receitas/NovaReceita';
import { Receita } from '@/paginas/receitas/Receita';
import { Receitas } from '@/paginas/receitas/Receitas';
import { Relatorios } from '@/paginas/relatorios/Relatorios';
import { Sistema } from '@/paginas/sistema/Sistema';
import { FichaDoTutor } from '@/paginas/tutores/FichaDoTutor';
import { Tutores } from '@/paginas/tutores/Tutores';
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
 *
 * O que cada papel pode fazer é decidido pela API, e não aqui. A navegação
 * esconde o que não serve àquele papel, mas esconder não é proteger: quem
 * digitar a URL de uma tela que não lhe cabe recebe a recusa do servidor, que
 * é onde a regra mora.
 */
export const rotas: RouteObject[] = [
  { path: '/entrar', element: <Login /> },
  // Anônimas pelo mesmo motivo da entrada: quem chega aqui é justamente quem
  // não consegue abrir sessão. O que autoriza a troca é o token do e-mail,
  // conferido pela API.
  { path: '/esqueci-senha', element: <EsqueciSenha /> },
  { path: '/redefinir-senha', element: <RedefinirSenha /> },
  // Fora do `ExigeSessao` de propósito, e a única assim: é o link que o tutor
  // abre, e ele não tem nem vai ter login (ADR 0013). Quem autoriza é o token
  // da URL, conferido pela API. O caminho é curto porque vai inteiro numa
  // mensagem de WhatsApp, atrás de um token que já é longo.
  { path: '/r/:token', element: <ReceitaPublica /> },
  {
    element: <ExigeSessao />,
    children: [
      {
        path: '/',
        element: <Layout />,
        children: [
          // A lista de receitas é a primeira tela: é o que a farmácia abre para
          // trabalhar e o que o veterinário abre para continuar de onde parou.
          { index: true, element: <Receitas /> },
          { path: 'tutores', element: <Tutores /> },
          { path: 'tutores/:id', element: <FichaDoTutor /> },
          { path: 'receitas', element: <Receitas /> },
          // Antes de `receitas/:id`, senão "nova" seria lido como um id.
          { path: 'receitas/nova', element: <NovaReceita /> },
          { path: 'receitas/:id', element: <Receita /> },
          { path: 'pedidos', element: <Pedidos /> },
          { path: 'clinicas', element: <Clinicas /> },
          // Antes de `clinicas/:id`, pelo mesmo motivo de `receitas/nova`.
          { path: 'clinicas/nova', element: <NovaClinica /> },
          { path: 'clinicas/:id', element: <FichaDaClinica /> },
          { path: 'bulario', element: <Bulario /> },
          { path: 'catalogo', element: <Catalogo /> },
          { path: 'equipe', element: <Equipe /> },
          { path: 'relatorios', element: <Relatorios /> },
          { path: 'estado', element: <Estado /> },
          { path: 'sistema', element: <Sistema /> },
          { path: '*', element: <NaoEncontrada /> },
        ],
      },
    ],
  },
];
