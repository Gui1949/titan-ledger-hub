// src/application/services/HealthCheckService.ts
import {
  ComponentHealth,
  HealthCheckResult,
  HealthStatus,
  IHealthCheckService,
} from '../ports/health/IHealthCheckService.js';
import { IContaContabilRepository } from '../ports/repositories/IContaContabilRepository.js';
import { ILancamentoContabilRepository } from '../ports/repositories/ILancamentoContabilRepository.js';
import { IOutboxRepository } from '../ports/repositories/IOutboxRepository.js';

export interface HealthCheckConfig {
  maxOutboxPendingBacklog?: number;
}

export class HealthCheckService implements IHealthCheckService {
  private readonly startTimestamp = Date.now();

  constructor(
    private readonly contaRepo: IContaContabilRepository,
    private readonly lancamentoRepo: ILancamentoContabilRepository,
    private readonly outboxRepo: IOutboxRepository,
    private readonly config: HealthCheckConfig = {
      maxOutboxPendingBacklog: 50,
    }
  ) {}

  public verificarLiveness(): ComponentHealth {
    return {
      status: 'UP',
      mensagem: 'Processo do TitanLedger & Clearing Hub ativo e responsivo.',
      metadata: {
        uptimeSeconds: Math.floor((Date.now() - this.startTimestamp) / 1000),
      },
    };
  }

  public async verificarReadiness(): Promise<ComponentHealth> {
    try {
      await this.contaRepo.listarTodas();
      await this.lancamentoRepo.contarTotal();
      await this.outboxRepo.contarTotal();
      return {
        status: 'UP',
        mensagem: 'Todos os repositórios de contas, livro-razão e outbox estão operacionais.',
      };
    } catch (err: any) {
      return {
        status: 'DOWN',
        mensagem: `Falha na prontidão dos repositórios: ${err.message}`,
      };
    }
  }

  /**
   * RN-11: Auditoria da Invariante Global de Partidas Dobradas
   * Varre todos os lançamentos do livro-razão e audita se a soma de Débitos é rigorosamente igual a Créditos.
   */
  public async verificarIntegridadeContabil(): Promise<ComponentHealth> {
    const contas = await this.contaRepo.listarTodas();
    let totalDebitosCentavos = 0;
    let totalCreditosCentavos = 0;
    let totalLancamentos = 0;

    for (const conta of contas) {
      const lancamentos = await this.lancamentoRepo.buscarPorContaId(conta.id);
      for (const lan of lancamentos) {
        totalLancamentos++;
        if (lan.tipo === 'DEBITO') {
          totalDebitosCentavos += lan.valor.centavos;
        } else if (lan.tipo === 'CREDITO') {
          totalCreditosCentavos += lan.valor.centavos;
        }
      }
    }

    const residuoCentavos = Math.abs(totalDebitosCentavos - totalCreditosCentavos);

    if (residuoCentavos !== 0) {
      return {
        status: 'DOWN',
        mensagem: `CRÍTICO: Assimetria contábil detectada! Total Débitos (${totalDebitosCentavos}c) ≠ Total Créditos (${totalCreditosCentavos}c). Resíduo: ${residuoCentavos}c`,
        metadata: {
          totalDebitosCentavos,
          totalCreditosCentavos,
          residuoCentavos,
          totalLancamentos,
        },
      };
    }

    return {
      status: 'UP',
      mensagem: `Livro-Razão 100% equilibrado em partidas dobradas. Resíduo zero absoluto (0 centavos em ${totalLancamentos} lançamentos).`,
      metadata: {
        totalDebitosCentavos,
        totalCreditosCentavos,
        residuoCentavos: 0,
        totalLancamentos,
      },
    };
  }

  /**
   * RN-12: Monitor de Saturação de Mensageria e Fila DLQ
   */
  public async verificarFilaMensageria(): Promise<ComponentHealth> {
    const dlqCount = await this.outboxRepo.contarPorStatus('DLQ');
    const pendentesCount = await this.outboxRepo.contarPorStatus('PENDENTE');
    const falhadosCount = await this.outboxRepo.contarPorStatus('FALHADO');
    const maxBacklog = this.config.maxOutboxPendingBacklog ?? 50;

    if (dlqCount > 0) {
      return {
        status: 'DEGRADED',
        mensagem: `ALERTA: Existem ${dlqCount} mensagens na Dead Letter Queue (DLQ) aguardando intervenção manual.`,
        metadata: { dlqCount, pendentesCount, falhadosCount },
      };
    }

    if (pendentesCount + falhadosCount > maxBacklog) {
      return {
        status: 'DEGRADED',
        mensagem: `ALERTA: Backlog de mensageria elevado (${pendentesCount + falhadosCount} mensagens pendentes/falhadas). Limite recomendado: ${maxBacklog}.`,
        metadata: { dlqCount, pendentesCount, falhadosCount, maxBacklog },
      };
    }

    return {
      status: 'UP',
      mensagem: `Esteira de mensageria saudável (0 mensagens em DLQ, ${pendentesCount} pendentes).`,
      metadata: { dlqCount, pendentesCount, falhadosCount },
    };
  }

  public async executarDiagnosticoCompleto(): Promise<HealthCheckResult> {
    const liveness = this.verificarLiveness();
    const readiness = await this.verificarReadiness();
    const integridade = await this.verificarIntegridadeContabil();
    const mensageria = await this.verificarFilaMensageria();

    let overallStatus: HealthStatus = 'UP';
    if (liveness.status === 'DOWN' || readiness.status === 'DOWN' || integridade.status === 'DOWN') {
      overallStatus = 'DOWN';
    } else if (mensageria.status === 'DEGRADED' || readiness.status === 'DEGRADED') {
      overallStatus = 'DEGRADED';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTimestamp) / 1000),
      components: {
        liveness,
        readiness,
        integridadeContabil: integridade,
        filaMensageria: mensageria,
      },
    };
  }
}
