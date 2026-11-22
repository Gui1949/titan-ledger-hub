// src/application/use-cases/processar-transferencia-pix/ProcessarTransferenciaPixUseCase.ts
import { IUnitOfWork } from '../../ports/unit-of-work/IUnitOfWork.js';
import { ILockManager } from '../../ports/concurrency/ILockManager.js';
import { IContaContabilRepository } from '../../ports/repositories/IContaContabilRepository.js';
import { ITransacaoRepository } from '../../ports/repositories/ITransacaoRepository.js';
import { ILancamentoContabilRepository } from '../../ports/repositories/ILancamentoContabilRepository.js';
import {
  ProcessarTransferenciaPixInputDTO,
  ProcessarTransferenciaPixOutputDTO,
} from './ProcessarTransferenciaPixDTO.js';
import {
  ContaNaoEncontradaError,
  ChavePixDestinoNaoEncontradaError,
} from '../../errors/application-errors.js';
import { ValorMonetario } from '../../../domain/value-objects/ValorMonetario.js';
import { TransacaoDeTransferencia } from '../../../domain/entities/TransacaoDeTransferencia.js';
import { LancamentoContabil } from '../../../domain/entities/LancamentoContabil.js';
import { MotorContabilDoubleEntry } from '../../../domain/services/MotorContabilDoubleEntry.js';
import { LedgerBalanceService } from '../../../domain/services/LedgerBalanceService.js';
import { PixTransferenciaLiquidadaEvent } from '../../../domain/events/PixTransferenciaLiquidadaEvent.js';
import { OutboxMessage } from '../../../domain/entities/OutboxMessage.js';
import { ITelemetryCollector } from '../../ports/telemetry/ITelemetryCollector.js';

export class ProcessarTransferenciaPixUseCase {
  private readonly motorContabil = new MotorContabilDoubleEntry();
  private readonly ledgerBalanceService = new LedgerBalanceService();

  constructor(
    private readonly unitOfWork: IUnitOfWork,
    private readonly lockManager: ILockManager,
    private readonly contaRepo: IContaContabilRepository,
    private readonly transacaoRepo: ITransacaoRepository,
    private readonly lancamentoRepo: ILancamentoContabilRepository,
    private readonly telemetry?: ITelemetryCollector
  ) {}

