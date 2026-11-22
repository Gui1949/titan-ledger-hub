// src/application/ports/health/IHealthCheckService.ts

export type HealthStatus = 'UP' | 'DEGRADED' | 'DOWN';

export interface ComponentHealth {
  status: HealthStatus;
  mensagem: string;
  metadata?: Record<string, any>;
}

export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: string;
  uptimeSeconds: number;
  components: {
    liveness: ComponentHealth;
    readiness: ComponentHealth;
    integridadeContabil: ComponentHealth;
    filaMensageria: ComponentHealth;
  };
}

export interface IHealthCheckService {
  verificarLiveness(): ComponentHealth;
  verificarReadiness(): Promise<ComponentHealth>;
  verificarIntegridadeContabil(): Promise<ComponentHealth>;
  verificarFilaMensageria(): Promise<ComponentHealth>;
  executarDiagnosticoCompleto(): Promise<HealthCheckResult>;
}
