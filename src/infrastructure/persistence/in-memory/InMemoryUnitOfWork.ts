// src/infrastructure/persistence/in-memory/InMemoryUnitOfWork.ts
import { IUnitOfWork, ITransactionContext } from '../../../application/ports/unit-of-work/IUnitOfWork.js';
import { IContaContabilRepository } from '../../../application/ports/repositories/IContaContabilRepository.js';
import { ILancamentoContabilRepository } from '../../../application/ports/repositories/ILancamentoContabilRepository.js';
import { ITransacaoRepository } from '../../../application/ports/repositories/ITransacaoRepository.js';
import { IOutboxRepository } from '../../../application/ports/repositories/IOutboxRepository.js';
import { InMemoryContaContabilRepository } from './InMemoryContaContabilRepository.js';
import { InMemoryLancamentoContabilRepository } from './InMemoryLancamentoContabilRepository.js';
import { InMemoryTransacaoRepository } from './InMemoryTransacaoRepository.js';
import { InMemoryOutboxRepository } from './InMemoryOutboxRepository.js';
import { ContaContabil } from '../../../domain/entities/ContaContabil.js';
import { LancamentoContabil } from '../../../domain/entities/LancamentoContabil.js';
import { TransacaoDeTransferencia } from '../../../domain/entities/TransacaoDeTransferencia.js';
import { OutboxMessage } from '../../../domain/entities/OutboxMessage.js';

export class InMemoryUnitOfWork implements IUnitOfWork {
  constructor(
    private readonly contaRepo: InMemoryContaContabilRepository,
    private readonly lancamentoRepo: InMemoryLancamentoContabilRepository,
    private readonly transacaoRepo: InMemoryTransacaoRepository,
    private readonly outboxRepo: InMemoryOutboxRepository = new InMemoryOutboxRepository()
  ) {}

