// src/domain/errors/domain-errors.ts

export class DomainError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ChavePixInvalidaError extends DomainError {
  constructor(mensagem: string) {
    super('CHAVE_PIX_INVALIDA', mensagem);
    this.name = 'ChavePixInvalidaError';
  }
}

export class ValorMonetarioInvalidoError extends DomainError {
  constructor(mensagem: string) {
    super('VALOR_MONETARIO_INVALIDO', mensagem);
    this.name = 'ValorMonetarioInvalidoError';
  }
}

export class AgenciaContaInvalidaError extends DomainError {
  constructor(mensagem: string) {
    super('AGENCIA_CONTA_INVALIDA', mensagem);
    this.name = 'AgenciaContaInvalidaError';
  }
}

export class TransacaoDesbalanceadaError extends DomainError {
  constructor(
    public readonly transacaoId: string,
    public readonly totalDebitos: number,
    public readonly totalCreditos: number,
    detalhe: string
  ) {
    super(
      'TRANSACAO_DESBALANCEADA',
      `Transação ${transacaoId} desbalanceada (Débitos: ${totalDebitos}c | Créditos: ${totalCreditos}c). ${detalhe}`
    );
    this.name = 'TransacaoDesbalanceadaError';
  }
}

export class SaldoInsuficienteError extends DomainError {
  constructor(
    public readonly contaId: string,
    public readonly valorDebitoCentavos: number,
    public readonly saldoDisponivelCentavos: number
  ) {
    super(
      'SALDO_INSUFICIENTE',
      `Conta ${contaId} possui saldo insuficiente. Débito solicitado: R$ ${(valorDebitoCentavos / 100).toFixed(2)}, Saldo disponível: R$ ${(saldoDisponivelCentavos / 100).toFixed(2)}`
    );
    this.name = 'SaldoInsuficienteError';
  }
}

export class ContaNaoOperacionalError extends DomainError {
  constructor(public readonly contaId: string, mensagem: string) {
    super('CONTA_NAO_OPERACIONAL', mensagem);
    this.name = 'ContaNaoOperacionalError';
  }
}

export class TransicaoEstadoInvalidaError extends DomainError {
  constructor(de: string, para: string) {
    super('TRANSICAO_ESTADO_INVALIDA', `Transação de estado inválida: "${de}" -> "${para}"`);
    this.name = 'TransicaoEstadoInvalidaError';
  }
}
