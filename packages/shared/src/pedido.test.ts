import { describe, expect, it } from 'vitest';
import {
  ESTADOS_DO_PEDIDO,
  descreverParaOTutor,
  pedidoEmAberto,
  proximosEstados,
  rotuloDoEstado,
  transicaoPermitida,
  type EstadoDoPedido,
} from './pedido.js';

describe('estados do pedido', () => {
  describe('o caminho normal', () => {
    it('vai de análise até entregue, um passo por vez', () => {
      expect(transicaoPermitida('EM_ANALISE', 'EM_PRODUCAO')).toBe(true);
      expect(transicaoPermitida('EM_PRODUCAO', 'PRONTO')).toBe(true);
      expect(transicaoPermitida('PRONTO', 'ENTREGUE')).toBe(true);
    });

    it('não pula etapas', () => {
      // Pular de análise para pronto significaria que ninguém manipulou, ou
      // que alguém manipulou sem o sistema saber. As duas leituras são ruins.
      expect(transicaoPermitida('EM_ANALISE', 'PRONTO')).toBe(false);
      expect(transicaoPermitida('EM_ANALISE', 'ENTREGUE')).toBe(false);
      expect(transicaoPermitida('EM_PRODUCAO', 'ENTREGUE')).toBe(false);
    });

    it('não anda para trás', () => {
      expect(transicaoPermitida('EM_PRODUCAO', 'EM_ANALISE')).toBe(false);
      expect(transicaoPermitida('PRONTO', 'EM_PRODUCAO')).toBe(false);
    });

    it('não fica parado no mesmo estado', () => {
      for (const estado of ESTADOS_DO_PEDIDO) {
        expect(transicaoPermitida(estado, estado)).toBe(false);
      }
    });
  });

  describe('estados finais', () => {
    it('entregue não vai a lugar nenhum', () => {
      // Nem para cancelar: o remédio já está com o tutor, e um pedido que volta
      // de entregue é um histórico que mente sobre o que aconteceu.
      expect(proximosEstados('ENTREGUE')).toEqual([]);
      expect(pedidoEmAberto('ENTREGUE')).toBe(false);
    });

    it('cancelado também não', () => {
      expect(proximosEstados('CANCELADO')).toEqual([]);
      expect(pedidoEmAberto('CANCELADO')).toBe(false);
    });

    it('os outros continuam em aberto', () => {
      expect(pedidoEmAberto('EM_ANALISE')).toBe(true);
      expect(pedidoEmAberto('EM_PRODUCAO')).toBe(true);
      expect(pedidoEmAberto('PRONTO')).toBe(true);
    });
  });

  describe('cancelamento', () => {
    it('cabe em qualquer estado que ainda ande', () => {
      for (const estado of ['EM_ANALISE', 'EM_PRODUCAO', 'PRONTO'] as const) {
        expect(transicaoPermitida(estado, 'CANCELADO')).toBe(true);
      }
    });
  });

  describe('texto', () => {
    it('todo estado tem rótulo e frase para o tutor', () => {
      // `Record` completo no código garante isto em tempo de compilação; o
      // teste existe para o caso de alguém trocar o tipo por `Partial`.
      for (const estado of ESTADOS_DO_PEDIDO) {
        expect(rotuloDoEstado(estado)).toBeTruthy();
        expect(descreverParaOTutor(estado)).toBeTruthy();
      }
    });

    it('a frase de análise é a que o cliente pediu', () => {
      const frase = descreverParaOTutor('EM_ANALISE');

      expect(frase).toContain('em análise');
      expect(frase).toContain('entrará em contato');
    });

    it('não fala de bancada com quem espera em casa', () => {
      // O tutor abre o link para saber quando chega, não para acompanhar a
      // ordem de produção.
      const frases = ESTADOS_DO_PEDIDO.map(descreverParaOTutor).join(' ');

      expect(frases).not.toContain('insumo');
      expect(frases).not.toContain('markup');
    });
  });

  describe('a tabela inteira', () => {
    it('nenhum estado leva a um estado que não existe', () => {
      const conhecidos = new Set<string>(ESTADOS_DO_PEDIDO);

      for (const estado of ESTADOS_DO_PEDIDO) {
        for (const destino of proximosEstados(estado)) {
          expect(conhecidos.has(destino)).toBe(true);
        }
      }
    });

    it('todo estado é alcançável a partir do nascimento, menos ele mesmo', () => {
      // Um estado que ninguém alcança é um estado que só existe no enum, e
      // alguém vai acabar escrevendo código para tratá-lo.
      const alcancados = new Set<EstadoDoPedido>(['EM_ANALISE']);
      const fila: EstadoDoPedido[] = ['EM_ANALISE'];

      while (fila.length > 0) {
        for (const proximo of proximosEstados(fila.shift()!)) {
          if (!alcancados.has(proximo)) {
            alcancados.add(proximo);
            fila.push(proximo);
          }
        }
      }

      expect([...alcancados].sort()).toEqual([...ESTADOS_DO_PEDIDO].sort());
    });
  });
});
