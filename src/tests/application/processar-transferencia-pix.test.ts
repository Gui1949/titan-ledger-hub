// src/tests/application/processar-transferencia-pix.test.ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { ContaContabil } from '../../domain/entities/ContaContabil.js';
import { LancamentoContabil } from '../../domain/entities/LancamentoContabil.js';
import { ChavePix } from '../../domain/value-objects/ChavePix.js';
import { ValorMonetario } from '../../domain/value-objects/ValorMonetario.js';
import { SaldoInsuficienteError } from '../../domain/errors/domain-errors.js';

import { ProcessarTransferenciaPixUseCase } from '../../application/use-cases/processar-transferencia-pix/ProcessarTransferenciaPixUseCase.js';
import { EstornarTransferenciaPixUseCase } from '../../application/use-cases/estornar-transferencia-pix/EstornarTransferenciaPixUseCase.js';
import { ChavePixDestinoNaoEncontradaError } from '../../application/errors/application-errors.js';

import { InMemoryContaContabilRepository } from '../../infrastructure/persistence/in-memory/InMemoryContaContabilRepository.js';
import { InMemoryLancamentoContabilRepository } from '../../infrastructure/persistence/in-memory/InMemoryLancamentoContabilRepository.js';
import { InMemoryTransacaoRepository } from '../../infrastructure/persistence/in-memory/InMemoryTransacaoRepository.js';
import { InMemoryUnitOfWork } from '../../infrastructure/persistence/in-memory/InMemoryUnitOfWork.js';
import { AsyncMutexLockManager } from '../../infrastructure/concurrency/AsyncMutexLockManager.js';
import { LedgerBalanceService } from '../../domain/services/LedgerBalanceService.js';

