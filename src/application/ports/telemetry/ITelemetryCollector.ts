// src/application/ports/telemetry/ITelemetryCollector.ts

export interface MetricasContabeis {
  totalTransacoesLiquidadas: number;
  totalVolumeLiquidadoCentavos: number;
  totalTransacoesEstornadas: number;
  totalVolumeEstornadoCentavos: number;
  totalReplaysIdempotentes: number;
  totalFalhasSaldoInsuficiente: number;
}

export interface MetricasLatenciaPix {
  amostras: number;
  totalMs: number;
  mediaMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface ITelemetryCollector {
  registrarTransacaoLiquidada(valorCentavos: number, duracaoMs: number): void;
  registrarTransacaoEstornada(valorCentavos: number, duracaoMs: number): void;
  registrarReplayIdempotente(): void;
  registrarFalhaSaldo(): void;

  obterMetricasContabeis(): MetricasContabeis;
  obterMetricasLatencia(): MetricasLatenciaPix;
  obterTaxaEstornoPercentual(): number;
  reset(): void;
}
