// src/domain/events/PixEstornoRealizadoEvent.ts
import { randomUUID } from 'node:crypto';
import { DomainEvent } from './DomainEvent.js';

export interface Pacs004Payload {
  msgId: string;
  transacaoEstornoId: string;
  transacaoOriginalId: string;
  endToEndIdOriginal: string;
  valorEstornadoCentavos: number;
  valorFormatadoBrl: string;
  motivoEstorno: string;
  estornadoEm: string;
  isoStandard: 'pacs.004.001.09';
}

export class PixEstornoRealizadoEvent implements DomainEvent<Pacs004Payload> {
  public readonly eventId: string;
  public readonly eventType = 'PIX_ESTORNO_REALIZADO';
  public readonly aggregateId: string;
  public readonly occurredOn: Date;
  public readonly payload: Pacs004Payload;

  constructor(payload: Pacs004Payload) {
    this.eventId = `EVT-${randomUUID()}`;
    this.aggregateId = payload.transacaoEstornoId;
    this.occurredOn = new Date();
    this.payload = payload;
  }
}
