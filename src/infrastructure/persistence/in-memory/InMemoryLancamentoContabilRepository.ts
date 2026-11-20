// src/infrastructure/persistence/in-memory/InMemoryLancamentoContabilRepository.ts
import { ILancamentoContabilRepository } from '../../../application/ports/repositories/ILancamentoContabilRepository.js';
import { LancamentoContabil } from '../../../domain/entities/LancamentoContabil.js';

export class InMemoryLancamentoContabilRepository implements ILancamentoContabilRepository {
  public readonly lancamentos: LancamentoContabil[] = [];

  public async adicionar(lancamento: LancamentoContabil): Promise<void> {
    this.lancamentos.push(lancamento);
  }

  public async adicionarEmLote(lancamentos: LancamentoContabil[]): Promise<void> {
    this.lancamentos.push(...lancamentos);
  }

  public async buscarPorContaId(contaId: string): Promise<LancamentoContabil[]> {
    return this.lancamentos.filter((l) => l.contaId === contaId);
  }

  public async buscarPorTransacaoId(transacaoId: string): Promise<LancamentoContabil[]> {
    return this.lancamentos.filter((l) => l.transacaoId === transacaoId);
  }

  public async contarTotal(): Promise<number> {
    return this.lancamentos.length;
  }
}
