// src/domain/entities/TransacaoDeTransferencia.ts
import { randomUUID } from 'node:crypto';
import { ChavePix } from '../value-objects/ChavePix.js';
import { LancamentoContabil } from './LancamentoContabil.js';
import { TransicaoEstadoInvalidaError } from '../errors/domain-errors.js';

export type TipoOperacaoTransferencia =
  | 'PIX_TRANSFERENCIA'
  | 'PIX_ESTORNO'
  | 'TARIFA_BANCARIA'
  | 'LIQUIDACAO_INTERBANCARIA';

export type StatusTransacao =
  | 'CRIADA'
  | 'PROCESSANDO'
  | 'LIQUIDADA'
  | 'FALHADA'
  | 'ESTORNADA';

const TRANSICOES_TRANSACAO: Record<StatusTransacao, StatusTransacao[]> = {
  CRIADA: ['PROCESSANDO', 'FALHADA'],
  PROCESSANDO: ['LIQUIDADA', 'FALHADA'],
  LIQUIDADA: ['ESTORNADA'],
  FALHADA: [],
  ESTORNADA: [],
};

export interface TransacaoProps {
  id?: string;
  endToEndId?: string; // Bacen E2E Id: E + ISPB + Data + Sequencial
  tipo: TipoOperacaoTransferencia;
  status?: StatusTransacao;
  chavePixOrigem?: ChavePix;
  chavePixDestino?: ChavePix;
  motivoFalha?: string;
  createdAt?: Date;
}

export class TransacaoDeTransferencia {
  public readonly id: string;
  public readonly endToEndId: string;
  public readonly tipo: TipoOperacaoTransferencia;
  public readonly chavePixOrigem?: ChavePix;
  public readonly chavePixDestino?: ChavePix;
  public readonly createdAt: Date;

  private _status: StatusTransacao;
  private _motivoFalha?: string;
  private readonly _lancamentos: LancamentoContabil[] = [];
  private _updatedAt: Date;

  constructor(props: TransacaoProps) {
    this.id = props.id ?? `TX-${randomUUID()}`;
    this.endToEndId = props.endToEndId ?? `E${Date.now()}${randomUUID().replace(/\D/g, '').slice(0, 10)}`;
    this.tipo = props.tipo;
    this._status = props.status ?? 'CRIADA';
    this.chavePixOrigem = props.chavePixOrigem;
    this.chavePixDestino = props.chavePixDestino;
    this.createdAt = props.createdAt ?? new Date();
    this._updatedAt = new Date();
  }

  get status(): StatusTransacao { return this._status; }
  get lancamentos(): readonly LancamentoContabil[] { return this._lancamentos; }
  get motivoFalha(): string | undefined { return this._motivoFalha; }
  get updatedAt(): Date { return this._updatedAt; }

  public adicionarLancamento(lancamento: LancamentoContabil): void {
    if (this._status !== 'CRIADA' && this._status !== 'PROCESSANDO') {
      throw new TransicaoEstadoInvalidaError(this._status, 'ADICIONAR_LANCAMENTO');
    }
    this._lancamentos.push(lancamento);
  }

  public iniciarProcessamento(): void {
    this.transicionarPara('PROCESSANDO');
  }

  public liquidar(): void {
    this.transicionarPara('LIQUIDADA');
  }

  public falhar(motivo: string): void {
    this._motivoFalha = motivo;
    this.transicionarPara('FALHADA');
  }

  public estornar(): void {
    this.transicionarPara('ESTORNADA');
  }

  private transicionarPara(novoStatus: StatusTransacao): void {
    const permitidas = TRANSICOES_TRANSACAO[this._status];
    if (!permitidas.includes(novoStatus)) {
      throw new TransicaoEstadoInvalidaError(this._status, novoStatus);
    }
    this._status = novoStatus;
    this._updatedAt = new Date();
  }
}
