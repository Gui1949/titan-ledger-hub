// src/infrastructure/persistence/in-memory/InMemoryContaContabilRepository.ts
import { IContaContabilRepository } from '../../../application/ports/repositories/IContaContabilRepository.js';
import { ContaContabil } from '../../../domain/entities/ContaContabil.js';

export class InMemoryContaContabilRepository implements IContaContabilRepository {
  public readonly contas = new Map<string, ContaContabil>();

  public async salvar(conta: ContaContabil): Promise<void> {
    this.contas.set(conta.id, conta);
  }

  public async atualizar(conta: ContaContabil): Promise<void> {
    this.contas.set(conta.id, conta);
  }

  public async buscarPorId(id: string): Promise<ContaContabil | null> {
    return this.contas.get(id) ?? null;
  }

  public async buscarPorChavePix(chavePix: string): Promise<ContaContabil | null> {
    for (const conta of this.contas.values()) {
      if (conta.chavePix && conta.chavePix.valor === chavePix) {
        return conta;
      }
    }
    return null;
  }

  public async buscarPorAgenciaConta(banco: string, agencia: string, contaComDigito: string): Promise<ContaContabil | null> {
    for (const c of this.contas.values()) {
      if (
        c.agenciaConta &&
        c.agenciaConta.banco === banco &&
        c.agenciaConta.agencia === agencia &&
        `${c.agenciaConta.conta}-${c.agenciaConta.digitoConta}` === contaComDigito
      ) {
        return c;
      }
    }
    return null;
  }

  public async listarTodas(): Promise<ContaContabil[]> {
    return Array.from(this.contas.values());
  }
}
