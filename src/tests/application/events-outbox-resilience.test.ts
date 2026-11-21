// src/tests/application/events-outbox-resilience.test.ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { ContaContabil } from '../../domain/entities/ContaContabil.js';
import { LancamentoContabil } from '../../domain/entities/LancamentoContabil.js';
import { ChavePix } from '../../domain/value-objects/ChavePix.js';
import { ValorMonetario } from '../../domain/value-objects/ValorMonetario.js';
import { SaldoInsuficienteError } from '../../domain/errors/domain-errors.js';

import { ProcessarTransferenciaPixUseCase } from '../../application/use-cases/processar-transferencia-pix/ProcessarTransferenciaPixUseCase.js';
import { EstornarTransferenciaPixUseCase } from '../../application/use-cases/estornar-transferencia-pix/EstornarTransferenciaPixUseCase.js';
import { OutboxRelayService } from '../../application/services/OutboxRelayService.js';
import { IWebhookTransport, WebhookDeliveryResult } from '../../application/ports/messaging/IWebhookTransport.js';

import { InMemoryContaContabilRepository } from '../../infrastructure/persistence/in-memory/InMemoryContaContabilRepository.js';
import { InMemoryLancamentoContabilRepository } from '../../infrastructure/persistence/in-memory/InMemoryLancamentoContabilRepository.js';
import { InMemoryTransacaoRepository } from '../../infrastructure/persistence/in-memory/InMemoryTransacaoRepository.js';
import { InMemoryOutboxRepository } from '../../infrastructure/persistence/in-memory/InMemoryOutboxRepository.js';
import { InMemoryUnitOfWork } from '../../infrastructure/persistence/in-memory/InMemoryUnitOfWork.js';
import { AsyncMutexLockManager } from '../../infrastructure/concurrency/AsyncMutexLockManager.js';
import { WebhookSignatureValidator } from '../../infrastructure/messaging/WebhookSignatureValidator.js';

class MockWebhookTransport implements IWebhookTransport {
  public failCount = 0;
  public totalCalls = 0;
  public lastHeaders: Record<string, string> = {};
  public lastPayload: string = '';

  constructor(private readonly failsBeforeSuccess: number = 0) {}

  public async enviar(
    _url: string,
    payload: string,
    secret: string,
    headers?: Record<string, string>
  ): Promise<WebhookDeliveryResult> {
    this.totalCalls++;
    this.lastPayload = payload;
    this.lastHeaders = headers ?? {};

    // Gera assinatura HMAC
    const signature = WebhookSignatureValidator.sign(payload, secret);
    this.lastHeaders['X-Signature'] = signature;

    if (this.failCount < this.failsBeforeSuccess) {
      this.failCount++;
      return {
        sucesso: false,
        statusCode: 503,
        erro: 'Service Unavailable (SPI timeout simulado)',
        duracaoMs: 15,
      };
    }

    return {
      sucesso: true,
      statusCode: 200,
      duracaoMs: 10,
    };
  }
}

