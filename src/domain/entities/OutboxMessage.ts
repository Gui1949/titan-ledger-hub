// src/domain/entities/OutboxMessage.ts
import { randomUUID } from 'node:crypto';

export type StatusOutbox = 'PENDENTE' | 'PROCESSANDO' | 'ENVIADO' | 'FALHADO' | 'DLQ';

export interface OutboxMessageProps {
  id?: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: string; // JSON serializado
  status?: StatusOutbox;
  tentativas?: number;
  maxTentativas?: number;
  ultimoErro?: string;
  proximaTentativaEm?: Date;
  createdAt?: Date;
  enviadoEm?: Date;
}

export class OutboxMessage {
  public readonly id: string;
  public readonly aggregateType: string;
  public readonly aggregateId: string;
  public readonly eventType: string;
  public readonly payload: string;
  public readonly maxTentativas: number;
  public readonly createdAt: Date;

  private _status: StatusOutbox;
  private _tentativas: number;
  private _ultimoErro?: string;
  private _proximaTentativaEm: Date;
  private _enviadoEm?: Date;

  constructor(props: OutboxMessageProps) {
    this.id = props.id ?? `OUT-${randomUUID()}`;
    this.aggregateType = props.aggregateType;
    this.aggregateId = props.aggregateId;
    this.eventType = props.eventType;
    this.payload = props.payload;
    this._status = props.status ?? 'PENDENTE';
    this._tentativas = props.tentativas ?? 0;
    this.maxTentativas = props.maxTentativas ?? 3;
    this._ultimoErro = props.ultimoErro;
    this._proximaTentativaEm = props.proximaTentativaEm ?? new Date();
    this.createdAt = props.createdAt ?? new Date();
    this._enviadoEm = props.enviadoEm;
  }

  get status(): StatusOutbox { return this._status; }
  get tentativas(): number { return this._tentativas; }
  get ultimoErro(): string | undefined { return this._ultimoErro; }
  get proximaTentativaEm(): Date { return this._proximaTentativaEm; }
  get enviadoEm(): Date | undefined { return this._enviadoEm; }

  public marcarComoEnviado(): void {
    this._status = 'ENVIADO';
    this._enviadoEm = new Date();
    this._ultimoErro = undefined;
  }

  public registrarFalha(erro: string, backoffBaseMs: number = 100): void {
    this._tentativas++;
    this._ultimoErro = erro;

    if (this._tentativas >= this.maxTentativas) {
      this._status = 'DLQ';
    } else {
      this._status = 'FALHADO';
      // Exponential backoff com jitter: base * 2^(tentativa - 1)
      const delayMs = backoffBaseMs * Math.pow(2, this._tentativas - 1);
      this._proximaTentativaEm = new Date(Date.now() + delayMs);
    }
  }

  public reprocessar(): void {
    this._status = 'PENDENTE';
    this._proximaTentativaEm = new Date();
  }
}
