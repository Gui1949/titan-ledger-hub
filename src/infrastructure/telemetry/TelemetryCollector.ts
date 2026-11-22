// src/infrastructure/telemetry/TelemetryCollector.ts
import {
  ITelemetryCollector,
  MetricasContabeis,
  MetricasLatenciaPix,
} from '../../application/ports/telemetry/ITelemetryCollector.js';

export class TelemetryCollector implements ITelemetryCollector {
  private totalTransacoesLiquidadas = 0;
  private totalVolumeLiquidadoCentavos = 0;
  private totalTransacoesEstornadas = 0;
  private totalVolumeEstornadoCentavos = 0;
  private totalReplaysIdempotentes = 0;
  private totalFalhasSaldoInsuficiente = 0;

  private amostrasLatenciaMs: number[] = [];
  private totalMs = 0;
  private minMs = Number.MAX_SAFE_INTEGER;
  private maxMs = 0;

  public registrarTransacaoLiquidada(valorCentavos: number, duracaoMs: number): void {
    this.totalTransacoesLiquidadas++;
    this.totalVolumeLiquidadoCentavos += valorCentavos;
    this.registrarLatencia(duracaoMs);
  }

  public registrarTransacaoEstornada(valorCentavos: number, duracaoMs: number): void {
    this.totalTransacoesEstornadas++;
    this.totalVolumeEstornadoCentavos += valorCentavos;
    this.registrarLatencia(duracaoMs);
  }

  public registrarReplayIdempotente(): void {
    this.totalReplaysIdempotentes++;
  }

  public registrarFalhaSaldo(): void {
    this.totalFalhasSaldoInsuficiente++;
  }

  private registrarLatencia(duracaoMs: number): void {
    const latencia = Math.max(0, duracaoMs);
    this.amostrasLatenciaMs.push(latencia);
    this.totalMs += latencia;
    if (latencia < this.minMs) this.minMs = latencia;
    if (latencia > this.maxMs) this.maxMs = latencia;
  }

  public obterMetricasContabeis(): MetricasContabeis {
    return {
      totalTransacoesLiquidadas: this.totalTransacoesLiquidadas,
      totalVolumeLiquidadoCentavos: this.totalVolumeLiquidadoCentavos,
      totalTransacoesEstornadas: this.totalTransacoesEstornadas,
      totalVolumeEstornadoCentavos: this.totalVolumeEstornadoCentavos,
      totalReplaysIdempotentes: this.totalReplaysIdempotentes,
      totalFalhasSaldoInsuficiente: this.totalFalhasSaldoInsuficiente,
    };
  }

  public obterMetricasLatencia(): MetricasLatenciaPix {
    const count = this.amostrasLatenciaMs.length;
    if (count === 0) {
      return {
        amostras: 0,
        totalMs: 0,
        mediaMs: 0,
        minMs: 0,
        maxMs: 0,
        p50Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
      };
    }

    const ordenadas = [...this.amostrasLatenciaMs].sort((a, b) => a - b);
    const media = Number((this.totalMs / count).toFixed(2));

    const p50Index = Math.min(count - 1, Math.floor(count * 0.5));
    const p95Index = Math.min(count - 1, Math.floor(count * 0.95));
    const p99Index = Math.min(count - 1, Math.floor(count * 0.99));

    return {
      amostras: count,
      totalMs: Number(this.totalMs.toFixed(2)),
      mediaMs: media,
      minMs: Number(this.minMs.toFixed(2)),
      maxMs: Number(this.maxMs.toFixed(2)),
      p50Ms: Number(ordenadas[p50Index].toFixed(2)),
      p95Ms: Number(ordenadas[p95Index].toFixed(2)),
      p99Ms: Number(ordenadas[p99Index].toFixed(2)),
    };
  }

  public obterTaxaEstornoPercentual(): number {
    const total = this.totalTransacoesLiquidadas + this.totalTransacoesEstornadas;
    if (total === 0) return 0;
    return Number(((this.totalTransacoesEstornadas / total) * 100).toFixed(2));
  }

  public reset(): void {
    this.totalTransacoesLiquidadas = 0;
    this.totalVolumeLiquidadoCentavos = 0;
    this.totalTransacoesEstornadas = 0;
    this.totalVolumeEstornadoCentavos = 0;
    this.totalReplaysIdempotentes = 0;
    this.totalFalhasSaldoInsuficiente = 0;
    this.amostrasLatenciaMs = [];
    this.totalMs = 0;
    this.minMs = Number.MAX_SAFE_INTEGER;
    this.maxMs = 0;
  }
}
