// src/application/ports/repositories/ILancamentoContabilRepository.ts
import { LancamentoContabil } from '../../../domain/entities/LancamentoContabil.js';

export interface ILancamentoContabilRepository {
  adicionar(lancamento: LancamentoContabil): Promise<void>;
  adicionarEmLote(lancamentos: LancamentoContabil[]): Promise<void>;
  buscarPorContaId(contaId: string): Promise<LancamentoContabil[]>;
  buscarPorTransacaoId(transacaoId: string): Promise<LancamentoContabil[]>;
  contarTotal(): Promise<number>;
}