  public async runInTransaction<T>(
    work: (context: ITransactionContext) => Promise<T>
  ): Promise<T> {
    // Snapshot para rollback
    const contasOriginais = new Map<string, ContaContabil>();
    const contasSalvasNestaTx = new Set<string>();

    const lancamentosAdicionadosNestaTx: LancamentoContabil[] = [];

    const transacoesOriginais = new Map<string, TransacaoDeTransferencia>();
    const transacoesSalvasNestaTx = new Set<string>();
    const idempotenciasSalvasNestaTx = new Set<string>();

    const outboxOriginais = new Map<string, OutboxMessage>();
    const outboxSalvasNestaTx = new Set<string>();

    const txContas: IContaContabilRepository = {
      salvar: async (c) => {
        if (!this.contaRepo.contas.has(c.id)) {
          contasSalvasNestaTx.add(c.id);
        } else if (!contasOriginais.has(c.id)) {
          contasOriginais.set(c.id, this.contaRepo.contas.get(c.id)!);
        }
        await this.contaRepo.salvar(c);
      },
      atualizar: async (c) => {
        if (!contasOriginais.has(c.id)) {
          const antes = await this.contaRepo.buscarPorId(c.id);
          if (antes) contasOriginais.set(c.id, antes);
        }
        await this.contaRepo.atualizar(c);
      },
      buscarPorId: (id) => this.contaRepo.buscarPorId(id),
      buscarPorChavePix: (chave) => this.contaRepo.buscarPorChavePix(chave),
      buscarPorAgenciaConta: (banco, ag, conta) => this.contaRepo.buscarPorAgenciaConta(banco, ag, conta),
      listarTodas: () => this.contaRepo.listarTodas(),
    };

    const txLancamentos: ILancamentoContabilRepository = {
      adicionar: async (lan) => {
        lancamentosAdicionadosNestaTx.push(lan);
        await this.lancamentoRepo.adicionar(lan);
      },
      adicionarEmLote: async (lans) => {
        lancamentosAdicionadosNestaTx.push(...lans);
        await this.lancamentoRepo.adicionarEmLote(lans);
      },
      buscarPorContaId: (contaId) => this.lancamentoRepo.buscarPorContaId(contaId),
      buscarPorTransacaoId: (txId) => this.lancamentoRepo.buscarPorTransacaoId(txId),
      contarTotal: () => this.lancamentoRepo.contarTotal(),
    };

    const txTransacoes: ITransacaoRepository = {
      salvar: async (tx) => {
        if (!this.transacaoRepo.transacoes.has(tx.id)) {
          transacoesSalvasNestaTx.add(tx.id);
        } else if (!transacoesOriginais.has(tx.id)) {
          transacoesOriginais.set(tx.id, this.transacaoRepo.transacoes.get(tx.id)!);
        }
        await this.transacaoRepo.salvar(tx);
      },
      atualizar: async (tx) => {
        if (!transacoesOriginais.has(tx.id)) {
          const antes = await this.transacaoRepo.buscarPorId(tx.id);
          if (antes) transacoesOriginais.set(tx.id, antes);
        }
        await this.transacaoRepo.atualizar(tx);
      },
      buscarPorId: (id) => this.transacaoRepo.buscarPorId(id),
      buscarPorEndToEndId: (e2e) => this.transacaoRepo.buscarPorEndToEndId(e2e),
      buscarPorIdempotencyKey: (k) => this.transacaoRepo.buscarPorIdempotencyKey(k),
      salvarComIdempotencia: async (k, tx) => {
        idempotenciasSalvasNestaTx.add(k);
        if (!this.transacaoRepo.transacoes.has(tx.id)) {
          transacoesSalvasNestaTx.add(tx.id);
        } else if (!transacoesOriginais.has(tx.id)) {
          transacoesOriginais.set(tx.id, this.transacaoRepo.transacoes.get(tx.id)!);
        }
        await this.transacaoRepo.salvarComIdempotencia(k, tx);
      },
      listarTodas: () => this.transacaoRepo.listarTodas(),
    };

    const txOutbox: IOutboxRepository = {
      salvar: async (msg) => {
        if (!this.outboxRepo.items.has(msg.id)) {
          outboxSalvasNestaTx.add(msg.id);
        } else if (!outboxOriginais.has(msg.id)) {
          outboxOriginais.set(msg.id, this.outboxRepo.items.get(msg.id)!);
        }
        await this.outboxRepo.salvar(msg);
      },
      salvarEmLote: async (msgs) => {
        for (const m of msgs) {
          await txOutbox.salvar(m);
        }
      },
      atualizar: async (msg) => {
        if (!outboxOriginais.has(msg.id)) {
          const antes = await this.outboxRepo.buscarPorId(msg.id);
          if (antes) outboxOriginais.set(msg.id, antes);
        }
        await this.outboxRepo.atualizar(msg);
      },
      buscarPorId: (id) => this.outboxRepo.buscarPorId(id),
      buscarPorStatus: (st) => this.outboxRepo.buscarPorStatus(st),
      buscarPendentesParaEnvio: (lim, dt) => this.outboxRepo.buscarPendentesParaEnvio(lim, dt),
      contarPorStatus: (st) => this.outboxRepo.contarPorStatus(st),
      contarTotal: () => this.outboxRepo.contarTotal(),
    };

    try {
      const result = await work({
        contas: txContas,
        lancamentos: txLancamentos,
        transacoes: txTransacoes,
        outbox: txOutbox,
      });
      return result;
    } catch (error) {
      // Rollback atômico
      // 1. Restaura contas originais
      for (const [id, original] of contasOriginais.entries()) {
        this.contaRepo.contas.set(id, original);
      }
      for (const id of contasSalvasNestaTx) {
        this.contaRepo.contas.delete(id);
      }

      // 2. Remove lançamentos adicionados durante a transação
      for (const lan of lancamentosAdicionadosNestaTx) {
        const idx = this.lancamentoRepo.lancamentos.findIndex((l) => l.id === lan.id);
        if (idx !== -1) {
          this.lancamentoRepo.lancamentos.splice(idx, 1);
        }
      }

      // 3. Restaura transações originais e remove as salvas
      for (const [id, original] of transacoesOriginais.entries()) {
        this.transacaoRepo.transacoes.set(id, original);
      }
      for (const id of transacoesSalvasNestaTx) {
        this.transacaoRepo.transacoes.delete(id);
      }
      for (const key of idempotenciasSalvasNestaTx) {
        this.transacaoRepo.idempotenciaMap.delete(key);
      }

      // 4. Restaura outbox
      for (const [id, original] of outboxOriginais.entries()) {
        this.outboxRepo.items.set(id, original);
      }
      for (const id of outboxSalvasNestaTx) {
        this.outboxRepo.items.delete(id);
      }

      throw error;
    }
  }
}
