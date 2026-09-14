import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

/** O que o envio precisa saber. Separado para o teste poder trocá-lo. */
export type Mensagem = { para: string; assunto: string; html: string };

/**
 * Envio de e-mail.
 *
 * Fala com a API do Resend por `fetch`, e não pelo SDK que a v1 usava: é uma
 * requisição só, e uma dependência a menos é uma dependência a menos para
 * auditar numa aplicação que manipula receita controlada.
 *
 * `configurado` é público porque a rota precisa saber antes de aceitar o
 * pedido: aceitar sem poder enviar deixaria alguém esperando um e-mail que
 * nunca sai, o que é pior do que dizer que não dá.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  get configurado(): boolean {
    return Boolean(this.chave() && this.remetente());
  }

  /**
   * Manda a mensagem. Lança se o envio falhar.
   *
   * Lançar, e não engolir: quem chamou precisa saber que o e-mail não saiu.
   * Um `catch` silencioso aqui faria a tela dizer "enviamos o link" sobre uma
   * caixa de entrada que vai continuar vazia.
   */
  async enviar(mensagem: Mensagem): Promise<void> {
    const chave = this.chave();
    const remetente = this.remetente();

    if (!chave || !remetente) {
      throw new Error('Envio de e-mail não configurado: faltam RESEND_API_KEY e EMAIL_REMETENTE.');
    }

    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${chave}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: remetente,
        to: [mensagem.para],
        subject: mensagem.assunto,
        html: mensagem.html,
      }),
    });

    if (!resposta.ok) {
      // O corpo do erro do provedor pode repetir o destinatário, e o
      // destinatário é dado pessoal. Só o status entra no log.
      this.logger.error(`Resend recusou o envio: ${resposta.status}`);
      throw new Error(`O provedor de e-mail respondeu ${resposta.status}.`);
    }
  }

  private chave(): string | undefined {
    return this.config.get('RESEND_API_KEY', { infer: true });
  }

  private remetente(): string | undefined {
    return this.config.get('EMAIL_REMETENTE', { infer: true });
  }
}
