// src/tests/application/hardening-chaos-bench.test.ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { ContaContabil } from '../../domain/entities/ContaContabil.js';
import { LancamentoContabil } from '../../domain/entities/LancamentoContabil.js';
import { ChavePix } from '../../domain/value-objects/ChavePix.js';
import { ValorMonetario } from '../../domain/value-objects/ValorMonetario.js';
import { MotorContabilDoubleEntry } from '../../domain/services/MotorContabilDoubleEntry.js';
import { LedgerBalanceService } from '../../domain/services/LedgerBalanceService.js';
import { TransacaoDeTransferencia } from '../../domain/entities/TransacaoDeTransferencia.js';
import { ProcessarTransferenciaPixUseCase } from '../../application/use-cases/processar-transferencia-pix/ProcessarTransferenciaPixUseCase.js';
import { EstornarTransferenciaPixUseCase } from '../../application/use-cases/estornar-transferencia-pix/EstornarTransferenciaPixUseCase.js';
import { HealthCheckService } from '../../application/services/HealthCheckService.js';
import { CoreBankingCockpitEngine } from '../../application/services/CoreBankingCockpitEngine.js';
import { OutboxRelayService } from '../../application/services/OutboxRelayService.js';
import { WebhookSignatureValidator } from '../../infrastructure/messaging/WebhookSignatureValidator.js';
import { IWebhookTransport } from '../../application/ports/messaging/IWebhookTransport.js';

import { InMemoryContaContabilRepository } from '../../infrastructure/persistence/in-memory/InMemoryContaContabilRepository.js';
import { InMemoryLancamentoContabilRepository } from '../../infrastructure/persistence/in-memory/InMemoryLancamentoContabilRepository.js';
import { InMemoryTransacaoRepository } from '../../infrastructure/persistence/in-memory/InMemoryTransacaoRepository.js';
import { InMemoryOutboxRepository } from '../../infrastructure/persistence/in-memory/InMemoryOutboxRepository.js';
import { InMemoryUnitOfWork } from '../../infrastructure/persistence/in-memory/InMemoryUnitOfWork.js';
import { AsyncMutexLockManager } from '../../infrastructure/concurrency/AsyncMutexLockManager.js';
import { TelemetryCollector } from '../../infrastructure/telemetry/TelemetryCollector.js';

