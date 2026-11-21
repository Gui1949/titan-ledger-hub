// src/application/errors/messaging-errors.ts
import { DomainError } from '../../domain/errors/domain-errors.js';

export class AssinaturaWebhookInvalidaError extends DomainError {
  constructor(mensagem: string = 'Assinatura HMAC-SHA256 do webhook inválida ou ausente') {
    super('WEBHOOK_SIGNATURE_INVALID', mensagem);
    this.name = 'AssinaturaWebhookInvalidaError';
  }
}

export class OutboxDeliveryError extends DomainError {
  constructor(public readonly outboxId: string, public readonly motivo: string) {
    super('OUTBOX_DELIVERY_ERROR', `Falha na entrega da mensagem do outbox ${outboxId}: ${motivo}`);
    this.name = 'OutboxDeliveryError';
  }
}
