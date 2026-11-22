// src/tests/application/telemetry-cockpit.test.ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { ContaContabil } from '../../domain/entities/ContaContabil.js';
import { LancamentoContabil } from '../../domain/entities/LancamentoContabil.js';
import { ChavePix } from '../../domain/value-objects/ChavePix.js';
import { ValorMonetario } from '../../domain/value-objects/ValorMonetario.js';
import { OutboxMessage } from '../../domain/entities/OutboxMessage.js';

import { ProcessarTransferenciaPixUseCase } from '../../application/use-cases/processar-transferencia-pix/ProcessarTransferenciaPixUseCase.js';
import { EstornarTransferenciaPixUseCase } from '../../application/use-cases/estornar-transferencia-pix/EstornarTransferenciaPixUseCase.js';
import { HealthCheckService } from '../../application/services/HealthCheckService.js';
import { CoreBankingCockpitEngine } from '../../application/services/CoreBankingCockpitEngine.js';

import { InMemoryContaContabilRepository } from '../../infrastructure/persistence/in-memory/InMemoryContaContabilRepository.js';
import { InMemoryLancamentoContabilRepository } from '../../infrastructure/persistence/in-memory/InMemoryLancamentoContabilRepository.js';
import { InMemoryTransacaoRepository } from '../../infrastructure/persistence/in-memory/InMemoryTransacaoRepository.js';
import { InMemoryOutboxRepository } from '../../infrastructure/persistence/in-memory/InMemoryOutboxRepository.js';
import { InMemoryUnitOfWork } from '../../infrastructure/persistence/in-memory/InMemoryUnitOfWork.js';
import { AsyncMutexLockManager } from '../../infrastructure/concurrency/AsyncMutexLockManager.js';
import { TelemetryCollector } from '../../infrastructure/telemetry/TelemetryCollector.js';

