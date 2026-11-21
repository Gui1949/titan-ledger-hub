// src/application/use-cases/estornar-transferencia-pix/EstornarTransferenciaPixUseCase.ts
import { IUnitOfWork } from '../../ports/unit-of-work/IUnitOfWork.js';
import { ILockManager } from '../../ports/concurrency/ILockManager.js';
import { ITransacaoRepository } from '../../ports/repositories/ITransacaoRepository.js';
import { ILancamentoContabilRepository } from '../../ports/repositories/ILancamentoContabilRepository.js';
import { IContaContabilRepository } from '../../ports/repositories/IContaContabilRepository.js';
import {
  EstornarTransferenciaPixInputDTO,
  EstornarTransferenciaPixOutputDTO,
} from './EstornarTransferenciaPixDTO.js';
import {
  TransacaoNaoEncontradaError,
  TransacaoJaEstornadaError,
  ContaNaoEncontradaError,
} from '../../errors/application-errors.js';
import { TransacaoDeTransferencia } from '../../../domain/entities/TransacaoDeTransferencia.js';
import { LancamentoContabil } from '../../../domain/entities/LancamentoContabil.js';
import { MotorContabilDoubleEntry } from '../../../domain/services/MotorContabilDoubleEntry.js';
import { LedgerBalanceService } from '../../../domain/services/LedgerBalanceService.js';
import { PixEstornoRealizadoEvent } from '../../../domain/events/PixEstornoRealizadoEvent.js';
import { OutboxMessage } from '../../../domain/entities/OutboxMessage.js';

export class EstornarTransferenciaPixUseCase {
  private readonly motorContabil = new MotorContabilDoubleEntry();
  private readonly ledgerBalanceService = new LedgerBalanceService();

  constructor(
    private readonly unitOfWork: IUnitOfWork,
    private readonly lockManager: ILockManager,
    private readonly contaRepo: IContaContabilRepository,
    private readonly transacaoRepo: ITransacaoRepository,
    private readonly lancamentoRepo: ILancamentoContabilRepository
  ) {}

  public async execute(
    input: EstornarTransferenciaPixInputDTO
  ): Promise<EstornarTransferenciaPixOutputDTO> {
    const transacaoOriginal = await this.transacaoRepo.buscarPorId(input.transacaoId);
    if (!transacaoOriginal) {
      throw new TransacaoNaoEncontradaError(input.transacaoId);
    }

    if (transacaoOriginal.status === 'ESTORNADA') {
      throw new TransacaoJaEstornadaError(input.transacaoId);
    }

    const lancamentosOriginais = await this.lancamentoRepo.buscarPorTransacaoId(transacaoOriginal.id);
    const debitoOriginal = lancamentosOriginais.find((l) => l.tipo === 'DEBITO')!;
    const creditoOriginal = lancamentosOriginais.find((l) => l.tipo === 'CREDITO')!;

    const contaOrigem = await this.contaRepo.buscarPorId(debitoOriginal.contaId);
    const contaDestino = await this.contaRepo.buscarPorId(creditoOriginal.contaId);

    if (!contaOrigem) throw new ContaNaoEncontradaError(debitoOriginal.contaId);
    if (!contaDestino) throw new ContaNaoEncontradaError(creditoOriginal.contaId);

    return await this.lockManager.runWithLocks(
      [contaOrigem.id, contaDestino.id],
      async () => {
        return await this.unitOfWork.runInTransaction(async (ctx) => {
          // Cria transação de estorno (Append-Only)
          const transacaoEstorno = new TransacaoDeTransferencia({
            tipo: 'PIX_ESTORNO',
            chavePixOrigem: transacaoOriginal.chavePixDestino,
            chavePixDestino: transacaoOriginal.chavePixOrigem,
          });

          // Inverte contrapartidas contábeis com soma zero
          const lancamentoEstornoDebito = new LancamentoContabil({
            transacaoId: transacaoEstorno.id,
            contaId: contaDestino.id, // Débito no recebedor original
            tipo: 'DEBITO',
            valor: creditoOriginal.valor,
            historico: `Estorno de Pix para ${contaOrigem.titular} (Ref: ${transacaoOriginal.endToEndId}) - ${input.motivoEstorno}`,
          });

          const lancamentoEstornoCredito = new LancamentoContabil({
            transacaoId: transacaoEstorno.id,
            contaId: contaOrigem.id, // Crédito no pagador original
            tipo: 'CREDITO',
            valor: debitoOriginal.valor,
            historico: `Estorno de Pix recebido de ${contaDestino.titular} (Ref: ${transacaoOriginal.endToEndId}) - ${input.motivoEstorno}`,
          });

          transacaoEstorno.adicionarLancamento(lancamentoEstornoDebito);
          transacaoEstorno.adicionarLancamento(lancamentoEstornoCredito);

          this.motorContabil.validarEquilibrio(transacaoEstorno);

          transacaoEstorno.iniciarProcessamento();
          transacaoEstorno.liquidar();

          // Atualiza status da transação original
          transacaoOriginal.estornar();

          await ctx.transacoes.atualizar(transacaoOriginal);
          await ctx.transacoes.salvar(transacaoEstorno);
          await ctx.lancamentos.adicionarEmLote([lancamentoEstornoDebito, lancamentoEstornoCredito]);

          // Mensageria SPI ISO 20022 (pacs.004) via Transactional Outbox
          const eventoEstorno = new PixEstornoRealizadoEvent({
            msgId: `MSG-PACS004-${transacaoEstorno.id}`,
            transacaoEstornoId: transacaoEstorno.id,
            transacaoOriginalId: transacaoOriginal.id,
            endToEndIdOriginal: transacaoOriginal.endToEndId,
            valorEstornadoCentavos: debitoOriginal.valor.centavos,
            valorFormatadoBrl: debitoOriginal.valor.formatarBrl(),
            motivoEstorno: input.motivoEstorno,
            estornadoEm: transacaoEstorno.updatedAt.toISOString(),
            isoStandard: 'pacs.004.001.09',
          });

          const outboxMsg = new OutboxMessage({
            aggregateType: 'TransacaoDeTransferencia',
            aggregateId: transacaoEstorno.id,
            eventType: eventoEstorno.eventType,
            payload: JSON.stringify(eventoEstorno.payload),
          });
          await ctx.outbox.salvar(outboxMsg);

          const lancamentosOrigemDepois = await ctx.lancamentos.buscarPorContaId(contaOrigem.id);
          const lancamentosDestinoDepois = await ctx.lancamentos.buscarPorContaId(contaDestino.id);

          const saldoOrigem = this.ledgerBalanceService.calcularSaldo(contaOrigem, lancamentosOrigemDepois);
          const saldoDestino = this.ledgerBalanceService.calcularSaldo(contaDestino, lancamentosDestinoDepois);

          return {
            transacaoOriginalId: transacaoOriginal.id,
            transacaoEstornoId: transacaoEstorno.id,
            statusOriginal: transacaoOriginal.status,
            statusEstorno: transacaoEstorno.status,
            valorEstornadoCentavos: debitoOriginal.valor.centavos,
            estornadoEm: transacaoEstorno.createdAt.toISOString(),
            saldoRestauradoOrigemCentavos: saldoOrigem,
            saldoRestauradoDestinoCentavos: saldoDestino,
          };
        });
      }
    );
  }
}
