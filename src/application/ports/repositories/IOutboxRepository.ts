// src/application/ports/repositories/IOutboxRepository.ts
import { OutboxMessage, StatusOutbox } from '../../../domain/entities/OutboxMessage.js';

export interface IOutboxRepository {
  salvar(message: OutboxMessage): Promise<void>;
  salvarEmLote(messages: OutboxMessage[]): Promise<void>;
  atualizar(message: OutboxMessage): Promise<void>;
  buscarPorId(id: string): Promise<OutboxMessage | null>;
  buscarPorStatus(status: StatusOutbox): Promise<OutboxMessage[]>;
  buscarPendentesParaEnvio(limite: number, agora?: Date): Promise<OutboxMessage[]>;
  contarPorStatus(status: StatusOutbox): Promise<number>;
  contarTotal(): Promise<number>;
}
