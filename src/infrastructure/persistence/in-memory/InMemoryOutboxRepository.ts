// src/infrastructure/persistence/in-memory/InMemoryOutboxRepository.ts
import { IOutboxRepository } from '../../../application/ports/repositories/IOutboxRepository.js';
import { OutboxMessage, StatusOutbox } from '../../../domain/entities/OutboxMessage.js';

export class InMemoryOutboxRepository implements IOutboxRepository {
  public readonly items = new Map<string, OutboxMessage>();

  public async salvar(message: OutboxMessage): Promise<void> {
    this.items.set(message.id, message);
  }

  public async salvarEmLote(messages: OutboxMessage[]): Promise<void> {
    for (const msg of messages) {
      this.items.set(msg.id, msg);
    }
  }

  public async atualizar(message: OutboxMessage): Promise<void> {
    this.items.set(message.id, message);
  }

  public async buscarPorId(id: string): Promise<OutboxMessage | null> {
    return this.items.get(id) ?? null;
  }

  public async buscarPorStatus(status: StatusOutbox): Promise<OutboxMessage[]> {
    return Array.from(this.items.values()).filter((m) => m.status === status);
  }

  public async buscarPendentesParaEnvio(limite: number, agora: Date = new Date()): Promise<OutboxMessage[]> {
    return Array.from(this.items.values())
      .filter((m) => (m.status === 'PENDENTE' || m.status === 'FALHADO') && m.proximaTentativaEm <= agora)
      .slice(0, limite);
  }

  public async contarPorStatus(status: StatusOutbox): Promise<number> {
    return Array.from(this.items.values()).filter((m) => m.status === status).length;
  }

  public async contarTotal(): Promise<number> {
    return this.items.size;
  }
}