  public async execute(
    input: ProcessarTransferenciaPixInputDTO
  ): Promise<ProcessarTransferenciaPixOutputDTO> {
    const startMs = Date.now();

    // 1. Verificação de Idempotência
    const transacaoExistente = await this.transacaoRepo.buscarPorIdempotencyKey(input.idempotencyKey);
    if (transacaoExistente) {
      this.telemetry?.registrarReplayIdempotente();
      const lancamentos = await this.lancamentoRepo.buscarPorTransacaoId(transacaoExistente.id);
      const debito = lancamentos.find((l) => l.tipo === 'DEBITO')!;
      const credito = lancamentos.find((l) => l.tipo === 'CREDITO')!;

      const contaOrigem = (await this.contaRepo.buscarPorId(debito.contaId))!;
      const contaDestino = (await this.contaRepo.buscarPorId(credito.contaId))!;

      const lancamentosOrigem = await this.lancamentoRepo.buscarPorContaId(contaOrigem.id);
      const lancamentosDestino = await this.lancamentoRepo.buscarPorContaId(contaDestino.id);

      const saldoOrigem = this.ledgerBalanceService.calcularSaldo(contaOrigem, lancamentosOrigem);
      const saldoDestino = this.ledgerBalanceService.calcularSaldo(contaDestino, lancamentosDestino);

      return {
        transacaoId: transacaoExistente.id,
        endToEndId: transacaoExistente.endToEndId,
        status: transacaoExistente.status,
        contaOrigemId: contaOrigem.id,
        contaDestinoId: contaDestino.id,
        valorCentavos: debito.valor.centavos,
        lancamentoDebitoId: debito.id,
        lancamentoCreditoId: credito.id,
        saldoRemanescenteOrigemCentavos: saldoOrigem,
        saldoAtualDestinoCentavos: saldoDestino,
        efetivadoEm: transacaoExistente.createdAt.toISOString(),
        reutilizouIdempotencia: true,
      };
    }

    // 2. Busca prévia das contas para identificação de IDs para lock ordenado
    const contaOrigem = await this.contaRepo.buscarPorId(input.contaOrigemId);
    if (!contaOrigem) {
      throw new ContaNaoEncontradaError(input.contaOrigemId);
    }

    const contaDestino = await this.contaRepo.buscarPorChavePix(input.chavePixDestino);
    if (!contaDestino) {
      throw new ChavePixDestinoNaoEncontradaError(input.chavePixDestino);
    }

    const valorMonetario = ValorMonetario.fromCentavos(input.valorCentavos);

    // 3. Execução protegida por Mutex Lock nos recursos (ordenados para evitar deadlocks)
    return await this.lockManager.runWithLocks(
      [contaOrigem.id, contaDestino.id],
      async () => {
        // 4. Execução atômica no Unit of Work
        return await this.unitOfWork.runInTransaction(async (ctx) => {
          // Revalida contas dentro da transação
          const cOrigem = await ctx.contas.buscarPorId(contaOrigem.id);
          const cDestino = await ctx.contas.buscarPorId(contaDestino.id);

          if (!cOrigem) throw new ContaNaoEncontradaError(contaOrigem.id);
          if (!cDestino) throw new ContaNaoEncontradaError(contaDestino.id);

          // Calcula saldo da conta origem a partir do ledger
          const lancamentosOrigemAntes = await ctx.lancamentos.buscarPorContaId(cOrigem.id);
          const saldoOrigemAntes = this.ledgerBalanceService.calcularSaldo(cOrigem, lancamentosOrigemAntes);

          // Valida saldo disponível (RN-04) e status operacional de ambas as contas
          this.ledgerBalanceService.validarSaldoDisponivel(cOrigem, saldoOrigemAntes, valorMonetario.centavos);

          if (!cDestino.isOperacional) {
            throw new ContaNaoEncontradaError(
              `Conta destino ${cDestino.id} não está operacional (Status: ${cDestino.status})`
            );
          }

          // Instancia a Transação de Transferência
          const transacao = new TransacaoDeTransferencia({
            endToEndId: input.endToEndId,
            tipo: 'PIX_TRANSFERENCIA',
            chavePixOrigem: cOrigem.chavePix,
            chavePixDestino: cDestino.chavePix,
          });

          // Cria lançamentos de Partidas Dobradas (RN-01 & RN-02)
          const lancamentoDebito = new LancamentoContabil({
            transacaoId: transacao.id,
            contaId: cOrigem.id,
            tipo: 'DEBITO',
            valor: valorMonetario,
            historico: input.descricao ?? `Pix Enviado para ${cDestino.titular} (E2E: ${transacao.endToEndId})`,
          });

          const lancamentoCredito = new LancamentoContabil({
            transacaoId: transacao.id,
            contaId: cDestino.id,
            tipo: 'CREDITO',
            valor: valorMonetario,
            historico: input.descricao ?? `Pix Recebido de ${cOrigem.titular} (E2E: ${transacao.endToEndId})`,
          });

          transacao.adicionarLancamento(lancamentoDebito);
          transacao.adicionarLancamento(lancamentoCredito);

          // Validação matemática estrita de soma zero de partidas dobradas
          this.motorContabil.validarEquilibrio(transacao);

          // FSM da transação
          transacao.iniciarProcessamento();
          transacao.liquidar();

          // Persistência atômica via TransactionContext
          await ctx.transacoes.salvarComIdempotencia(input.idempotencyKey, transacao);
          await ctx.lancamentos.adicionarEmLote([lancamentoDebito, lancamentoCredito]);

          // Mensageria SPI ISO 20022 (pacs.008) via Transactional Outbox
          const evento = new PixTransferenciaLiquidadaEvent({
            msgId: `MSG-PACS008-${transacao.id}`,
            endToEndId: transacao.endToEndId,
            transacaoId: transacao.id,
            valorCentavos: valorMonetario.centavos,
            valorFormatadoBrl: valorMonetario.formatarBrl(),
            debitoContaId: cOrigem.id,
            debitoTitular: cOrigem.titular,
            creditoContaId: cDestino.id,
            creditoTitular: cDestino.titular,
            chavePixDestino: input.chavePixDestino,
            liquidadoEm: transacao.updatedAt.toISOString(),
            isoStandard: 'pacs.008.001.08',
          });

          const outboxMsg = new OutboxMessage({
            aggregateType: 'TransacaoDeTransferencia',
            aggregateId: transacao.id,
            eventType: evento.eventType,
            payload: JSON.stringify(evento.payload),
          });
          await ctx.outbox.salvar(outboxMsg);

          // Recálculo dos saldos pós-liquidação a partir do ledger
          const lancamentosOrigemDepois = await ctx.lancamentos.buscarPorContaId(cOrigem.id);
          const lancamentosDestinoDepois = await ctx.lancamentos.buscarPorContaId(cDestino.id);

          const saldoRemanescenteOrigem = this.ledgerBalanceService.calcularSaldo(cOrigem, lancamentosOrigemDepois);
          const saldoAtualDestino = this.ledgerBalanceService.calcularSaldo(cDestino, lancamentosDestinoDepois);

          this.telemetry?.registrarTransacaoLiquidada(valorMonetario.centavos, Date.now() - startMs);

          return {
            transacaoId: transacao.id,
            endToEndId: transacao.endToEndId,
            status: transacao.status,
            contaOrigemId: cOrigem.id,
            contaDestinoId: cDestino.id,
            valorCentavos: valorMonetario.centavos,
            lancamentoDebitoId: lancamentoDebito.id,
            lancamentoCreditoId: lancamentoCredito.id,
            saldoRemanescenteOrigemCentavos: saldoRemanescenteOrigem,
            saldoAtualDestinoCentavos: saldoAtualDestino,
            efetivadoEm: transacao.createdAt.toISOString(),
            reutilizouIdempotencia: false,
          };
        });
      }
    );
  }
}
