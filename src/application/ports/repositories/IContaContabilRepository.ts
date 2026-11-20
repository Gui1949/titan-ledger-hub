// src/application/ports/repositories/IContaContabilRepository.ts
import { ContaContabil } from '../../../domain/entities/ContaContabil.js';

export interface IContaContabilRepository {
  salvar(conta: ContaContabil): Promise<void>;
  atualizar(conta: ContaContabil): Promise<void>;
  buscarPorId(id: string): Promise<ContaContabil | null>;
  buscarPorChavePix(chavePix: string): Promise<ContaContabil | null>;
  buscarPorAgenciaConta(banco: string, agencia: string, conta: string): Promise<ContaContabil | null>;
  listarTodas(): Promise<ContaContabil[]>;
}
