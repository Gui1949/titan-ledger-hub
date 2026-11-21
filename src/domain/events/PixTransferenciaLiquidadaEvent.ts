// src/domain/events/PixTransferenciaLiquidadaEvent.ts
import { randomUUID } from 'node:crypto';
import { DomainEvent } from './DomainEvent.js';

export interface Pacs008Payload {
  msgId: string;
  endToEndId: string;
  transacaoId: string;
  valorCentavos: number;
  valorFormatadoBrl: string;
  debitoContaId: string;
  debitoTitular: string;
  creditoContaId: string;
  creditoTitular: string;
  chavePixDestino: string;
  liquidadoEm: string;
  isoStandard: 'pacs.008.001.08';
}

export class PixTransferenciaLiquidadaEvent implements DomainEvent<Pacs008Payload> {
  public readonly eventId: string;
  public readonly eventType = 'PIX_TRANSFERENCIA_LIQUIDADA';
  public readonly aggregateId: string;
  public readonly occurredOn: Date;
  public readonly payload: Pacs008Payload;

  constructor(payload: Pacs008Payload) {
    this.eventId = `EVT-${randomUUID()}`;
    this.aggregateId = payload.transacaoId;
    this.occurredOn = new Date();
    this.payload = payload;
  }
}
