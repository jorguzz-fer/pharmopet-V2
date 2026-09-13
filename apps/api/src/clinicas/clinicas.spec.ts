import type { INestApplication } from '@nestjs/common';
import type { Papel } from '@prisma/client';
import { IdentidadeService } from '../identidade/identidade.service';
import { CABECALHO_CSRF, COOKIE_CSRF, COOKIE_SESSAO } from '../identidade/requisicao';
import { PrismaService } from '../prisma/prisma.service';
import { cliente, cookieDa, limparBanco, subirAplicacao } from '../teste/ambiente';

const SENHA = 'uma senha bem longa';

/** CNPJs consistentes, para o teste falar de regra e não de dígito verificador. */
const CNPJ_A = '11.222.333/0001-81';
const CNPJ_B = '34.028.316/0001-03';

describe('clínicas (contra Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof cliente>;
  let contador = 0;

  beforeAll(async () => {
    ({ app, prisma } = await subirAplicacao());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await limparBanco(prisma);
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "item_da_formulacao", "formulacao", "receita", "paciente", "tutor", ' +
        '"clinica_usuario", "condicoes_comerciais", "clinica", "restricao_de_forma", ' +
        '"faixa_terapeutica", "insumo", "forma_farmaceutica" CASCADE',
    );
    http = cliente(app);
  });

  async function entrarComo(papel: Papel): Promise<{ id: string; sessao: string; csrf: string }> {
    contador += 1;
    const email = `${papel.toLowerCase()}-${contador}@clinica.test`;

    const criado = await app.get(IdentidadeService).criarUsuario(
      {
        email,
        nome: `Pessoa ${contador}`,
        papel,
        senha: SENHA,
        ...(papel === 'VETERINARIO' ? { crmv: `SP-${2000 + contador}` } : {}),
      },
      { id: null },
    );

    const resposta = await http
      .post('/api/v1/auth/entrar')
      .send({ email, senha: SENHA })
      .expect(204);

    return {
      id: criado.id,
      sessao: cookieDa(resposta, COOKIE_SESSAO),
      csrf: cookieDa(resposta, COOKIE_CSRF),
    };
  }

  function autenticado(c: { sessao: string; csrf: string }) {
    const cookie = `${COOKIE_SESSAO}=${c.sessao}`;

    return {
      get: (caminho: string) => http.get(caminho).set('Cookie', cookie),
      post: (caminho: string) =>
        http.post(caminho).set('Cookie', cookie).set(CABECALHO_CSRF, c.csrf),
      put: (caminho: string) => http.put(caminho).set('Cookie', cookie).set(CABECALHO_CSRF, c.csrf),
      patch: (caminho: string) =>
        http.patch(caminho).set('Cookie', cookie).set(CABECALHO_CSRF, c.csrf),
      delete: (caminho: string) =>
        http.delete(caminho).set('Cookie', cookie).set(CABECALHO_CSRF, c.csrf),
    };
  }

  function cadastro(cnpj: string, nome = 'Clínica Bicho Solto') {
    return {
      razaoSocial: `${nome} LTDA`,
      nomeFantasia: nome,
      cnpj,
      email: 'contato@clinica.test',
      responsavelLegal: 'Marina Prado',
    };
  }

  async function criarClinicaAtiva(admin: ReturnType<typeof autenticado>, cnpj = CNPJ_A) {
    const criada = await admin.post('/api/v1/clinicas').send(cadastro(cnpj)).expect(201);
    await admin.patch(`/api/v1/clinicas/${criada.body.id}`).send({ situacao: 'ATIVA' }).expect(200);

    return criada.body.id as string;
  }

  describe('cadastro', () => {
    it('recusa quem não entrou', async () => {
      await http.get('/api/v1/clinicas').expect(401);
    });

    it.each(['VETERINARIO', 'FARMACIA'] as const)(
      'recusa %s cadastrando clínica',
      async (papel) => {
        const outro = autenticado(await entrarComo(papel));

        await outro.post('/api/v1/clinicas').send(cadastro(CNPJ_A)).expect(403);
      },
    );

    it('recusa CNPJ com dígito verificador errado', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));

      await admin.post('/api/v1/clinicas').send(cadastro('11.222.333/0001-82')).expect(400);
    });

    it('guarda o CNPJ sem máscara e devolve com', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));

      const criada = await admin.post('/api/v1/clinicas').send(cadastro(CNPJ_A)).expect(201);

      expect(criada.body.cnpj).toBe('11.222.333/0001-81');
      const noBanco = await prisma.clinica.findUniqueOrThrow({ where: { id: criada.body.id } });
      expect(noBanco.cnpj).toBe('11222333000181');
    });

    it('recusa o mesmo CNPJ duas vezes', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));
      await admin.post('/api/v1/clinicas').send(cadastro(CNPJ_A)).expect(201);

      await admin.post('/api/v1/clinicas').send(cadastro(CNPJ_A, 'Outra')).expect(409);
    });

    /** Clínica nasce pendente: ainda não recebeu o aval da farmácia. */
    it('nasce PENDENTE', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));

      const criada = await admin.post('/api/v1/clinicas').send(cadastro(CNPJ_A)).expect(201);

      expect(criada.body.situacao).toBe('PENDENTE');
    });
  });

  describe('visibilidade', () => {
    /**
     * A existência de uma clínica parceira é informação comercial. Quem não
     * tem vínculo não deveria nem saber que ela está cadastrada.
     */
    it('quem não tem vínculo não enxerga a clínica', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));
      const clinicaId = await criarClinicaAtiva(admin);

      const vet = autenticado(await entrarComo('VETERINARIO'));
      const lista = await vet.get('/api/v1/clinicas').expect(200);

      expect(lista.body.clinicas).toHaveLength(0);
      // 404, e não 403: 403 confirmaria que aquele id existe.
      await vet.get(`/api/v1/clinicas/${clinicaId}`).expect(404);
    });

    it('quem tem vínculo enxerga', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));
      const clinicaId = await criarClinicaAtiva(admin);
      const vet = await entrarComo('VETERINARIO');

      await admin
        .post(`/api/v1/clinicas/${clinicaId}/usuarios`)
        .send({ usuarioId: vet.id })
        .expect(204);

      const lista = await autenticado(vet).get('/api/v1/clinicas').expect(200);
      expect(lista.body.clinicas).toHaveLength(1);
    });

    /** Clínica suspensa deixa de valer para quem atendia nela. */
    it('vínculo em clínica não-ativa não conta', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));
      const clinicaId = await criarClinicaAtiva(admin);
      const vet = await entrarComo('VETERINARIO');
      await admin
        .post(`/api/v1/clinicas/${clinicaId}/usuarios`)
        .send({ usuarioId: vet.id })
        .expect(204);

      await admin.patch(`/api/v1/clinicas/${clinicaId}`).send({ situacao: 'SUSPENSA' }).expect(200);

      const lista = await autenticado(vet).get('/api/v1/clinicas').expect(200);
      expect(lista.body.clinicas).toHaveLength(0);
    });

    it('desvincular não apaga, encerra', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));
      const clinicaId = await criarClinicaAtiva(admin);
      const vet = await entrarComo('VETERINARIO');
      await admin
        .post(`/api/v1/clinicas/${clinicaId}/usuarios`)
        .send({ usuarioId: vet.id })
        .expect(204);

      await admin.delete(`/api/v1/clinicas/${clinicaId}/usuarios/${vet.id}`).expect(204);

      const linha = await prisma.clinicaUsuario.findFirstOrThrow({
        where: { clinicaId, usuarioId: vet.id },
      });
      expect(linha.encerradoEm).not.toBeNull();
      await autenticado(vet).get(`/api/v1/clinicas/${clinicaId}`).expect(404);
    });

    /** Vínculo que volta é a mesma relação, não uma segunda. */
    it('revincular reativa em vez de duplicar', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));
      const clinicaId = await criarClinicaAtiva(admin);
      const vet = await entrarComo('VETERINARIO');

      await admin
        .post(`/api/v1/clinicas/${clinicaId}/usuarios`)
        .send({ usuarioId: vet.id })
        .expect(204);
      await admin.delete(`/api/v1/clinicas/${clinicaId}/usuarios/${vet.id}`).expect(204);
      await admin
        .post(`/api/v1/clinicas/${clinicaId}/usuarios`)
        .send({ usuarioId: vet.id, cargo: 'Sócia' })
        .expect(204);

      const linhas = await prisma.clinicaUsuario.findMany({ where: { clinicaId } });
      expect(linhas).toHaveLength(1);
      expect(linhas[0]?.encerradoEm).toBeNull();
      expect(linhas[0]?.cargo).toBe('Sócia');
    });
  });

  describe('logotipo', () => {
    // 1×1 PNG transparente.
    const PNG =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    it('grava e devolve com o tipo certo', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));
      const clinicaId = await criarClinicaAtiva(admin);

      await admin
        .put(`/api/v1/clinicas/${clinicaId}/logotipo`)
        .send({ tipo: 'image/png', conteudoBase64: PNG })
        .expect(204);

      const baixado = await admin.get(`/api/v1/clinicas/${clinicaId}/logotipo`).expect(200);
      expect(baixado.headers['content-type']).toContain('image/png');
      expect(baixado.body).toBeInstanceOf(Buffer);
      expect((baixado.body as Buffer).length).toBeGreaterThan(0);
    });

    /**
     * `Buffer.from(x, 'base64')` não reclama de entrada inválida: ignora o que
     * não reconhece e devolve o que deu. Sem a conferência, a clínica ficaria
     * com um logotipo quebrado e ninguém saberia até imprimir uma receita.
     */
    it('recusa conteúdo que não é base64 de nada', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));
      const clinicaId = await criarClinicaAtiva(admin);

      await admin
        .put(`/api/v1/clinicas/${clinicaId}/logotipo`)
        .send({ tipo: 'image/png', conteudoBase64: '!!!!' })
        .expect(400);
    });

    it('recusa arquivo grande demais', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));
      const clinicaId = await criarClinicaAtiva(admin);

      await admin
        .put(`/api/v1/clinicas/${clinicaId}/logotipo`)
        .send({ tipo: 'image/png', conteudoBase64: 'A'.repeat(900_000) })
        .expect(400);
    });

    it('a lista não carrega o conteúdo do logotipo', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));
      const clinicaId = await criarClinicaAtiva(admin);
      await admin
        .put(`/api/v1/clinicas/${clinicaId}/logotipo`)
        .send({ tipo: 'image/png', conteudoBase64: PNG })
        .expect(204);

      const lista = await admin.get('/api/v1/clinicas').expect(200);

      expect(lista.body.clinicas[0].temLogotipo).toBe(true);
      expect(JSON.stringify(lista.body)).not.toContain(PNG.slice(0, 30));
    });

    it('recusa logotipo de quem não administra', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));
      const clinicaId = await criarClinicaAtiva(admin);
      const vet = autenticado(await entrarComo('VETERINARIO'));

      await vet
        .put(`/api/v1/clinicas/${clinicaId}/logotipo`)
        .send({ tipo: 'image/png', conteudoBase64: PNG })
        .expect(403);
    });
  });

  describe('preço por clínica', () => {
    async function semearCatalogo() {
      const forma = await prisma.formaFarmaceutica.create({ data: { nome: 'CÁPSULAS' } });
      const insumo = await prisma.insumo.create({
        data: {
          codigo: '665',
          descricao: 'Gabapentina',
          custoPorGramaEmMicro: 35_120,
          markupEmCentesimos: 648,
          estoqueEmMiligramas: 500_000,
        },
      });

      return { formaId: forma.id, insumoId: insumo.id };
    }

    /**
     * O ponto da ADR 0012: a mesma fórmula sai por valores diferentes em
     * clínicas com acordos diferentes. Sem isto, o cadastro de condições por
     * parceiro seria enfeite.
     */
    it('a condição da clínica prevalece sobre a da casa', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));
      const { formaId, insumoId } = await semearCatalogo();
      const clinicaId = await criarClinicaAtiva(admin);

      // Casa cobra R$ 35 de manipulação; a clínica parceira, nada.
      await prisma.condicoesComerciais.create({
        data: { id: 'padrao', taxaDeManipulacaoEmCentavos: 3_500 },
      });
      await prisma.condicoesComerciais.create({
        data: { clinicaId, taxaDeManipulacaoEmCentavos: 0 },
      });

      const pedido = { formaId, itens: [{ insumoId, doseMg: 100, quantidade: 20 }] };

      const semClinica = await admin.post('/api/v1/catalogo/orcamento').send(pedido).expect(200);
      const comClinica = await admin
        .post('/api/v1/catalogo/orcamento')
        .send({ ...pedido, clinicaId })
        .expect(200);

      expect(semClinica.body.valorFinalEmCentavos - comClinica.body.valorFinalEmCentavos).toBe(
        3_500,
      );
    });

    it('clínica sem acordo cai na condição da casa', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));
      const { formaId, insumoId } = await semearCatalogo();
      const clinicaId = await criarClinicaAtiva(admin, CNPJ_B);
      await prisma.condicoesComerciais.create({
        data: { id: 'padrao', taxaDeManipulacaoEmCentavos: 3_500 },
      });

      const pedido = { formaId, itens: [{ insumoId, doseMg: 100, quantidade: 20 }] };
      const semClinica = await admin.post('/api/v1/catalogo/orcamento').send(pedido).expect(200);
      const comClinica = await admin
        .post('/api/v1/catalogo/orcamento')
        .send({ ...pedido, clinicaId })
        .expect(200);

      expect(comClinica.body.valorFinalEmCentavos).toBe(semClinica.body.valorFinalEmCentavos);
    });
  });

  describe('clínica na receita', () => {
    async function semearAtendimento(vetId: string, clinicaId: string) {
      const forma = await prisma.formaFarmaceutica.create({ data: { nome: 'CÁPSULAS' } });
      const insumo = await prisma.insumo.create({
        data: {
          codigo: '665',
          descricao: 'Gabapentina',
          custoPorGramaEmMicro: 35_120,
          markupEmCentesimos: 648,
          estoqueEmMiligramas: 500_000,
        },
      });
      const tutor = await prisma.tutor.create({
        data: { nome: 'Marina Prado', cadastradoPorId: vetId, clinicaId },
      });
      const paciente = await prisma.paciente.create({
        data: {
          tutorId: tutor.id,
          nome: 'Tobias',
          especie: 'CANINO',
          pesoEmGramas: 12_000,
          pesoAferidoEm: new Date(),
        },
      });

      return { formaId: forma.id, insumoId: insumo.id, pacienteId: paciente.id };
    }

    /**
     * O documento que o tutor guarda diz o nome de então.
     *
     * Se a receita lesse o cadastro atual, renomear a clínica reescreveria
     * retroativamente todas as receitas dela — e o papel na mão do tutor
     * deixaria de bater com o que o sistema mostra.
     */
    it('congela nome e CNPJ na emissão', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));
      const vet = await entrarComo('VETERINARIO');
      const comoVet = autenticado(vet);
      const clinicaId = await criarClinicaAtiva(admin);
      await admin
        .post(`/api/v1/clinicas/${clinicaId}/usuarios`)
        .send({ usuarioId: vet.id })
        .expect(204);

      const { formaId, insumoId, pacienteId } = await semearAtendimento(vet.id, clinicaId);

      const rascunho = await comoVet
        .post('/api/v1/receituario/receitas')
        .send({
          pacienteId,
          clinicaId,
          formulacoes: [
            {
              formaId,
              frequenciaHoras: 12,
              dias: 10,
              quantidade: 20,
              itens: [{ insumoId, doseMg: 100 }],
            },
          ],
        })
        .expect(201);

      await comoVet.post(`/api/v1/receituario/receitas/${rascunho.body.id}/emitir`).expect(200);

      // A clínica muda de nome depois de a receita sair.
      await admin
        .patch(`/api/v1/clinicas/${clinicaId}`)
        .send({ nomeFantasia: 'Outro Nome Agora' })
        .expect(200);

      const depois = await comoVet
        .get(`/api/v1/receituario/receitas/${rascunho.body.id}`)
        .expect(200);

      expect(depois.body.clinicaNome).toBe('Clínica Bicho Solto');
      // Com máscara: isto sai no cabeçalho de um documento, e catorze dígitos
      // corridos não se leem como CNPJ.
      expect(depois.body.clinicaCnpj).toBe(CNPJ_A);
    });

    it('sem clínica, a receita sai no nome de quem prescreve', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));
      const vet = await entrarComo('VETERINARIO');
      const comoVet = autenticado(vet);
      const clinicaId = await criarClinicaAtiva(admin);
      const { formaId, insumoId, pacienteId } = await semearAtendimento(vet.id, clinicaId);

      const rascunho = await comoVet
        .post('/api/v1/receituario/receitas')
        .send({
          pacienteId,
          formulacoes: [
            {
              formaId,
              frequenciaHoras: 12,
              dias: 10,
              quantidade: 20,
              itens: [{ insumoId, doseMg: 100 }],
            },
          ],
        })
        .expect(201);

      expect(rascunho.body.clinicaId).toBeNull();
      expect(rascunho.body.clinicaNome).toBeNull();
      expect(rascunho.body.clinicaCnpj).toBeNull();
    });
  });
});
