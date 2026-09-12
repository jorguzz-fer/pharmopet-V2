import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { formatarCpf, formatarTelefone } from '@pharmopet/shared';
import { Eu, Papeis } from '../identidade/decoradores';
import type { UsuarioAutenticado } from '../identidade/sessao.service';
import { CadastroService } from './cadastro.service';
import {
  AlterarPacienteDto,
  AlterarTutorDto,
  CriarPacienteDto,
  CriarTutorDto,
  ListaDePacientesDto,
  ListaDeTutoresDto,
  PacienteDto,
  TutorDto,
} from './receituario.dto';

/**
 * Tutores e pacientes.
 *
 * Todas as rotas respondem 404 para o que existe mas não é visível ao ator —
 * a distinção entre "não existe" e "não é seu" já seria informação sobre a
 * clientela de outro veterinário.
 */
@ApiTags('receituário')
@Controller('receituario')
export class CadastroController {
  constructor(private readonly cadastro: CadastroService) {}

  @Papeis('ADMIN', 'VETERINARIO')
  @Post('tutores')
  @ApiOperation({ summary: 'Cadastra um tutor' })
  @ApiCreatedResponse({ type: TutorDto })
  async criarTutor(@Body() corpo: CriarTutorDto, @Eu() eu: UsuarioAutenticado): Promise<TutorDto> {
    return paraTutorDto(await this.cadastro.criarTutor(corpo, eu));
  }

  @Get('tutores')
  @ApiOperation({ summary: 'Busca tutores pelo nome ou pelo CPF' })
  @ApiQuery({ name: 'busca', required: false })
  @ApiOkResponse({ type: ListaDeTutoresDto })
  async listarTutores(
    @Eu() eu: UsuarioAutenticado,
    @Query('busca') busca?: string,
  ): Promise<ListaDeTutoresDto> {
    const tutores = await this.cadastro.listarTutores(busca, eu);

    return { tutores: tutores.map(paraTutorDto) };
  }

  @Get('tutores/:id')
  @ApiOperation({ summary: 'Ficha do tutor' })
  @ApiOkResponse({ type: TutorDto })
  @ApiNotFoundResponse({ description: 'Não existe, ou não é visível para quem perguntou.' })
  async acharTutor(@Param('id') id: string, @Eu() eu: UsuarioAutenticado): Promise<TutorDto> {
    return paraTutorDto(await this.cadastro.acharTutor(id, eu));
  }

  @Papeis('ADMIN', 'VETERINARIO')
  @Patch('tutores/:id')
  @ApiOperation({ summary: 'Corrige a ficha do tutor' })
  @ApiOkResponse({ type: TutorDto })
  async alterarTutor(
    @Param('id') id: string,
    @Body() corpo: AlterarTutorDto,
    @Eu() eu: UsuarioAutenticado,
  ): Promise<TutorDto> {
    return paraTutorDto(await this.cadastro.alterarTutor(id, corpo, eu));
  }

  @Papeis('ADMIN', 'VETERINARIO')
  @Post('pacientes')
  @ApiOperation({ summary: 'Cadastra um paciente' })
  @ApiCreatedResponse({ type: PacienteDto })
  async criarPaciente(
    @Body() corpo: CriarPacienteDto,
    @Eu() eu: UsuarioAutenticado,
  ): Promise<PacienteDto> {
    const criado = await this.cadastro.criarPaciente(
      {
        ...corpo,
        raca: corpo.raca ?? null,
        sexo: corpo.sexo ?? null,
        observacoes: corpo.observacoes ?? null,
        nascimentoEm: corpo.nascimentoEm ? new Date(corpo.nascimentoEm) : null,
        // Peso e data de aferição andam juntos: peso sem data não serve para dosar.
        ...(typeof corpo.pesoEmGramas === 'number'
          ? { pesoEmGramas: corpo.pesoEmGramas, pesoAferidoEm: new Date() }
          : {}),
      },
      eu,
    );

    return paraPacienteDto(criado);
  }

