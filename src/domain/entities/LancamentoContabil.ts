// src/domain/entities/LancamentoContabil.ts
import { randomUUID } from 'node:crypto';
import { ValorMonetario } from '../value-objects/ValorMonetario.js';

export type TipoLancamento = 'DEBITO' | 'CREDITO';

export interface LancamentoContabilProps {
  id?: string;
  transacaoId: string;
  contaId: string;
  tipo: TipoLancamento;
  valor: ValorMonetario;
  historico: string;
  createdAt?: Date;
}

export class LancamentoContabil {
  public readonly id: string;
  public readonly transacaoId: string;
  public readonly contaId: string;
  public readonly tipo: TipoLancamento;
  public readonly valor: ValorMonetario;
  public readonly historico: string;
  public readonly createdAt: Date;

  constructor(props: LancamentoContabilProps) {
    this.id = props.id ?? `LAN-${randomUUID()}`;
    this.transacaoId = props.transacaoId;
    this.contaId = props.contaId;
    this.tipo = props.tipo;
    this.valor = props.valor;
    this.historico = props.historico;
    this.createdAt = props.createdAt ?? new Date();
  }
}
