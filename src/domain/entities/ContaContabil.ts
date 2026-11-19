// src/domain/entities/ContaContabil.ts
import { AgenciaConta } from '../value-objects/AgenciaConta.js';
import { ChavePix } from '../value-objects/ChavePix.js';
import { ContaNaoOperacionalError } from '../errors/domain-errors.js';

export type NaturezaContabil = 'ATIVO' | 'PASSIVO' | 'PATRIMONIO_LIQUIDO' | 'RECEITA' | 'DESPESA';
export type StatusContaContabil = 'ATIVA' | 'BLOQUEADA_JUDICIAL' | 'SUSPENSA' | 'ENCERRADA';

export interface ContaContabilProps {
  id: string;
  titular: string;
  natureza: NaturezaContabil;
  status?: StatusContaContabil;
  agenciaConta?: AgenciaConta;
  chavePix?: ChavePix;
  limiteChequeEspecialCentavos?: number; // padrão 0
}

export class ContaContabil {
  public readonly id: string;
  public readonly titular: string;
  public readonly natureza: NaturezaContabil;
  public readonly agenciaConta?: AgenciaConta;
  public readonly chavePix?: ChavePix;
  public readonly limiteChequeEspecialCentavos: number;

  private _status: StatusContaContabil;
  private _updatedAt: Date;

  constructor(props: ContaContabilProps) {
    this.id = props.id;
    this.titular = props.titular;
    this.natureza = props.natureza;
    this._status = props.status ?? 'ATIVA';
    this.agenciaConta = props.agenciaConta;
    this.chavePix = props.chavePix;
    this.limiteChequeEspecialCentavos = props.limiteChequeEspecialCentavos ?? 0;
    this._updatedAt = new Date();
  }

  get status(): StatusContaContabil { return this._status; }
  get isOperacional(): boolean { return this._status === 'ATIVA'; }
  get updatedAt(): Date { return this._updatedAt; }

  public bloquearJudicialmente(): void {
    if (this._status === 'ENCERRADA') throw new ContaNaoOperacionalError(this.id, 'Conta encerrada não pode ser bloqueada');
    this._status = 'BLOQUEADA_JUDICIAL';
    this._updatedAt = new Date();
  }

  public suspender(): void {
    if (this._status === 'ENCERRADA') throw new ContaNaoOperacionalError(this.id, 'Conta encerrada não pode ser suspensa');
    this._status = 'SUSPENSA';
    this._updatedAt = new Date();
  }

  public reativar(): void {
    if (this._status === 'ENCERRADA') throw new ContaNaoOperacionalError(this.id, 'Conta encerrada não pode ser reativada');
    this._status = 'ATIVA';
    this._updatedAt = new Date();
  }

  public encerrar(): void {
    this._status = 'ENCERRADA';
    this._updatedAt = new Date();
  }
}