describe('🏛️ TitanLedger & Clearing Hub — Suíte de Aplicação & Persistência ACID (Fase 2)', () => {
  let contaRepo: InMemoryContaContabilRepository;
  let lancamentoRepo: InMemoryLancamentoContabilRepository;
  let transacaoRepo: InMemoryTransacaoRepository;
  let unitOfWork: InMemoryUnitOfWork;
  let lockManager: AsyncMutexLockManager;
  let ledgerBalanceService: LedgerBalanceService;
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
    unitOfWork = new InMemoryUnitOfWork(contaRepo, lancamentoRepo, transacaoRepo);
    lockManager = new AsyncMutexLockManager();
    ledgerBalanceService = new LedgerBalanceService();

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

    chavePixAlice = ChavePix.criar('12345678909'); // CPF válido
    chavePixBob = ChavePix.criar('contato@bobtech.com.br'); // Email válido

    contaAlice = new ContaContabil({
      id: 'CONTA-ALICE-01',
      titular: 'Alice Silva Santos',
      natureza: 'PASSIVO',
      chavePix: chavePixAlice,
      limiteChequeEspecialCentavos: 0,
    });

    contaBob = new ContaContabil({
      id: 'CONTA-BOB-02',
      titular: 'Bob Engenharia Ltda',
      natureza: 'PASSIVO',
      chavePix: chavePixBob,
      limiteChequeEspecialCentavos: 0,
    });

    await contaRepo.salvar(contaAlice);
    await contaRepo.salvar(contaBob);

    // Aporte inicial de R$ 1.000,00 (100.000 centavos) na conta da Alice
    await lancamentoRepo.adicionar(
      new LancamentoContabil({
        transacaoId: 'TX-APORTE-INICIAL',
        contaId: contaAlice.id,
        tipo: 'CREDITO',
        valor: ValorMonetario.fromCentavos(100000),
        historico: 'Aporte Inicial de Capital',
      })
    );
  });

  it('deve processar transferência Pix com sucesso, persistindo partidas dobradas e atualizando saldos', async () => {
    const input = {
      idempotencyKey: 'IDEMP-PIX-001',
      contaOrigemId: contaAlice.id,
      chavePixDestino: chavePixBob.valor,
      valorCentavos: 25000, // R$ 250,00
      descricao: 'Pagamento de Consultoria',
    };

    const resultado = await processarPixUseCase.execute(input);

    assert.equal(resultado.status, 'LIQUIDADA');
    assert.equal(resultado.valorCentavos, 25000);
    assert.equal(resultado.saldoRemanescenteOrigemCentavos, 75000); // 1.000 - 250 = 750
    assert.equal(resultado.saldoAtualDestinoCentavos, 25000);
    assert.equal(resultado.reutilizouIdempotencia, false);

    // Verifica integridade dos lançamentos no ledger imutável
    const totalLancamentos = await lancamentoRepo.contarTotal();
    assert.equal(totalLancamentos, 3); // 1 aporte inicial + 2 lançamentos da tx

    const lancamentosTx = await lancamentoRepo.buscarPorTransacaoId(resultado.transacaoId);
    assert.equal(lancamentosTx.length, 2);

    const debito = lancamentosTx.find((l) => l.tipo === 'DEBITO')!;
    const credito = lancamentosTx.find((l) => l.tipo === 'CREDITO')!;
    assert.equal(debito.contaId, contaAlice.id);
    assert.equal(debito.valor.centavos, 25000);
    assert.equal(credito.contaId, contaBob.id);
    assert.equal(credito.valor.centavos, 25000);
  });

  it('deve respeitar idempotência estrita retornando a mesma transação sem duplicar lançamentos contábeis no replay', async () => {
    const input = {
      idempotencyKey: 'IDEMP-REPLAY-999',
      contaOrigemId: contaAlice.id,
      chavePixDestino: chavePixBob.valor,
      valorCentavos: 10000, // R$ 100,00
    };

    const primeira = await processarPixUseCase.execute(input);
    assert.equal(primeira.reutilizouIdempotencia, false);

    const segunda = await processarPixUseCase.execute(input);
    assert.equal(segunda.reutilizouIdempotencia, true);
    assert.equal(segunda.transacaoId, primeira.transacaoId);
    assert.equal(segunda.saldoRemanescenteOrigemCentavos, 90000);
    assert.equal(segunda.saldoAtualDestinoCentavos, 10000);

    // Total de lançamentos deve ser exatamente 3 (1 aporte + 2 da única transação)
    const totalLancamentos = await lancamentoRepo.contarTotal();
    assert.equal(totalLancamentos, 3);
  });

  it('deve executar rollback atômico e não registrar nenhum lançamento contábil em caso de saldo insuficiente', async () => {
    const totalLancamentosAntes = await lancamentoRepo.contarTotal();

    const input = {
      idempotencyKey: 'IDEMP-FALHA-SALDO',
      contaOrigemId: contaAlice.id,
      chavePixDestino: chavePixBob.valor,
      valorCentavos: 500000, // R$ 5.000,00 (Alice só tem R$ 1.000,00 e limite 0)
    };

    await assert.rejects(
      async () => await processarPixUseCase.execute(input),
      (err: any) => err instanceof SaldoInsuficienteError
    );

    // Rollback atômico: nenhum lançamento foi adicionado ao ledger
    const totalLancamentosDepois = await lancamentoRepo.contarTotal();
    assert.equal(totalLancamentosDepois, totalLancamentosAntes);

    // Saldo permanece 100.000 centavos intacto
    const lancamentosAlice = await lancamentoRepo.buscarPorContaId(contaAlice.id);
    const saldoAlice = ledgerBalanceService.calcularSaldo(contaAlice, lancamentosAlice);
    assert.equal(saldoAlice, 100000);
  });

  it('deve impedir double-spending em concorrência severa serializando débitos via mutex locks', async () => {
    // Alice tem 100.000 centavos (R$ 1.000).
    // Disparamos 5 requisições concorrentes de R$ 300,00 (30.000c cada).
    // 3 x 300 = 900 <= 1000. A 4ª e 5ª devem ser rejeitadas por SaldoInsuficiente.
    const promises = Array.from({ length: 5 }, (_, i) => {
      return processarPixUseCase.execute({
        idempotencyKey: `IDEMP-CONC-${i}`,
        contaOrigemId: contaAlice.id,
        chavePixDestino: chavePixBob.valor,
        valorCentavos: 30000,
      });
    });

    const resultados = await Promise.allSettled(promises);
    const sucesso = resultados.filter((r) => r.status === 'fulfilled');
    const falhas = resultados.filter((r) => r.status === 'rejected');

    assert.equal(sucesso.length, 3);
    assert.equal(falhas.length, 2);

    // Saldo final deve ser exatamente 10.000 centavos (R$ 100,00)
    const lancamentosAlice = await lancamentoRepo.buscarPorContaId(contaAlice.id);
    const saldoFinalAlice = ledgerBalanceService.calcularSaldo(contaAlice, lancamentosAlice);
    assert.equal(saldoFinalAlice, 10000);

    // Bob deve ter recebido exatamente 90.000 centavos (R$ 900,00)
    const lancamentosBob = await lancamentoRepo.buscarPorContaId(contaBob.id);
    const saldoFinalBob = ledgerBalanceService.calcularSaldo(contaBob, lancamentosBob);
    assert.equal(saldoFinalBob, 90000);
  });

  it('deve evitar deadlocks em transferências cruzadas simultâneas (A -> B e B -> A) via ordenação de locks', async () => {
    // Dá saldo para o Bob também
    await lancamentoRepo.adicionar(
      new LancamentoContabil({
        transacaoId: 'TX-APORTE-BOB',
        contaId: contaBob.id,
        tipo: 'CREDITO',
        valor: ValorMonetario.fromCentavos(50000), // R$ 500,00
        historico: 'Aporte Bob',
      })
    );

    // Cruzadas: Alice envia R$ 50 para Bob, e Bob envia R$ 50 para Alice ao mesmo tempo
    const tx1 = processarPixUseCase.execute({
      idempotencyKey: 'CROSS-1',
      contaOrigemId: contaAlice.id,
      chavePixDestino: chavePixBob.valor,
      valorCentavos: 5000,
    });

    const tx2 = processarPixUseCase.execute({
      idempotencyKey: 'CROSS-2',
      contaOrigemId: contaBob.id,
      chavePixDestino: chavePixAlice.valor,
      valorCentavos: 5000,
    });

    const [res1, res2] = await Promise.all([tx1, tx2]);

    assert.equal(res1.status, 'LIQUIDADA');
    assert.equal(res2.status, 'LIQUIDADA');

    // Saldos finais líquidos devem permanecer equivalentes aos iniciais
    const lancamentosAlice = await lancamentoRepo.buscarPorContaId(contaAlice.id);
    const saldoAlice = ledgerBalanceService.calcularSaldo(contaAlice, lancamentosAlice);
    assert.equal(saldoAlice, 100000); // 1000 - 50 + 50 = 1000

    const lancamentosBob = await lancamentoRepo.buscarPorContaId(contaBob.id);
    const saldoBob = ledgerBalanceService.calcularSaldo(contaBob, lancamentosBob);
    assert.equal(saldoBob, 50000); // 500 + 50 - 50 = 500
  });

  it('deve rejeitar transferência se a chave Pix de destino não existir', async () => {
    await assert.rejects(
      async () =>
        await processarPixUseCase.execute({
          idempotencyKey: 'IDEMP-CHAVE-INEXISTENTE',
          contaOrigemId: contaAlice.id,
          chavePixDestino: 'chaveinexistente@pix.com.br',
          valorCentavos: 1000,
        }),
      (err: any) => err instanceof ChavePixDestinoNaoEncontradaError
    );
  });

  it('deve estornar transferência Pix liquidada gerando contrapartidas de partidas dobradas e restaurando saldos', async () => {
    // 1. Executa transferência
    const pix = await processarPixUseCase.execute({
      idempotencyKey: 'TX-PARA-ESTORNO-01',
      contaOrigemId: contaAlice.id,
      chavePixDestino: chavePixBob.valor,
      valorCentavos: 40000, // R$ 400,00
    });

    assert.equal(pix.status, 'LIQUIDADA');
    assert.equal(pix.saldoRemanescenteOrigemCentavos, 60000);
    assert.equal(pix.saldoAtualDestinoCentavos, 40000);

    // 2. Executa estorno
    const estorno = await estornarPixUseCase.execute({
      transacaoId: pix.transacaoId,
      motivoEstorno: 'Devolução amigável solicitada pelo recebedor',
    });

    assert.equal(estorno.statusOriginal, 'ESTORNADA');
    assert.equal(estorno.statusEstorno, 'LIQUIDADA');
    assert.equal(estorno.valorEstornadoCentavos, 40000);
    assert.equal(estorno.saldoRestauradoOrigemCentavos, 100000); // Alice de volta aos R$ 1.000,00
    assert.equal(estorno.saldoRestauradoDestinoCentavos, 0); // Bob de volta a R$ 0,00

    // Verifica que o ledger mantém todos os lançamentos imutáveis (Append-Only)
    // 1 aporte + 2 lançamentos do pix + 2 lançamentos do estorno = 5 lançamentos
    const totalLancamentos = await lancamentoRepo.contarTotal();
    assert.equal(totalLancamentos, 5);
  });
});
