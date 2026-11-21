// src/application/services/OutboxRelayService.ts
import { IOutboxRepository } from '../ports/repositories/IOutboxRepository.js';
import { IWebhookTransport } from '../ports/messaging/IWebhookTransport.js';

export interface OutboxRelayConfig {
  webhookUrl: string;
  webhookSecret: string;
  batchSize?: number;
  backoffBaseMs?: number;
}

export interface OutboxRelayStats {
  processadas: number;
  enviadas: number;
  falhas: number;
  enviadasParaDLQ: number;
}

export class OutboxRelayService {
  constructor(
    private readonly outboxRepo: IOutboxRepository,
    private readonly transport: IWebhookTransport,
    private readonly config: OutboxRelayConfig
  ) {}

  public async processarPendentes(agora: Date = new Date()): Promise<OutboxRelayStats> {
    const batchSize = this.config.batchSize ?? 10;
    const pendentes = await this.outboxRepo.buscarPendentesParaEnvio(batchSize, agora);

    const stats: OutboxRelayStats = {
      processadas: pendentes.length,
      enviadas: 0,
      falhas: 0,
      enviadasParaDLQ: 0,
    };

    for (const msg of pendentes) {
      try {
        const resultado = await this.transport.enviar(
          this.config.webhookUrl,
          msg.payload,
          this.config.webhookSecret,
          {
            'X-Event-Type': msg.eventType,
            'X-Aggregate-Id': msg.aggregateId,
            'X-Outbox-Id': msg.id,
          }
        );

        if (resultado.sucesso) {
          msg.marcarComoEnviado();
          await this.outboxRepo.atualizar(msg);
          stats.enviadas++;
        } else {
          msg.registrarFalha(resultado.erro ?? 'Falha desconhecida no transporte', this.config.backoffBaseMs);
          await this.outboxRepo.atualizar(msg);
          stats.falhas++;
          if (msg.status === 'DLQ') {
            stats.enviadasParaDLQ++;
          }
        }
      } catch (err: any) {
        msg.registrarFalha(err.message ?? 'Erro inesperado ao despachar', this.config.backoffBaseMs);
        await this.outboxRepo.atualizar(msg);
        stats.falhas++;
        if (msg.status === 'DLQ') {
          stats.enviadasParaDLQ++;
        }
      }
    }

    return stats;
  }
}
