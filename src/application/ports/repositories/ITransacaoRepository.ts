// src/application/ports/repositories/ITransacaoRepository.ts
import { TransacaoDeTransferencia } from '../../../domain/entities/TransacaoDeTransferencia.js';

export interface ITransacaoRepository {
  salvar(transacao: TransacaoDeTransferencia): Promise<void>;
  atualizar(transacao: TransacaoDeTransferencia): Promise<void>;
  buscarPorId(id: string): Promise<TransacaoDeTransferencia | null>;
  buscarPorEndToEndId(endToEndId: string): Promise<TransacaoDeTransferencia | null>;
  buscarPorIdempotencyKey(key: string): Promise<TransacaoDeTransferencia | null>;
  salvarComIdempotencia(key: string, transacao: TransacaoDeTransferencia): Promise<void>;
  listarTodas(): Promise<TransacaoDeTransferencia[]>;
}
