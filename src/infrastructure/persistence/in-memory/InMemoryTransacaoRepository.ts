// src/infrastructure/persistence/in-memory/InMemoryTransacaoRepository.ts
import { ITransacaoRepository } from '../../../application/ports/repositories/ITransacaoRepository.js';
import { TransacaoDeTransferencia } from '../../../domain/entities/TransacaoDeTransferencia.js';

export class InMemoryTransacaoRepository implements ITransacaoRepository {
  public readonly transacoes = new Map<string, TransacaoDeTransferencia>();
  public readonly idempotenciaMap = new Map<string, string>(); // idempotencyKey -> transacaoId

  public async salvar(transacao: TransacaoDeTransferencia): Promise<void> {
    this.transacoes.set(transacao.id, transacao);
  }

  public async atualizar(transacao: TransacaoDeTransferencia): Promise<void> {
    this.transacoes.set(transacao.id, transacao);
  }

  public async buscarPorId(id: string): Promise<TransacaoDeTransferencia | null> {
    return this.transacoes.get(id) ?? null;
  }

  public async buscarPorEndToEndId(endToEndId: string): Promise<TransacaoDeTransferencia | null> {
    for (const t of this.transacoes.values()) {
      if (t.endToEndId === endToEndId) return t;
    }
    return null;
  }

  public async buscarPorIdempotencyKey(key: string): Promise<TransacaoDeTransferencia | null> {
    const txId = this.idempotenciaMap.get(key);
    if (!txId) return null;
    return this.transacoes.get(txId) ?? null;
  }

  public async salvarComIdempotencia(key: string, transacao: TransacaoDeTransferencia): Promise<void> {
    this.transacoes.set(transacao.id, transacao);
    this.idempotenciaMap.set(key, transacao.id);
  }

  public async listarTodas(): Promise<TransacaoDeTransferencia[]> {
    return Array.from(this.transacoes.values());
  }
}