  @Get('pacientes')
  @ApiOperation({ summary: 'Busca pacientes' })
  @ApiQuery({ name: 'tutorId', required: false })
  @ApiQuery({ name: 'busca', required: false })
  @ApiOkResponse({ type: ListaDePacientesDto })
  async listarPacientes(
    @Eu() eu: UsuarioAutenticado,
    @Query('tutorId') tutorId?: string,
    @Query('busca') busca?: string,
  ): Promise<ListaDePacientesDto> {
    const pacientes = await this.cadastro.listarPacientes({ tutorId, busca }, eu);

    return { pacientes: pacientes.map(paraPacienteDto) };
  }

  @Get('pacientes/:id')
  @ApiOperation({ summary: 'Ficha do paciente' })
  @ApiOkResponse({ type: PacienteDto })
  async acharPaciente(@Param('id') id: string, @Eu() eu: UsuarioAutenticado): Promise<PacienteDto> {
    return paraPacienteDto(await this.cadastro.acharPaciente(id, eu));
  }

  @Papeis('ADMIN', 'VETERINARIO')
  @Patch('pacientes/:id')
  @ApiOperation({ summary: 'Corrige a ficha do paciente' })
  @ApiOkResponse({ type: PacienteDto })
  async alterarPaciente(
    @Param('id') id: string,
    @Body() corpo: AlterarPacienteDto,
    @Eu() eu: UsuarioAutenticado,
  ): Promise<PacienteDto> {
    const alterado = await this.cadastro.alterarPaciente(
      id,
      {
        ...corpo,
        ...(corpo.nascimentoEm !== undefined
          ? { nascimentoEm: corpo.nascimentoEm ? new Date(corpo.nascimentoEm) : null }
          : {}),
      },
      eu,
    );

    return paraPacienteDto(alterado);
  }
}

function paraTutorDto(tutor: {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  observacoes: string | null;
  _count: { pacientes: number };
}): TutorDto {
  return {
    id: tutor.id,
    nome: tutor.nome,
    // Guardado sem máscara, devolvido com: o banco quer um formato só para
    // casar, e a tela quer o formato que a pessoa reconhece.
    cpf: tutor.cpf === null ? null : formatarCpf(tutor.cpf),
    email: tutor.email,
    telefone: tutor.telefone === null ? null : formatarTelefone(tutor.telefone),
    cep: tutor.cep,
    logradouro: tutor.logradouro,
    numero: tutor.numero,
    complemento: tutor.complemento,
    bairro: tutor.bairro,
    cidade: tutor.cidade,
    uf: tutor.uf,
    observacoes: tutor.observacoes,
    quantidadeDePacientes: tutor._count.pacientes,
  };
}

function paraPacienteDto(paciente: {
  id: string;
  tutorId: string;
  tutor: { nome: string };
  nome: string;
  especie: PacienteDto['especie'];
  raca: string | null;
  sexo: PacienteDto['sexo'];
  castrado: boolean;
  pesoEmGramas: number | null;
  pesoAferidoEm: Date | null;
  nascimentoEm: Date | null;
  observacoes: string | null;
  obitoEm: Date | null;
}): PacienteDto {
  return {
    id: paciente.id,
    tutorId: paciente.tutorId,
    tutorNome: paciente.tutor.nome,
    nome: paciente.nome,
    especie: paciente.especie,
    raca: paciente.raca,
    sexo: paciente.sexo,
    castrado: paciente.castrado,
    pesoEmGramas: paciente.pesoEmGramas,
    pesoAferidoEm: paciente.pesoAferidoEm?.toISOString() ?? null,
    nascimentoEm: paciente.nascimentoEm?.toISOString().slice(0, 10) ?? null,
    observacoes: paciente.observacoes,
    obito: paciente.obitoEm !== null,
  };
}
