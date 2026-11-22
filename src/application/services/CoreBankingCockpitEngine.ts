// src/application/services/CoreBankingCockpitEngine.ts
import { IContaContabilRepository } from '../ports/repositories/IContaContabilRepository.js';
import { ILancamentoContabilRepository } from '../ports/repositories/ILancamentoContabilRepository.js';
import { IOutboxRepository } from '../ports/repositories/IOutboxRepository.js';
import { ITelemetryCollector } from '../ports/telemetry/ITelemetryCollector.js';
import { IHealthCheckService } from '../ports/health/IHealthCheckService.js';
import { LedgerBalanceService } from '../../domain/services/LedgerBalanceService.js';

export interface CockpitSnapshot {
  resumoContabil: {
    totalContasCadastradas: number;
    totalContasAtivas: number;
    totalSaldoPassivoCentavos: number;
    totalSaldoPassivoFormatadoBrl: string;
    totalLancamentosLedger: number;
    residuoContabilGlobalCentavos: number;
    statusAuditoria: 'EQUILIBRADO_SOMA_ZERO' | 'DIVERGENTE';
  };
  metricasOperacionais: {
    volumeTotalLiquidadoCentavos: number;
    volumeTotalLiquidadoFormatadoBrl: string;
    volumeTotalEstornadoCentavos: number;
    quantidadeLiquidadas: number;
    quantidadeEstornadas: number;
    taxaEstornoPercentual: number;
    latenciaMediaMs: number;
    latenciaP95Ms: number;
    latenciaP99Ms: number;
    slaSpiCompliance: boolean; // P99 < 1000ms
  };
  statusInfraestrutura: {
    liveness: string;
    readiness: string;
    mensagensOutboxPendentes: number;
    mensagensOutboxDLQ: number;
    uptimeSegundos: number;
  };
}

export class CoreBankingCockpitEngine {
  private readonly ledgerBalanceService = new LedgerBalanceService();

  constructor(
    private readonly contaRepo: IContaContabilRepository,
    private readonly lancamentoRepo: ILancamentoContabilRepository,
    private readonly outboxRepo: IOutboxRepository,
    private readonly telemetry: ITelemetryCollector,
    private readonly healthCheck: IHealthCheckService
  ) {}

  public async obterSnapshot(): Promise<CockpitSnapshot> {
    const contas = await this.contaRepo.listarTodas();
    const totalContasCadastradas = contas.length;
    const totalContasAtivas = contas.filter((c) => c.isOperacional).length;

    let totalSaldoPassivoCentavos = 0;
    for (const conta of contas) {
      if (conta.natureza === 'PASSIVO') {
        const lancamentos = await this.lancamentoRepo.buscarPorContaId(conta.id);
        totalSaldoPassivoCentavos += this.ledgerBalanceService.calcularSaldo(conta, lancamentos);
      }
    }

    const diagnostico = await this.healthCheck.executarDiagnosticoCompleto();
    const integridade = diagnostico.components.integridadeContabil;
    const residuo = integridade.metadata?.residuoCentavos ?? 0;
    const totalLancamentos = await this.lancamentoRepo.contarTotal();

    const metricasContabeis = this.telemetry.obterMetricasContabeis();
    const metricasLatencia = this.telemetry.obterMetricasLatencia();
    const taxaEstorno = this.telemetry.obterTaxaEstornoPercentual();

    const pendentes = await this.outboxRepo.contarPorStatus('PENDENTE');
    const dlq = await this.outboxRepo.contarPorStatus('DLQ');

    const slaSpiCompliance = metricasLatencia.amostras === 0 || metricasLatencia.p99Ms <= 1000;

    return {
      resumoContabil: {
        totalContasCadastradas,
        totalContasAtivas,
        totalSaldoPassivoCentavos,
        totalSaldoPassivoFormatadoBrl: (totalSaldoPassivoCentavos / 100).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }),
        totalLancamentosLedger: totalLancamentos,
        residuoContabilGlobalCentavos: residuo,
        statusAuditoria: residuo === 0 ? 'EQUILIBRADO_SOMA_ZERO' : 'DIVERGENTE',
      },
      metricasOperacionais: {
        volumeTotalLiquidadoCentavos: metricasContabeis.totalVolumeLiquidadoCentavos,
        volumeTotalLiquidadoFormatadoBrl: (
          metricasContabeis.totalVolumeLiquidadoCentavos / 100
        ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        volumeTotalEstornadoCentavos: metricasContabeis.totalVolumeEstornadoCentavos,
        quantidadeLiquidadas: metricasContabeis.totalTransacoesLiquidadas,
        quantidadeEstornadas: metricasContabeis.totalTransacoesEstornadas,
        taxaEstornoPercentual: taxaEstorno,
        latenciaMediaMs: metricasLatencia.mediaMs,
        latenciaP95Ms: metricasLatencia.p95Ms,
        latenciaP99Ms: metricasLatencia.p99Ms,
        slaSpiCompliance,
      },
      statusInfraestrutura: {
        liveness: diagnostico.components.liveness.status,
        readiness: diagnostico.components.readiness.status,
        mensagensOutboxPendentes: pendentes,
        mensagensOutboxDLQ: dlq,
        uptimeSegundos: diagnostico.uptimeSeconds,
      },
    };
  }
}