describe('🏛️ TitanLedger & Clearing Hub — Suíte de Telemetria, Probes & Cockpit (Fase 4)', () => {
  let contaRepo: InMemoryContaContabilRepository;
  let lancamentoRepo: InMemoryLancamentoContabilRepository;
  let transacaoRepo: InMemoryTransacaoRepository;
  let outboxRepo: InMemoryOutboxRepository;
  let unitOfWork: InMemoryUnitOfWork;
  let lockManager: AsyncMutexLockManager;
  let telemetry: TelemetryCollector;
  let healthCheck: HealthCheckService;
  let cockpitEngine: CoreBankingCockpitEngine;
  let processarPixUseCase: ProcessarTransferenciaPixUseCase;
  let estornarPixUseCase: EstornarTransferenciaPixUseCase;

  let contaAlice: ContaContabil;
  let contaBob: ContaContabil;
  let contaTesouraria: ContaContabil;
  let chavePixAlice: ChavePix;
  let chavePixBob: ChavePix;

  beforeEach(async () => {
    contaRepo = new InMemoryContaContabilRepository();
    lancamentoRepo = new InMemoryLancamentoContabilRepository();
    transacaoRepo = new InMemoryTransacaoRepository();
    outboxRepo = new InMemoryOutboxRepository();
    unitOfWork = new InMemoryUnitOfWork(contaRepo, lancamentoRepo, transacaoRepo, outboxRepo);
    lockManager = new AsyncMutexLockManager();
    telemetry = new TelemetryCollector();
    healthCheck = new HealthCheckService(contaRepo, lancamentoRepo, outboxRepo, { maxOutboxPendingBacklog: 10 });
    cockpitEngine = new CoreBankingCockpitEngine(contaRepo, lancamentoRepo, outboxRepo, telemetry, healthCheck);

    processarPixUseCase = new ProcessarTransferenciaPixUseCase(
      unitOfWork,
      lockManager,
      contaRepo,
      transacaoRepo,
      lancamentoRepo,
      telemetry
    );

    estornarPixUseCase = new EstornarTransferenciaPixUseCase(
      unitOfWork,
      lockManager,
      contaRepo,
      transacaoRepo,
      lancamentoRepo,
      telemetry
    );

    chavePixAlice = ChavePix.criar('12345678909');
    chavePixBob = ChavePix.criar('contato@bobtech.com.br');

    contaAlice = new ContaContabil({
      id: 'CONTA-ALICE-COCKPIT',
      titular: 'Alice Silva Santos',
      natureza: 'PASSIVO',
      chavePix: chavePixAlice,
      limiteChequeEspecialCentavos: 0,
    });

    contaBob = new ContaContabil({
      id: 'CONTA-BOB-COCKPIT',
      titular: 'Bob Engenharia Ltda',
      natureza: 'PASSIVO',
      chavePix: chavePixBob,
      limiteChequeEspecialCentavos: 0,
    });

    contaTesouraria = new ContaContabil({
      id: 'CONTA-TESOURARIA-SPI',
      titular: 'Reserva Bancária SPI Bacen',
      natureza: 'ATIVO',
      limiteChequeEspecialCentavos: 0,
    });

    await contaRepo.salvar(contaAlice);
    await contaRepo.salvar(contaBob);
    await contaRepo.salvar(contaTesouraria);

    // Aporte inicial de capital equilibrado (Partidas Dobradas: Ativo Débito / Passivo Crédito)
    await lancamentoRepo.adicionarEmLote([
      new LancamentoContabil({
        transacaoId: 'TX-CAPITAL-INICIAL',
        contaId: contaTesouraria.id,
        tipo: 'DEBITO',
        valor: ValorMonetario.fromCentavos(500000), // R$ 5.000,00 no Ativo
        historico: 'Aporte de Reserva Bancária SPI',
      }),
      new LancamentoContabil({
        transacaoId: 'TX-CAPITAL-INICIAL',
        contaId: contaAlice.id,
        tipo: 'CREDITO',
        valor: ValorMonetario.fromCentavos(500000), // R$ 5.000,00 no Passivo da Alice
        historico: 'Depósito em Conta Corrente',
      }),
    ]);
  });

  it('deve coletar métricas de telemetria e calcular histogramas de latência (p50, p95, p99)', async () => {
    // Executa 10 transferências simuladas
    for (let i = 0; i < 10; i++) {
      await processarPixUseCase.execute({
        idempotencyKey: `IDEMP-TELEMETRY-${i}`,
        contaOrigemId: contaAlice.id,
        chavePixDestino: chavePixBob.valor,
        valorCentavos: 10000, // R$ 100,00
      });
    }

    const metricasContabeis = telemetry.obterMetricasContabeis();
    assert.equal(metricasContabeis.totalTransacoesLiquidadas, 10);
    assert.equal(metricasContabeis.totalVolumeLiquidadoCentavos, 100000); // R$ 1.000,00

    const metricasLatencia = telemetry.obterMetricasLatencia();
    assert.equal(metricasLatencia.amostras, 10);
    assert.ok(metricasLatencia.mediaMs >= 0);
    assert.ok(metricasLatencia.p50Ms >= 0);
    assert.ok(metricasLatencia.p95Ms >= metricasLatencia.p50Ms);
    assert.ok(metricasLatencia.p99Ms >= metricasLatencia.p95Ms);
  });

  it('deve reportar UP nas probes de liveness e readiness quando o sistema estiver operacional', async () => {
    const liveness = healthCheck.verificarLiveness();
    assert.equal(liveness.status, 'UP');
    assert.ok(liveness.metadata?.uptimeSeconds !== undefined);

    const readiness = await healthCheck.verificarReadiness();
    assert.equal(readiness.status, 'UP');

    const diagnostico = await healthCheck.executarDiagnosticoCompleto();
    assert.equal(diagnostico.status, 'UP');
    assert.equal(diagnostico.components.liveness.status, 'UP');
    assert.equal(diagnostico.components.readiness.status, 'UP');
  });

  it('deve verificar integridade contábil RN-11 e reportar UP com resíduo zero absoluto (0c)', async () => {
    // Executa uma transferência Pix
    await processarPixUseCase.execute({
      idempotencyKey: 'IDEMP-INTEGRIDADE-01',
      contaOrigemId: contaAlice.id,
      chavePixDestino: chavePixBob.valor,
      valorCentavos: 25000,
    });

    const check = await healthCheck.verificarIntegridadeContabil();
    assert.equal(check.status, 'UP');
    assert.equal(check.metadata?.residuoCentavos, 0);
    assert.ok(check.metadata?.totalDebitosCentavos === check.metadata?.totalCreditosCentavos);
  });

  it('deve detectar assimetria contábil e reportar DOWN caso o livro-razão sofra divergência', async () => {
    // Simula corrupção/injeção de lançamento assimétrico não pareado
    await lancamentoRepo.adicionar(
      new LancamentoContabil({
        transacaoId: 'TX-ASSIMETRICA-CORROMPIDA',
        contaId: contaBob.id,
        tipo: 'CREDITO',
        valor: ValorMonetario.fromCentavos(9999), // R$ 99,99 sem contrapartida de débito
        historico: 'Lançamento órfão corrompido',
      })
    );

    const check = await healthCheck.verificarIntegridadeContabil();
    assert.equal(check.status, 'DOWN');
    assert.equal(check.metadata?.residuoCentavos, 9999);
    assert.ok(check.mensagem.includes('CRÍTICO: Assimetria contábil detectada'));

    const diagnostico = await healthCheck.executarDiagnosticoCompleto();
    assert.equal(diagnostico.status, 'DOWN');
  });

  it('deve alertar DEGRADED na fila de mensageria quando houver mensagens em Dead Letter Queue (DLQ)', async () => {
    // Insere mensagem em DLQ
    await outboxRepo.salvar(
      new OutboxMessage({
        aggregateType: 'TransacaoDeTransferencia',
        aggregateId: 'TX-DEAD-01',
        eventType: 'PIX_TRANSFERENCIA_LIQUIDADA',
        payload: '{}',
        status: 'DLQ',
        tentativas: 3,
        ultimoErro: 'Timeout persistente SPI Bacen',
      })
    );

    const check = await healthCheck.verificarFilaMensageria();
    assert.equal(check.status, 'DEGRADED');
    assert.equal(check.metadata?.dlqCount, 1);
    assert.ok(check.mensagem.includes('Dead Letter Queue'));

    const diagnostico = await healthCheck.executarDiagnosticoCompleto();
    assert.equal(diagnostico.status, 'DEGRADED');
  });

  it('deve alertar DEGRADED quando houver saturação de backlog no Outbox', async () => {
    // Insere 15 mensagens pendentes (limite configurado: 10)
    for (let i = 0; i < 15; i++) {
      await outboxRepo.salvar(
        new OutboxMessage({
          aggregateType: 'TransacaoDeTransferencia',
          aggregateId: `TX-PEND-${i}`,
          eventType: 'PIX_TRANSFERENCIA_LIQUIDADA',
          payload: '{}',
          status: 'PENDENTE',
        })
      );
    }

    const check = await healthCheck.verificarFilaMensageria();
    assert.equal(check.status, 'DEGRADED');
    assert.ok(check.metadata?.pendentesCount >= 15);
    assert.ok(check.mensagem.includes('Backlog de mensageria elevado'));
  });

  it('deve consolidar o snapshot do Core Banking Cockpit com saldo custodiado de clientes e SLA SPI', async () => {
    // 1. Processa transferência
    const pix = await processarPixUseCase.execute({
      idempotencyKey: 'IDEMP-COCKPIT-01',
      contaOrigemId: contaAlice.id,
      chavePixDestino: chavePixBob.valor,
      valorCentavos: 150000, // R$ 1.500,00
    });

    // 2. Estorna parcialmente
    await estornarPixUseCase.execute({
      transacaoId: pix.transacaoId,
      motivoEstorno: 'Devolução parcial solicitada pelo correntista',
    });

    const snapshot = await cockpitEngine.obterSnapshot();

    // Auditoria contábil
    assert.equal(snapshot.resumoContabil.residuoContabilGlobalCentavos, 0);
    assert.equal(snapshot.resumoContabil.statusAuditoria, 'EQUILIBRADO_SOMA_ZERO');
    assert.equal(snapshot.resumoContabil.totalSaldoPassivoCentavos, 500000); // R$ 5.000,00 de saldo total de clientes
    assert.equal(snapshot.resumoContabil.totalContasAtivas, 3);

    // Métricas operacionais
    assert.equal(snapshot.metricasOperacionais.quantidadeLiquidadas, 1);
    assert.equal(snapshot.metricasOperacionais.quantidadeEstornadas, 1);
    assert.equal(snapshot.metricasOperacionais.volumeTotalLiquidadoCentavos, 150000);
    assert.equal(snapshot.metricasOperacionais.volumeTotalEstornadoCentavos, 150000);
    assert.equal(snapshot.metricasOperacionais.taxaEstornoPercentual, 50.0);
    assert.equal(snapshot.metricasOperacionais.slaSpiCompliance, true);

    // Status da Infraestrutura
    assert.equal(snapshot.statusInfraestrutura.liveness, 'UP');
    assert.equal(snapshot.statusInfraestrutura.readiness, 'UP');
    assert.equal(snapshot.statusInfraestrutura.mensagensOutboxDLQ, 0);
  });
});
