import { dose, posologia, validade, type FormulacaoImpressa } from './receita.pdf';

/**
 * As decisões do documento que não dependem de desenho.
 *
 * Estão separadas do teste de integração porque o que se afirma aqui é texto —
 * e texto dentro de um PDF é caro de conferir e fácil de conferir errado.
 */
describe('o que o documento escreve', () => {
  describe('linha de validade', () => {
    const validaAte = new Date('2026-10-13T12:00:00-03:00');

    it('afirma a validade quando a receita vale', () => {
      expect(validade({ situacao: 'valida', validaAte })).toBe('Válida até 13/10/2026');
    });

    it('não diz "válida até" numa receita cancelada', () => {
      // A tarja do topo já diz que foi cancelada. Se o rodapé afirmasse
      // validade, o papel discordaria de si mesmo — e o rodapé é onde o
      // balconista confere antes de manipular.
      const linha = validade({ situacao: 'cancelada', validaAte });

      expect(linha).toBe('Cancelada — não vale como receita.');
      expect(linha).not.toContain('Válida');
    });

    it('fala no passado quando venceu', () => {
      expect(validade({ situacao: 'vencida', validaAte })).toBe('Venceu em 13/10/2026.');
    });
  });

  describe('dose', () => {
    it('usa miligrama abaixo de mil', () => {
      expect(dose(100)).toBe('100 mg');
      expect(dose(999)).toBe('999 mg');
    });

    it('vira grama a partir de mil — ninguém prescreve "1500 mg"', () => {
      expect(dose(1000)).toBe('1 g');
      expect(dose(1500)).toBe('1,5 g');
    });

    it('preserva a fração pequena, que é dose de verdade', () => {
      expect(dose(0.5)).toBe('0,5 mg');
      expect(dose(0.025)).toBe('0,025 mg');
    });
  });

  describe('posologia', () => {
    function formulacao(sobre: Partial<FormulacaoImpressa> = {}): FormulacaoImpressa {
      return {
        forma: 'CÁPSULAS',
        quantidade: 30,
        frequenciaHoras: 8,
        dias: 10,
        orientacao: null,
        aroma: null,
        usoContinuo: false,
        valorEmCentavos: 100,
        itens: [],
        ...sobre,
      };
    }

    it('conta vezes ao dia, e não intervalo em horas', () => {
      // Quem dá o remédio conta vezes por dia. "1 a cada 8 h" é linguagem de
      // quem prescreve, e foi o ponto que o cliente levantou na reunião.
      expect(posologia(formulacao({ frequenciaHoras: 8 }))).toContain('Dar 3 vezes ao dia');
      expect(posologia(formulacao({ frequenciaHoras: 12 }))).toContain('Dar 2 vezes ao dia');
      expect(posologia(formulacao({ frequenciaHoras: 6 }))).toContain('Dar 4 vezes ao dia');
    });

    it('escreve no singular quando é uma vez só', () => {
      const texto = posologia(formulacao({ frequenciaHoras: 24, dias: 1, quantidade: 1 }));

      expect(texto).toBe('Dar 1 vez ao dia, por 1 dia. Aviar 1 unidade.');
    });

    it('diz quanto aviar, que é o que a farmácia executa', () => {
      expect(posologia(formulacao({ quantidade: 30 }))).toContain('Aviar 30 unidades.');
    });

    it('marca o uso contínuo na mesma linha do prazo que ele qualifica', () => {
      // Num canto separado do papel, "uso contínuo" seria lido depois de "por
      // 30 dias" já ter dito ao tutor que o tratamento acaba.
      const texto = posologia(formulacao({ usoContinuo: true, dias: 30 }));

      expect(texto).toBe('Dar 3 vezes ao dia, por 30 dias. Aviar 30 unidades. Uso contínuo.');
    });

    it('não escreve nada quando não é contínuo', () => {
      expect(posologia(formulacao({ usoContinuo: false }))).not.toContain('contínuo');
    });
  });
});
