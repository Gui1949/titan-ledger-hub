// src/application/errors/application-errors.ts
import { DomainError } from '../../domain/errors/domain-errors.js';

export class ContaNaoEncontradaError extends DomainError {
  constructor(public readonly identificador: string) {
    super('CONTA_NAO_ENCONTRADA', `Conta contábil não encontrada para o identificador: ${identificador}`);
    this.name = 'ContaNaoEncontradaError';
  }
}

export class ChavePixDestinoNaoEncontradaError extends DomainError {
  constructor(public readonly chavePix: string) {
    super('CHAVE_PIX_DESTINO_NAO_ENCONTRADA', `Nenhuma conta contábil vinculada à Chave Pix de destino: ${chavePix}`);
    this.name = 'ChavePixDestinoNaoEncontradaError';
  }
}

export class IdempotenciaConflitoError extends DomainError {
  constructor(public readonly key: string) {
    super('IDEMPOTENCIA_CONFLITO', `A chave de idempotência ${key} já foi utilizada para outra transação conflitante`);
    this.name = 'IdempotenciaConflitoError';
  }
}

export class TransacaoNaoEncontradaError extends DomainError {
  constructor(public readonly transacaoId: string) {
    super('TRANSACAO_NAO_ENCONTRADA', `Transação de transferência não encontrada: ${transacaoId}`);
    this.name = 'TransacaoNaoEncontradaError';
  }
}

export class TransacaoJaEstornadaError extends DomainError {
  constructor(public readonly transacaoId: string) {
    super('TRANSACAO_JA_ESTORNADA', `A transação ${transacaoId} já se encontra estornada`);
    this.name = 'TransacaoJaEstornadaError';
  }
}

export class ConcorrenciaLockTimeoutError extends DomainError {
  constructor(public readonly keys: string[]) {
    super('LOCK_TIMEOUT', `Timeout ao adquirir locks de concorrência para as contas: ${keys.join(', ')}`);
    this.name = 'ConcorrenciaLockTimeoutError';
  }
}