describe('🏛️ TitanLedger & Clearing Hub — Suíte de Mensageria, Outbox & Resiliência (Fase 3)', () => {
  let contaRepo: InMemoryContaContabilRepository;
  let lancamentoRepo: InMemoryLancamentoContabilRepository;
  let transacaoRepo: InMemoryTransacaoRepository;
  let outboxRepo: InMemoryOutboxRepository;
  let unitOfWork: InMemoryUnitOfWork;
  let lockManager: AsyncMutexLockManager;
  let processarPixUseCase: ProcessarTransferenciaPixUseCase;
  let estornarPixUseCase: EstornarTransferenciaPixUseCase;

  let contaAlice: ContaContabil;
  let contaBob: ContaContabil;
  let chavePixAlice: ChavePix;
  let chavePixBob: ChavePix;

  beforeEach(async () => {
    contaRepo = new InMemoryContaContabilRepository();
    lancamentoRepo = new InMemoryLancamentoContabilRepository();
    transacaoRepo = new InMemoryTransacaoRepository();
    outboxRepo = new InMemoryOutboxRepository();
    unitOfWork = new InMemoryUnitOfWork(contaRepo, lancamentoRepo, transacaoRepo, outboxRepo);
    lockManager = new AsyncMutexLockManager();

    processarPixUseCase = new ProcessarTransferenciaPixUseCase(
      unitOfWork,
      lockManager,
      contaRepo,
      transacaoRepo,
      lancamentoRepo
    );

    estornarPixUseCase = new EstornarTransferenciaPixUseCase(
      unitOfWork,
      lockManager,
      contaRepo,
      transacaoRepo,
      lancamentoRepo
    );

    chavePixAlice = ChavePix.criar('12345678909');
    chavePixBob = ChavePix.criar('contato@bobtech.com.br');

    contaAlice = new ContaContabil({
      id: 'CONTA-ALICE-MESSAGING',
      titular: 'Alice Silva Santos',
      natureza: 'PASSIVO',
      chavePix: chavePixAlice,
      limiteChequeEspecialCentavos: 0,
    });

    contaBob = new ContaContabil({
      id: 'CONTA-BOB-MESSAGING',
      titular: 'Bob Engenharia Ltda',
      natureza: 'PASSIVO',
      chavePix: chavePixBob,
      limiteChequeEspecialCentavos: 0,
    });

    await contaRepo.salvar(contaAlice);
    await contaRepo.salvar(contaBob);

    // Saldo inicial de R$ 2.000,00 (200.000c) na conta Alice
    await lancamentoRepo.adicionar(
      new LancamentoContabil({
        transacaoId: 'TX-APORTE-001',
        contaId: contaAlice.id,
        tipo: 'CREDITO',
        valor: ValorMonetario.fromCentavos(200000),
        historico: 'Aporte Inicial',
      })
    );
  });

  it('deve gravar mensagem ISO 20022 pacs.008 atomicamente no Outbox junto com a liquidação Pix', async () => {
    const input = {
      idempotencyKey: 'IDEMP-OUTBOX-01',
      contaOrigemId: contaAlice.id,
      chavePixDestino: chavePixBob.valor,
      valorCentavos: 35000, // R$ 350,00
      descricao: 'Liquidação de Fatura Pix',
    };

    const res = await processarPixUseCase.execute(input);
    assert.equal(res.status, 'LIQUIDADA');

    // Verifica que o Outbox gravou exatamente 1 mensagem
    const totalOutbox = await outboxRepo.contarTotal();
    assert.equal(totalOutbox, 1);

    const pendentes = await outboxRepo.buscarPorStatus('PENDENTE');
    assert.equal(pendentes.length, 1);

    const msg = pendentes[0];
    assert.equal(msg.eventType, 'PIX_TRANSFERENCIA_LIQUIDADA');
    assert.equal(msg.aggregateId, res.transacaoId);

    // Valida a estrutura ISO 20022 pacs.008
    const payload = JSON.parse(msg.payload);
    assert.equal(payload.isoStandard, 'pacs.008.001.08');
    assert.equal(payload.valorCentavos, 35000);
    assert.equal(payload.debitoContaId, contaAlice.id);
    assert.equal(payload.creditoContaId, contaBob.id);
    assert.equal(payload.chavePixDestino, chavePixBob.valor);
  });

  it('deve executar rollback completo do Outbox caso a transação contábil falhe (Dual-Write Prevention)', async () => {
    const totalOutboxAntes = await outboxRepo.contarTotal();

    const input = {
      idempotencyKey: 'IDEMP-FAIL-OUTBOX',
      contaOrigemId: contaAlice.id,
      chavePixDestino: chavePixBob.valor,
      valorCentavos: 900000, // R$ 9.000,00 (Alice só tem R$ 2.000)
    };

    await assert.rejects(
      async () => await processarPixUseCase.execute(input),
      (err: any) => err instanceof SaldoInsuficienteError
    );

    // Rollback atômico: NENHUMA mensagem gravada no outbox
    const totalOutboxDepois = await outboxRepo.contarTotal();
    assert.equal(totalOutboxDepois, totalOutboxAntes);
  });

  it('deve gravar mensagem ISO 20022 pacs.004 no Outbox durante estorno contábil auditável', async () => {
    const pix = await processarPixUseCase.execute({
      idempotencyKey: 'IDEMP-ESTORNO-MSG',
      contaOrigemId: contaAlice.id,
      chavePixDestino: chavePixBob.valor,
      valorCentavos: 50000, // R$ 500,00
    });

    const estorno = await estornarPixUseCase.execute({
      transacaoId: pix.transacaoId,
      motivoEstorno: 'Devolução Pix Bacen MED',
    });

    assert.equal(estorno.statusOriginal, 'ESTORNADA');

    // Outbox deve ter 2 mensagens: 1 pacs.008 (transferência) + 1 pacs.004 (estorno)
    const totalOutbox = await outboxRepo.contarTotal();
    assert.equal(totalOutbox, 2);

    const todas = await outboxRepo.buscarPorStatus('PENDENTE');
    const msgEstorno = todas.find((m) => m.eventType === 'PIX_ESTORNO_REALIZADO');
    assert.ok(msgEstorno);

    const payloadEstorno = JSON.parse(msgEstorno.payload);
    assert.equal(payloadEstorno.isoStandard, 'pacs.004.001.09');
    assert.equal(payloadEstorno.transacaoOriginalId, pix.transacaoId);
    assert.equal(payloadEstorno.valorEstornadoCentavos, 50000);
    assert.equal(payloadEstorno.motivoEstorno, 'Devolução Pix Bacen MED');
  });

  it('deve despachar mensagens pendentes via OutboxRelayService e atualizar status para ENVIADO', async () => {
    await processarPixUseCase.execute({
      idempotencyKey: 'IDEMP-RELAY-01',
      contaOrigemId: contaAlice.id,
      chavePixDestino: chavePixBob.valor,
      valorCentavos: 15000,
    });

    const mockTransport = new MockWebhookTransport(0); // 0 falhas, 100% sucesso
    const relay = new OutboxRelayService(outboxRepo, mockTransport, {
      webhookUrl: 'https://spi.bacen.gov.br/api/v1/clearing',
      webhookSecret: 'secret-bacen-spi-2026',
    });

    const stats = await relay.processarPendentes();

    assert.equal(stats.processadas, 1);
    assert.equal(stats.enviadas, 1);
    assert.equal(stats.falhas, 0);

    const enviados = await outboxRepo.buscarPorStatus('ENVIADO');
    assert.equal(enviados.length, 1);
    assert.ok(enviados[0].enviadoEm);
    assert.equal(enviados[0].tentativas, 0);
  });

  it('deve assinar webhook com HMAC-SHA256 e validar autenticidade com timingSafeEqual', () => {
    const payload = JSON.stringify({ msgId: 'MSG-001', valorCentavos: 15000 });
    const secret = 'chave-criptografica-super-secreta';

    const signature = WebhookSignatureValidator.sign(payload, secret);
    assert.ok(signature.startsWith('sha256='));

    // Validação correta
    const valida = WebhookSignatureValidator.verify(payload, secret, signature);
    assert.equal(valida, true);

    // Rejeição para payload adulterado
    const adulterado = JSON.stringify({ msgId: 'MSG-001', valorCentavos: 99999 });
    const validaAdulterado = WebhookSignatureValidator.verify(adulterado, secret, signature);
    assert.equal(validaAdulterado, false);

    // Rejeição para assinatura inválida
    const validaFalsa = WebhookSignatureValidator.verify(payload, secret, 'sha256=abcdef123456');
    assert.equal(validaFalsa, false);
  });

  it('deve aplicar retentativas com backoff exponencial quando o transporte falhar temporariamente', async () => {
    await processarPixUseCase.execute({
      idempotencyKey: 'IDEMP-RETRY-01',
      contaOrigemId: contaAlice.id,
      chavePixDestino: chavePixBob.valor,
      valorCentavos: 20000,
    });

    // Configura o mock para falhar 1 vez e suceder na 2ª tentativa
    const mockTransport = new MockWebhookTransport(1);
    const relay = new OutboxRelayService(outboxRepo, mockTransport, {
      webhookUrl: 'https://spi.bacen.gov.br/api/v1/clearing',
      webhookSecret: 'secret-bacen-spi-2026',
      backoffBaseMs: 50,
    });

    // 1ª rodada do relay: falha
    const stats1 = await relay.processarPendentes();
    assert.equal(stats1.processadas, 1);
    assert.equal(stats1.enviadas, 0);
    assert.equal(stats1.falhas, 1);

    const falhados = await outboxRepo.buscarPorStatus('FALHADO');
    assert.equal(falhados.length, 1);
    assert.equal(falhados[0].tentativas, 1);
    assert.ok(falhados[0].ultimoErro?.includes('Service Unavailable'));

    // 2ª rodada do relay (simulando avanço no tempo do backoff): sucesso!
    const tempoFuturo = new Date(Date.now() + 1000);
    const stats2 = await relay.processarPendentes(tempoFuturo);
    assert.equal(stats2.processadas, 1);
    assert.equal(stats2.enviadas, 1);
    assert.equal(stats2.falhas, 0);

    const enviados = await outboxRepo.buscarPorStatus('ENVIADO');
    assert.equal(enviados.length, 1);
  });

  it('deve encaminhar a mensagem para Dead Letter Queue (DLQ) ao exceder maxTentativas', async () => {
    await processarPixUseCase.execute({
      idempotencyKey: 'IDEMP-DLQ-01',
      contaOrigemId: contaAlice.id,
      chavePixDestino: chavePixBob.valor,
      valorCentavos: 12000,
    });

    // Mock falha sempre (99 vezes)
    const mockTransport = new MockWebhookTransport(99);
    const relay = new OutboxRelayService(outboxRepo, mockTransport, {
      webhookUrl: 'https://spi.bacen.gov.br/api/v1/clearing',
      webhookSecret: 'secret-bacen-spi-2026',
      backoffBaseMs: 10,
    });

    // Max tentativas padrão é 3. Disparamos 3 ciclos de processamento
    let agora = new Date();
    await relay.processarPendentes(agora); // tentativa 1 -> FALHADO

    agora = new Date(agora.getTime() + 100);
    await relay.processarPendentes(agora); // tentativa 2 -> FALHADO

    agora = new Date(agora.getTime() + 500);
    const stats3 = await relay.processarPendentes(agora); // tentativa 3 -> DLQ!

    assert.equal(stats3.enviadasParaDLQ, 1);

    const dlq = await outboxRepo.buscarPorStatus('DLQ');
    assert.equal(dlq.length, 1);
    assert.equal(dlq[0].tentativas, 3);
    assert.equal(dlq[0].status, 'DLQ');
  });
});
