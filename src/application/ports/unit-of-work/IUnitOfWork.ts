// src/application/ports/unit-of-work/IUnitOfWork.ts
import { IContaContabilRepository } from '../repositories/IContaContabilRepository.js';
import { ILancamentoContabilRepository } from '../repositories/ILancamentoContabilRepository.js';
import { ITransacaoRepository } from '../repositories/ITransacaoRepository.js';

export interface ITransactionContext {
  contas: IContaContabilRepository;
  lancamentos: ILancamentoContabilRepository;
  transacoes: ITransacaoRepository;
}

export interface IUnitOfWork {
  runInTransaction<T>(
    work: (context: ITransactionContext) => Promise<T>
  ): Promise<T>;
}
