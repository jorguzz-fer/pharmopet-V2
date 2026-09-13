import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { formatarCnpj, formatarTelefone } from '@pharmopet/shared';
import { Eu, Papeis } from '../identidade/decoradores';
import { AuditoriaService } from '../identidade/auditoria.service';
import type { UsuarioAutenticado } from '../identidade/sessao.service';
import {
  AlterarClinicaDto,
  ClinicaDto,
  CriarClinicaDto,
  EnviarLogotipoDto,
  ListaDeClinicasDto,
  ListaDeVinculosDto,
  VincularDto,
} from './clinicas.dto';
import { ClinicasService } from './clinicas.service';

@ApiTags('clínicas')
@Controller('clinicas')
export class ClinicasController {
  constructor(
    private readonly clinicas: ClinicasService,
    private readonly auditoria: AuditoriaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Clínicas visíveis para quem perguntou' })
  @ApiOkResponse({ type: ListaDeClinicasDto })
  async listar(@Eu() eu: UsuarioAutenticado): Promise<ListaDeClinicasDto> {
    return { clinicas: (await this.clinicas.listar(eu)).map(paraDto) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Cadastro da clínica' })
  @ApiOkResponse({ type: ClinicaDto })
  @ApiNotFoundResponse({ description: 'Não existe, ou não é visível para quem perguntou.' })
  async achar(@Param('id') id: string, @Eu() eu: UsuarioAutenticado): Promise<ClinicaDto> {
    return paraDto(await this.clinicas.achar(id, eu));
  }

  @Papeis('ADMIN')
  @Post()
  @ApiOperation({ summary: 'Cadastra uma clínica parceira' })
  @ApiCreatedResponse({ type: ClinicaDto })
  async criar(@Body() corpo: CriarClinicaDto, @Eu() eu: UsuarioAutenticado): Promise<ClinicaDto> {
    const criada = await this.clinicas.criar(corpo);

    await this.auditoria.registrar({
      acao: 'CLINICA_CRIADA',
      usuarioId: eu.id,
      alvo: `clinica:${criada.id}`,
      detalhe: { nomeFantasia: criada.nomeFantasia, cnpj: criada.cnpj },
    });

    return paraDto(criada);
  }

  @Papeis('ADMIN')
  @Patch(':id')
  @ApiOperation({ summary: 'Altera o cadastro, inclusive a situação' })
  @ApiOkResponse({ type: ClinicaDto })
  async alterar(
    @Param('id') id: string,
    @Body() corpo: AlterarClinicaDto,
    @Eu() eu: UsuarioAutenticado,
  ): Promise<ClinicaDto> {
    const alterada = await this.clinicas.alterar(id, corpo);

    await this.auditoria.registrar({
      acao: 'CLINICA_ALTERADA',
      usuarioId: eu.id,
      alvo: `clinica:${id}`,
      // Só os nomes dos campos: o conteúdo pode ter dado cadastral, e a
      // trilha de auditoria não é lugar para uma segunda cópia dele.
      detalhe: { campos: Object.keys(corpo) },
    });

    return paraDto(alterada);
  }

  // --- logotipo ---

  @Papeis('ADMIN')
  @Put(':id/logotipo')
  @HttpCode(204)
  @ApiOperation({ summary: 'Grava o logotipo impresso no cabeçalho da receita' })
  async enviarLogotipo(@Param('id') id: string, @Body() corpo: EnviarLogotipoDto): Promise<void> {
    await this.clinicas.gravarLogotipo(id, corpo.tipo, corpo.conteudoBase64);
  }

  /**
   * O logotipo em si.
   *
   * Sai como imagem, e não como JSON, para a tela poder usá-lo direto num
   * `<img src>` e o gerador de PDF poder baixá-lo sem decodificar nada.
   */
  @Get(':id/logotipo')
  @ApiOperation({ summary: 'Baixa o logotipo da clínica' })
  @ApiProduces('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')
  @ApiOkResponse({ description: 'O arquivo do logotipo.' })
  @ApiNotFoundResponse({ description: 'A clínica não tem logotipo.' })
  async baixarLogotipo(
    @Param('id') id: string,
    @Eu() eu: UsuarioAutenticado,
    @Res() resposta: Response,
  ): Promise<void> {
    await this.clinicas.achar(id, eu);
    const { bytes, tipo } = await this.clinicas.lerLogotipo(id);

    resposta.setHeader('Content-Type', tipo);
    // Privado: é imagem de parceiro, e não deve ficar em cache compartilhado de
    // proxy. Curto, porque o logotipo pode ser trocado a qualquer momento.
    resposta.setHeader('Cache-Control', 'private, max-age=300');
    resposta.send(bytes);
  }

  // --- vínculos ---

  @Get(':id/usuarios')
  @ApiOperation({ summary: 'Quem atende ou opera nesta clínica' })
  @ApiOkResponse({ type: ListaDeVinculosDto })
  async listarVinculos(
    @Param('id') id: string,
    @Eu() eu: UsuarioAutenticado,
  ): Promise<ListaDeVinculosDto> {
    await this.clinicas.achar(id, eu);

    return {
      vinculos: (await this.clinicas.vinculos(id)).map((v) => ({
        usuarioId: v.usuario.id,
        nome: v.usuario.nome,
        email: v.usuario.email,
        papel: v.usuario.papel,
        crmv: v.usuario.crmv,
        cargo: v.cargo,
      })),
    };
  }

  @Papeis('ADMIN')
  @Post(':id/usuarios')
  @HttpCode(204)
  @ApiOperation({ summary: 'Vincula alguém à clínica' })
  async vincular(
    @Param('id') id: string,
    @Body() corpo: VincularDto,
    @Eu() eu: UsuarioAutenticado,
  ): Promise<void> {
    await this.clinicas.vincular(id, corpo.usuarioId, corpo.cargo ?? null);

    await this.auditoria.registrar({
      acao: 'VINCULO_CRIADO',
      usuarioId: eu.id,
      alvo: `clinica:${id}`,
      detalhe: { usuarioId: corpo.usuarioId },
    });
  }

  @Papeis('ADMIN')
  @Delete(':id/usuarios/:usuarioId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Encerra o vínculo' })
  async desvincular(
    @Param('id') id: string,
    @Param('usuarioId') usuarioId: string,
    @Eu() eu: UsuarioAutenticado,
  ): Promise<void> {
    await this.clinicas.desvincular(id, usuarioId);

    await this.auditoria.registrar({
      acao: 'VINCULO_REMOVIDO',
      usuarioId: eu.id,
      alvo: `clinica:${id}`,
      detalhe: { usuarioId },
    });
  }
}

type ClinicaDoBanco = Awaited<ReturnType<ClinicasService['achar']>>;

function paraDto(clinica: ClinicaDoBanco): ClinicaDto {
  return {
    id: clinica.id,
    razaoSocial: clinica.razaoSocial,
    nomeFantasia: clinica.nomeFantasia,
    // Guardado sem máscara para o índice único casar; devolvido com, porque é
    // assim que a pessoa confere.
    cnpj: formatarCnpj(clinica.cnpj),
    inscricaoEstadual: clinica.inscricaoEstadual,
    email: clinica.email,
    telefone: clinica.telefone === null ? null : formatarTelefone(clinica.telefone),
    whatsapp: clinica.whatsapp === null ? null : formatarTelefone(clinica.whatsapp),
    cep: clinica.cep,
    logradouro: clinica.logradouro,
    numero: clinica.numero,
    complemento: clinica.complemento,
    bairro: clinica.bairro,
    cidade: clinica.cidade,
    uf: clinica.uf,
    responsavelLegal: clinica.responsavelLegal,
    cpfDoResponsavel: clinica.cpfDoResponsavel,
    situacao: clinica.situacao,
    observacoesInternas: clinica.observacoesInternas,
    // O conteúdo do logotipo não entra no JSON: são quilobytes que a lista
    // carregaria por clínica sem ninguém usar.
    temLogotipo: clinica.logotipo !== null,
    atualizadaEm: clinica.atualizadaEm.toISOString(),
    quantidadeDeUsuarios: clinica._count.usuarios,
  };
}