describe('🏛️ TitanLedger & Clearing Hub — Suíte de Hardening, Chaos & Benchmark (Fase 5)', () => {
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
    healthCheck = new HealthCheckService(contaRepo, lancamentoRepo, outboxRepo);
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
      id: 'CONTA-ALICE-HARDENING',
      titular: 'Alice Silva Santos',
      natureza: 'PASSIVO',
      chavePix: chavePixAlice,
      limiteChequeEspecialCentavos: 0,
    });

    contaBob = new ContaContabil({
      id: 'CONTA-BOB-HARDENING',
      titular: 'Bob Engenharia Ltda',
      natureza: 'PASSIVO',
      chavePix: chavePixBob,
      limiteChequeEspecialCentavos: 0,
    });

    contaTesouraria = new ContaContabil({
      id: 'CONTA-TESOURARIA-HARDENING',
      titular: 'Reserva Bancária SPI Bacen',
      natureza: 'ATIVO',
      limiteChequeEspecialCentavos: 0,
    });

    await contaRepo.salvar(contaAlice);
    await contaRepo.salvar(contaBob);
    await contaRepo.salvar(contaTesouraria);

    // Aporte inicial de capital equilibrado (R$ 100.000,00 = 10.000.000 centavos)
    await lancamentoRepo.adicionarEmLote([
      new LancamentoContabil({
        transacaoId: 'TX-CAPITAL-HARDENING',
        contaId: contaTesouraria.id,
        tipo: 'DEBITO',
        valor: ValorMonetario.fromCentavos(10000000),
        historico: 'Aporte de Reserva Bancária SPI',
      }),
      new LancamentoContabil({
        transacaoId: 'TX-CAPITAL-HARDENING',
        contaId: contaAlice.id,
        tipo: 'CREDITO',
        valor: ValorMonetario.fromCentavos(10000000),
        historico: 'Aporte em Conta de Cliente',
      }),
    ]);
  });

  it('AC-F5-01: Throughput Benchmark Massivo (1.000 transferências de partidas dobradas com vazão e resíduo 0c)', async () => {
    const totalOperacoes = 1000;
    const motorContabil = new MotorContabilDoubleEntry();
    const t0 = performance.now();

    // Executa 1.000 operações de validação e balanceamento de partidas dobradas
    for (let i = 0; i < totalOperacoes; i++) {
      const tx = new TransacaoDeTransferencia({
        tipo: 'PIX_TRANSFERENCIA',
        chavePixOrigem: chavePixAlice,
        chavePixDestino: chavePixBob,
      });

      const valor = ValorMonetario.fromCentavos(1000 + (i % 500));
      tx.adicionarLancamento(
        new LancamentoContabil({
          transacaoId: tx.id,
          contaId: contaAlice.id,
          tipo: 'DEBITO',
          valor,
          historico: `Lançamento Débito #${i}`,
        })
      );
      tx.adicionarLancamento(
        new LancamentoContabil({
          transacaoId: tx.id,
          contaId: contaBob.id,
          tipo: 'CREDITO',
          valor,
          historico: `Lançamento Crédito #${i}`,
        })
      );

      motorContabil.validarEquilibrio(tx);
      tx.iniciarProcessamento();
      tx.liquidar();
    }

    const t1 = performance.now();
    const duracaoMs = t1 - t0;
    const opsPorSegundo = Math.floor((totalOperacoes / duracaoMs) * 1000);

    assert.ok(duracaoMs < 500, `Benchmark deve executar em < 500ms (executou em ${duracaoMs.toFixed(2)}ms)`);
    assert.ok(opsPorSegundo >= 5000, `Throughput deve ser >= 5.000 ops/s (atingiu ${opsPorSegundo} ops/s)`);
  });

  it('AC-F5-02: Chaos Engineering & Injeção de Falhas de I/O em Meio de Voo com Rollback Total do UoW (RN-14)', async () => {
    const totalLancamentosAntes = await lancamentoRepo.contarTotal();
    const totalOutboxAntes = await outboxRepo.contarTotal();

    // Simula falha catastrófica durante a persistência (ex: falha de disco/rede no outbox)
    class ChaosOutboxRepository extends InMemoryOutboxRepository {
      public override async salvar(): Promise<void> {
        throw new Error('CHAOS_INJECTION_IO_FAILURE: Falha forçada de conexão ao storage do outbox');
      }
    }

    const chaosOutboxRepo = new ChaosOutboxRepository();
    const chaosUow = new InMemoryUnitOfWork(contaRepo, lancamentoRepo, transacaoRepo, chaosOutboxRepo);
    const chaosUseCase = new ProcessarTransferenciaPixUseCase(
      chaosUow,
      lockManager,
      contaRepo,
      transacaoRepo,
      lancamentoRepo,
      telemetry
    );

    await assert.rejects(
      async () =>
        await chaosUseCase.execute({
          idempotencyKey: 'IDEMP-CHAOS-01',
          contaOrigemId: contaAlice.id,
          chavePixDestino: chavePixBob.valor,
          valorCentavos: 50000,
        }),
      /CHAOS_INJECTION_IO_FAILURE/
    );

    // Rollback atômico absoluto: nenhum lançamento contábil gravado
    const totalLancamentosDepois = await lancamentoRepo.contarTotal();
    const totalOutboxDepois = await outboxRepo.contarTotal();

    assert.equal(totalLancamentosDepois, totalLancamentosAntes);
    assert.equal(totalOutboxDepois, totalOutboxAntes);

    // Diagnóstico de saúde do ledger permanece intacto com resíduo zero
    const integridade = await healthCheck.verificarIntegridadeContabil();
    assert.equal(integridade.status, 'UP');
    assert.equal(integridade.metadata?.residuoCentavos, 0);
  });

  it('AC-F5-03: Tempestade de Concorrência Cruzada com Zero Deadlocks e Saldos Preservados (RN-15)', async () => {
    // Dá saldo para o Bob também com partidas dobradas equilibradas (Débito Tesouraria / Crédito Bob)
    await lancamentoRepo.adicionarEmLote([
      new LancamentoContabil({
        transacaoId: 'TX-APORTE-BOB-HARDENING',
        contaId: contaTesouraria.id,
        tipo: 'DEBITO',
        valor: ValorMonetario.fromCentavos(5000000), // R$ 50.000,00
        historico: 'Aporte Reserva para Bob',
      }),
      new LancamentoContabil({
        transacaoId: 'TX-APORTE-BOB-HARDENING',
        contaId: contaBob.id,
        tipo: 'CREDITO',
        valor: ValorMonetario.fromCentavos(5000000), // R$ 50.000,00
        historico: 'Aporte Bob',
      }),
    ]);

    // Dispara 30 transferências cruzadas simultâneas (Alice -> Bob e Bob -> Alice)
    const promises: Promise<any>[] = [];
    for (let i = 0; i < 30; i++) {
      if (i % 2 === 0) {
        promises.push(
          processarPixUseCase.execute({
            idempotencyKey: `STORM-A-TO-B-${i}`,
            contaOrigemId: contaAlice.id,
            chavePixDestino: chavePixBob.valor,
            valorCentavos: 10000, // R$ 100,00
          })
        );
      } else {
        promises.push(
          processarPixUseCase.execute({
            idempotencyKey: `STORM-B-TO-A-${i}`,
            contaOrigemId: contaBob.id,
            chavePixDestino: chavePixAlice.valor,
            valorCentavos: 10000, // R$ 100,00
          })
        );
      }
    }

    const resultados = await Promise.all(promises);
    assert.equal(resultados.length, 30);
    for (const r of resultados) {
      assert.equal(r.status, 'LIQUIDADA');
    }

    // Como foram 15 transferências de R$ 100 de A->B e 15 de B->A, os saldos finais líquidos são idênticos aos iniciais
    const ledgerBalance = new LedgerBalanceService();
    const lansAlice = await lancamentoRepo.buscarPorContaId(contaAlice.id);
    const saldoAlice = ledgerBalance.calcularSaldo(contaAlice, lansAlice);
    assert.equal(saldoAlice, 10000000);

    const lansBob = await lancamentoRepo.buscarPorContaId(contaBob.id);
    const saldoBob = ledgerBalance.calcularSaldo(contaBob, lansBob);
    assert.equal(saldoBob, 5000000);

    // Resíduo contábil global rigorosamente zero
    const integridade = await healthCheck.verificarIntegridadeContabil();
    assert.equal(integridade.status, 'UP');
    assert.equal(integridade.metadata?.residuoCentavos, 0);
  });

  it('AC-F5-04: Blindagem contra Adulteração Criptográfica Massiva e Replays Idempotentes (RN-16)', async () => {
    const secret = 'pix_master_production_secret_key_2026';
    const payloadValido = JSON.stringify({ msgId: 'MSG-001', endToEndId: 'E123456', valorCentavos: 100000 });
    const assinaturaValida = WebhookSignatureValidator.sign(payloadValido, secret);

    // 1. Testa 50 tentativas de falsificação de assinatura
    for (let i = 0; i < 50; i++) {
      const payloadFalso = JSON.stringify({ msgId: 'MSG-001', valorCentavos: 100000 + i + 1 });
      const valida = WebhookSignatureValidator.verify(payloadFalso, secret, assinaturaValida);
      assert.equal(valida, false);
    }

    // 2. Executa uma transação e testa 20 replays idempotentes consecutivos
    const tx = await processarPixUseCase.execute({
      idempotencyKey: 'IDEMP-HARDENING-REPLAY',
      contaOrigemId: contaAlice.id,
      chavePixDestino: chavePixBob.valor,
      valorCentavos: 75000,
    });

    for (let i = 0; i < 20; i++) {
      const replay = await processarPixUseCase.execute({
        idempotencyKey: 'IDEMP-HARDENING-REPLAY',
        contaOrigemId: contaAlice.id,
        chavePixDestino: chavePixBob.valor,
        valorCentavos: 75000,
      });
      assert.equal(replay.transacaoId, tx.transacaoId);
      assert.equal(replay.reutilizouIdempotencia, true);
    }

    // Telemetria deve computar exatamente 20 replays idempotentes
    const metricas = telemetry.obterMetricasContabeis();
    assert.equal(metricas.totalReplaysIdempotentes, 20);
  });

  it('AC-F5-05: Resiliência sob Caos de Mensageria com Roteamento para DLQ e Alerta DEGRADED', async () => {
    // Insere mensagem no outbox
    await processarPixUseCase.execute({
      idempotencyKey: 'IDEMP-MSG-CHAOS',
      contaOrigemId: contaAlice.id,
      chavePixDestino: chavePixBob.valor,
      valorCentavos: 30000,
    });

    // Transporte simulado que sempre falha com timeout
    const failTransport: IWebhookTransport = {
      enviar: async () => ({ sucesso: false, erro: 'SPI_GATEWAY_TIMEOUT', duracaoMs: 15 }),
    };

    const relay = new OutboxRelayService(outboxRepo, failTransport, {
      webhookUrl: 'https://spi.bacen.gov.br/api/v1/webhook',
      webhookSecret: 'secret',
      backoffBaseMs: 5,
    });

    let dataSimulada = new Date();
    await relay.processarPendentes(dataSimulada); // tentativa 1 -> FALHADO
    dataSimulada = new Date(dataSimulada.getTime() + 100);
    await relay.processarPendentes(dataSimulada); // tentativa 2 -> FALHADO
    dataSimulada = new Date(dataSimulada.getTime() + 500);
    const stats = await relay.processarPendentes(dataSimulada); // tentativa 3 -> DLQ

    assert.equal(stats.enviadasParaDLQ, 1);

    // HealthCheck deve sinalizar DEGRADED devido à presença de mensagem em DLQ
    const checkMensageria = await healthCheck.verificarFilaMensageria();
    assert.equal(checkMensageria.status, 'DEGRADED');
    assert.equal(checkMensageria.metadata?.dlqCount, 1);
  });

  it('AC-F5-06: Release Gate & Auditoria Final v1.4.0 (HealthCheck UP, Resíduo Zero Absoluto e SLA Compliance)', async () => {
    // Limpa estado para auditoria de homologação final
    const repoC = new InMemoryContaContabilRepository();
    const repoL = new InMemoryLancamentoContabilRepository();
    const repoT = new InMemoryTransacaoRepository();
    const repoO = new InMemoryOutboxRepository();
    const uowFinal = new InMemoryUnitOfWork(repoC, repoL, repoT, repoO);
    const lockFinal = new AsyncMutexLockManager();
    const telemFinal = new TelemetryCollector();
    const healthFinal = new HealthCheckService(repoC, repoL, repoO);
    const cockpitFinal = new CoreBankingCockpitEngine(repoC, repoL, repoO, telemFinal, healthFinal);

    const useCaseFinal = new ProcessarTransferenciaPixUseCase(uowFinal, lockFinal, repoC, repoT, repoL, telemFinal);

    const c1 = new ContaContabil({ id: 'ACC-01', titular: 'Empresa Alfa Ltda', natureza: 'PASSIVO', chavePix: chavePixAlice });
    const c2 = new ContaContabil({ id: 'ACC-02', titular: 'Empresa Beta S/A', natureza: 'PASSIVO', chavePix: chavePixBob });
    const cRes = new ContaContabil({ id: 'ACC-RES', titular: 'Reserva Bacen', natureza: 'ATIVO' });

    await repoC.salvar(c1);
    await repoC.salvar(c2);
    await repoC.salvar(cRes);

    await repoL.adicionarEmLote([
      new LancamentoContabil({ transacaoId: 'TX-0', contaId: cRes.id, tipo: 'DEBITO', valor: ValorMonetario.fromCentavos(1000000), historico: 'Aporte' }),
      new LancamentoContabil({ transacaoId: 'TX-0', contaId: c1.id, tipo: 'CREDITO', valor: ValorMonetario.fromCentavos(1000000), historico: 'Aporte' }),
    ]);

    // Executa 5 transferências
    for (let i = 0; i < 5; i++) {
      await useCaseFinal.execute({
        idempotencyKey: `FINAL-TX-${i}`,
        contaOrigemId: c1.id,
        chavePixDestino: chavePixBob.valor,
        valorCentavos: 50000,
      });
    }

    const diagnostico = await healthFinal.executarDiagnosticoCompleto();
    assert.equal(diagnostico.status, 'UP');
    assert.equal(diagnostico.components.liveness.status, 'UP');
    assert.equal(diagnostico.components.readiness.status, 'UP');
    assert.equal(diagnostico.components.integridadeContabil.status, 'UP');
    assert.equal(diagnostico.components.filaMensageria.status, 'UP');

    const snapshot = await cockpitFinal.obterSnapshot();
    assert.equal(snapshot.resumoContabil.residuoContabilGlobalCentavos, 0);
    assert.equal(snapshot.resumoContabil.statusAuditoria, 'EQUILIBRADO_SOMA_ZERO');
    assert.equal(snapshot.metricasOperacionais.slaSpiCompliance, true);
    assert.equal(snapshot.statusInfraestrutura.mensagensOutboxDLQ, 0);
  });
});
