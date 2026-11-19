// src/tests/titan-domain.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ChavePix,
  ValorMonetario,
  AgenciaConta,
  ContaContabil,
  LancamentoContabil,
  TransacaoDeTransferencia,
  MotorContabilDoubleEntry,
  LedgerBalanceService,
  ChavePixInvalidaError,
  ValorMonetarioInvalidoError,
  AgenciaContaInvalidaError,
  TransacaoDesbalanceadaError,
  SaldoInsuficienteError,
  ContaNaoOperacionalError,
  TransicaoEstadoInvalidaError,
} from '../index.js';

describe('🏛️ TitanLedger & Clearing Hub — Suíte de Domínio (Fase 1)', () => {
  const motorContabil = new MotorContabilDoubleEntry();
  const balanceService = new LedgerBalanceService();

  describe('AC-F1-01: Validação Estrita dos 4 Tipos de ChavePix (RN-03)', () => {
    it('deve instanciar com sucesso chaves válidas de CPF, CNPJ, EMAIL, TELEFONE e EVP', () => {
      // 1. CPF Válido
      const chaveCpf = ChavePix.criar('52998224725');
      assert.equal(chaveCpf.tipo, 'CPF');
      assert.equal(chaveCpf.valor, '52998224725');

      // 2. CNPJ Válido
      const chaveCnpj = ChavePix.criar('04252011000110');
      assert.equal(chaveCnpj.tipo, 'CNPJ');
      assert.equal(chaveCnpj.valor, '04252011000110');

      // 3. E-mail legítimo
      const chaveEmail = ChavePix.criar('pix.corporativo@titanledger.com.br');
      assert.equal(chaveEmail.tipo, 'EMAIL');
      assert.equal(chaveEmail.valor, 'pix.corporativo@titanledger.com.br');

      // 4. Telefone celular E.164 brasileiro (+55 + DDD + 9 + 8 dígitos)
      const chaveTel = ChavePix.criar('+5511999998888');
      assert.equal(chaveTel.tipo, 'TELEFONE');
      assert.equal(chaveTel.valor, '+5511999998888');

      // 5. EVP UUIDv4 canônico
      const evpValido = 'a5c9f561-e0e6-4d04-8b8b-87d2ef1b9f6d';
      const chaveEvp = ChavePix.criar(evpValido);
      assert.equal(chaveEvp.tipo, 'EVP');
      assert.equal(chaveEvp.valor, evpValido);

      // Verificação do equals
      const chaveCpfClone = ChavePix.criar('52998224725');
      assert.equal(chaveCpf.equals(chaveCpfClone), true);
    });

    it('deve rejeitar com ChavePixInvalidaError CPF com DV falso ou dígitos repetidos', () => {
      assert.throws(
        () => ChavePix.criar('52998224726'),
        (err: unknown) => err instanceof ChavePixInvalidaError
      );
      assert.throws(
        () => ChavePix.criar('11111111111'),
        (err: unknown) => err instanceof ChavePixInvalidaError
      );
    });

    it('deve rejeitar com ChavePixInvalidaError CNPJ com DV falso', () => {
      assert.throws(
        () => ChavePix.criar('04252011000111'),
        (err: unknown) => err instanceof ChavePixInvalidaError
      );
    });

    it('deve rejeitar com ChavePixInvalidaError telefone fora do padrão Bacen E.164', () => {
      // Sem +55
      assert.throws(
        () => ChavePix.criar('11999998888', 'TELEFONE'),
        (err: unknown) => err instanceof ChavePixInvalidaError
      );
      // Sem o nono dígito (número fixo não é aceito no Pix móvel)
      assert.throws(
        () => ChavePix.criar('+551133334444', 'TELEFONE'),
        (err: unknown) => err instanceof ChavePixInvalidaError
      );
    });

    it('deve rejeitar com ChavePixInvalidaError e-mail mal formatado e chave aleatória inválida', () => {
      assert.throws(
        () => ChavePix.criar('usuario@semdominio', 'EMAIL'),
        (err: unknown) => err instanceof ChavePixInvalidaError
      );
      assert.throws(
        () => ChavePix.criar('chave-aleatoria-invalida', 'EVP'),
        (err: unknown) => err instanceof ChavePixInvalidaError
      );
      assert.throws(
        () => ChavePix.criar('   '),
        (err: unknown) => err instanceof ChavePixInvalidaError
      );
    });
  });

  describe('AC-F1-02: Motor de Partidas Dobradas com Soma Zero (RN-01)', () => {
    it('deve aprovar transação com partidas dobradas rigorosamente equilibradas (Débito = Crédito)', () => {
      const transacao = new TransacaoDeTransferencia({
        tipo: 'PIX_TRANSFERENCIA',
      });

      transacao.adicionarLancamento(
        new LancamentoContabil({
          transacaoId: transacao.id,
          contaId: 'CONTA-DEB-01',
          tipo: 'DEBITO',
          valor: ValorMonetario.fromCentavos(50000), // R$ 500,00
          historico: 'Pix enviado para fornecedor',
        })
      );

      transacao.adicionarLancamento(
        new LancamentoContabil({
          transacaoId: transacao.id,
          contaId: 'CONTA-CRED-01',
          tipo: 'CREDITO',
          valor: ValorMonetario.fromCentavos(50000), // R$ 500,00
          historico: 'Pix recebido de cliente',
        })
      );

      // Deve validar sem lançar erro
      assert.doesNotThrow(() => motorContabil.validarEquilibrio(transacao));
    });

    it('deve rejeitar com TransacaoDesbalanceadaError quando houver divergência de 1 centavo', () => {
      const transacao = new TransacaoDeTransferencia({
        tipo: 'PIX_TRANSFERENCIA',
      });

      transacao.adicionarLancamento(
        new LancamentoContabil({
          transacaoId: transacao.id,
          contaId: 'CONTA-DEB-01',
          tipo: 'DEBITO',
          valor: ValorMonetario.fromCentavos(50000), // 50.000 centavos
          historico: 'Débito pagador',
        })
      );

      transacao.adicionarLancamento(
        new LancamentoContabil({
          transacaoId: transacao.id,
          contaId: 'CONTA-CRED-01',
          tipo: 'CREDITO',
          valor: ValorMonetario.fromCentavos(49999), // 49.999 centavos (assimetria de 1c)
          historico: 'Crédito favorecido',
        })
      );

      assert.throws(
        () => motorContabil.validarEquilibrio(transacao),
        (err: unknown) => {
          assert(err instanceof TransacaoDesbalanceadaError);
          assert.equal(err.totalDebitos, 50000);
          assert.equal(err.totalCreditos, 49999);
          assert.match(err.message, /Divergência nas partidas dobradas/);
          return true;
        }
      );
    });

    it('deve rejeitar transação com menos de 2 lançamentos ou sem débitos/créditos simultâneos', () => {
      const txVazia = new TransacaoDeTransferencia({ tipo: 'PIX_TRANSFERENCIA' });
      assert.throws(
        () => motorContabil.validarEquilibrio(txVazia),
        (err: unknown) => err instanceof TransacaoDesbalanceadaError
      );

      const txSoDebito = new TransacaoDeTransferencia({ tipo: 'PIX_TRANSFERENCIA' });
      txSoDebito.adicionarLancamento(
        new LancamentoContabil({
          transacaoId: txSoDebito.id,
          contaId: 'C1',
          tipo: 'DEBITO',
          valor: ValorMonetario.fromCentavos(1000),
          historico: 'Debito 1',
        })
      );
      txSoDebito.adicionarLancamento(
        new LancamentoContabil({
          transacaoId: txSoDebito.id,
          contaId: 'C2',
          tipo: 'DEBITO',
          valor: ValorMonetario.fromCentavos(1000),
          historico: 'Debito 2',
        })
      );

      assert.throws(
        () => motorContabil.validarEquilibrio(txSoDebito),
        (err: unknown) => {
          assert(err instanceof TransacaoDesbalanceadaError);
          assert.match(err.message, /simultaneamente lançamentos de DÉBITO e CRÉDITO/);
          return true;
        }
      );
    });
  });

  describe('AC-F1-03: Imutabilidade Contábil e Cálculo de Saldo (RN-02)', () => {
    it('deve calcular o saldo exato de R$ 950,00 (95.000 centavos) para conta de PASSIVO', () => {
      const contaCliente = new ContaContabil({
        id: 'CONTA-CLI-01',
        titular: 'Empresa Alpha Ltda',
        natureza: 'PASSIVO',
      });

      // 1. Depósito de R$ 1.000,00 (Crédito na conta do cliente)
      const lancamento1 = new LancamentoContabil({
        transacaoId: 'TX-DEP-01',
        contaId: contaCliente.id,
        tipo: 'CREDITO',
        valor: ValorMonetario.fromReais(1000), // 100.000 cents
        historico: 'Depósito inicial em conta',
      });

      // 2. Saque de R$ 200,00 (Débito na conta do cliente)
      const lancamento2 = new LancamentoContabil({
        transacaoId: 'TX-SAQ-01',
        contaId: contaCliente.id,
        tipo: 'DEBITO',
        valor: ValorMonetario.fromReais(200), // 20.000 cents
        historico: 'Saque caixa eletrônico',
      });

      // 3. Pix recebido de R$ 150,00 (Crédito na conta do cliente)
      const lancamento3 = new LancamentoContabil({
        transacaoId: 'TX-PIX-01',
        contaId: contaCliente.id,
        tipo: 'CREDITO',
        valor: ValorMonetario.fromReais(150), // 15.000 cents
        historico: 'Recebimento Pix QR Code',
      });

      const lancamentos = [lancamento1, lancamento2, lancamento3];

      // Cálculo: +100.000 - 20.000 + 15.000 = 95.000 centavos (R$ 950,00)
      const saldoFinalCentavos = balanceService.calcularSaldo(contaCliente, lancamentos);
      assert.equal(saldoFinalCentavos, 95000);
      assert.equal(ValorMonetario.fromCentavos(saldoFinalCentavos).reais, 950.0);
    });

    it('deve calcular corretamente o saldo de conta de ATIVO (Débito aumenta, Crédito reduz)', () => {
      const contaReservaBacen = new ContaContabil({
        id: 'CONTA-BACEN-RESERVA',
        titular: 'Banco Central - STR/SPI',
        natureza: 'ATIVO',
      });

      const lancamentos = [
        new LancamentoContabil({
          transacaoId: 'TX-01',
          contaId: contaReservaBacen.id,
          tipo: 'DEBITO',
          valor: ValorMonetario.fromCentavos(500000), // +500.000 cents
          historico: 'Aporte de Reserva',
        }),
        new LancamentoContabil({
          transacaoId: 'TX-02',
          contaId: contaReservaBacen.id,
          tipo: 'CREDITO',
          valor: ValorMonetario.fromCentavos(120000), // -120.000 cents
          historico: 'Liquidação SPI',
        }),
      ];

      const saldoAtivo = balanceService.calcularSaldo(contaReservaBacen, lancamentos);
      assert.equal(saldoAtivo, 380000); // 500.000 - 120.000 = 380.000 centavos
    });
  });

  describe('AC-F1-04: Proteção contra Saldo Negativo e FSM da Conta (RN-04)', () => {
    it('deve lançar SaldoInsuficienteError ao tentar debitar R$ 500 com saldo de R$ 100 e limite zero', () => {
      const conta = new ContaContabil({
        id: 'CONTA-CORRENTE-100',
        titular: 'João da Silva',
        natureza: 'PASSIVO',
        limiteChequeEspecialCentavos: 0,
      });

      const saldoAtualCentavos = 10000; // R$ 100,00
      const debitoPretendidoCentavos = 50000; // R$ 500,00

      assert.throws(
        () => balanceService.validarSaldoDisponivel(conta, saldoAtualCentavos, debitoPretendidoCentavos),
        (err: unknown) => {
          assert(err instanceof SaldoInsuficienteError);
          assert.equal(err.contaId, conta.id);
          assert.equal(err.valorDebitoCentavos, 50000);
          assert.equal(err.saldoDisponivelCentavos, 10000);
          return true;
        }
      );
    });

    it('deve autorizar débito quando coberto pelo limite de cheque especial', () => {
      const contaComLimite = new ContaContabil({
        id: 'CONTA-COM-LIMITE',
        titular: 'Maria Santos',
        natureza: 'PASSIVO',
        limiteChequeEspecialCentavos: 50000, // Limite de R$ 500,00
      });

      const saldoAtualCentavos = 10000; // R$ 100,00
      const debitoPretendidoCentavos = 50000; // R$ 500,00 (disponível = 600,00)

      assert.doesNotThrow(() => {
        balanceService.validarSaldoDisponivel(contaComLimite, saldoAtualCentavos, debitoPretendidoCentavos);
      });
    });

    it('deve lançar ContaNaoOperacionalError quando a conta estiver BLOQUEADA_JUDICIAL', () => {
      const conta = new ContaContabil({
        id: 'CONTA-BLOQUEADA',
        titular: 'Investigado A',
        natureza: 'PASSIVO',
      });

      conta.bloquearJudicialmente();
      assert.equal(conta.status, 'BLOQUEADA_JUDICIAL');
      assert.equal(conta.isOperacional, false);

      assert.throws(
        () => balanceService.validarSaldoDisponivel(conta, 100000, 1000),
        (err: unknown) => {
          assert(err instanceof ContaNaoOperacionalError);
          assert.match(err.message, /Conta não operacional/);
          return true;
        }
      );
    });

    it('deve respeitar as transições da FSM da conta e impedir operações em contas encerradas', () => {
      const conta = new ContaContabil({
        id: 'CONTA-FSM',
        titular: 'Cliente Teste FSM',
        natureza: 'PASSIVO',
      });

      conta.suspender();
      assert.equal(conta.status, 'SUSPENSA');

      conta.reativar();
      assert.equal(conta.status, 'ATIVA');

      conta.encerrar();
      assert.equal(conta.status, 'ENCERRADA');

      assert.throws(
        () => conta.reativar(),
        (err: unknown) => err instanceof ContaNaoOperacionalError
      );
      assert.throws(
        () => conta.bloquearJudicialmente(),
        (err: unknown) => err instanceof ContaNaoOperacionalError
      );
      assert.throws(
        () => conta.suspender(),
        (err: unknown) => err instanceof ContaNaoOperacionalError
      );
    });
  });

  describe('AC-F1-05: Ciclo Completo de Transferência Pix com Liquidação e Estorno (RN-05)', () => {
    it('deve executar o ciclo completo de transferência Pix e estorno contábil mantendo invariantes', () => {
      // 1. Setup das Contas
      const chavePixOrigem = ChavePix.criar('52998224725');
      const chavePixDestino = ChavePix.criar('+5511999998888');

      const contaOrigem = new ContaContabil({
        id: 'CONTA-ORIGEM',
        titular: 'Cliente Pagador',
        natureza: 'PASSIVO',
        chavePix: chavePixOrigem,
      });

      const contaDestino = new ContaContabil({
        id: 'CONTA-DESTINO',
        titular: 'Cliente Recebedor',
        natureza: 'PASSIVO',
        chavePix: chavePixDestino,
      });

      // Lançamentos Iniciais
      const lancamentosOrigem: LancamentoContabil[] = [
        new LancamentoContabil({
          transacaoId: 'TX-INIT-01',
          contaId: contaOrigem.id,
          tipo: 'CREDITO',
          valor: ValorMonetario.fromReais(1000), // Saldo inicial: R$ 1.000,00 (100.000 cents)
          historico: 'Saldo inicial',
        }),
      ];

      const lancamentosDestino: LancamentoContabil[] = [
        new LancamentoContabil({
          transacaoId: 'TX-INIT-02',
          contaId: contaDestino.id,
          tipo: 'CREDITO',
          valor: ValorMonetario.fromReais(500), // Saldo inicial: R$ 500,00 (50.000 cents)
          historico: 'Saldo inicial',
        }),
      ];

      assert.equal(balanceService.calcularSaldo(contaOrigem, lancamentosOrigem), 100000);
      assert.equal(balanceService.calcularSaldo(contaDestino, lancamentosDestino), 50000);

      // 2. Criação da Transação Pix de R$ 200,00 (20.000 centavos)
      const valorTransferencia = ValorMonetario.fromReais(200);

      // Validar saldo da conta de origem antes de debitar
      const saldoOrigemAtual = balanceService.calcularSaldo(contaOrigem, lancamentosOrigem);
      balanceService.validarSaldoDisponivel(contaOrigem, saldoOrigemAtual, valorTransferencia.centavos);

      const transacaoPix = new TransacaoDeTransferencia({
        tipo: 'PIX_TRANSFERENCIA',
        chavePixOrigem,
        chavePixDestino,
      });

      assert.equal(transacaoPix.status, 'CRIADA');

      // 3. Criação das Partidas Dobradas
      const lancamentoDebitoOrigem = new LancamentoContabil({
        transacaoId: transacaoPix.id,
        contaId: contaOrigem.id,
        tipo: 'DEBITO',
        valor: valorTransferencia,
        historico: `Pix enviado para ${chavePixDestino.valor}`,
      });

      const lancamentoCreditoDestino = new LancamentoContabil({
        transacaoId: transacaoPix.id,
        contaId: contaDestino.id,
        tipo: 'CREDITO',
        valor: valorTransferencia,
        historico: `Pix recebido de ${chavePixOrigem.valor}`,
      });

      transacaoPix.adicionarLancamento(lancamentoDebitoOrigem);
      transacaoPix.adicionarLancamento(lancamentoCreditoDestino);

      // 4. Iniciar Processamento e Validar Soma Zero
      transacaoPix.iniciarProcessamento();
      assert.equal(transacaoPix.status, 'PROCESSANDO');

      motorContabil.validarEquilibrio(transacaoPix);

      // 5. Liquidar Transação
      transacaoPix.liquidar();
      assert.equal(transacaoPix.status, 'LIQUIDADA');

      // Atualizar extratos das contas
      lancamentosOrigem.push(lancamentoDebitoOrigem);
      lancamentosDestino.push(lancamentoCreditoDestino);

      // Verificar saldos pós-liquidação
      assert.equal(balanceService.calcularSaldo(contaOrigem, lancamentosOrigem), 80000); // R$ 800,00
      assert.equal(balanceService.calcularSaldo(contaDestino, lancamentosDestino), 70000); // R$ 700,00

      // 6. Simulação de Estorno Contábil Reverso
      // Lançamentos reversos: Crédito na Origem (+200) e Débito no Destino (-200)
      const transacaoEstorno = new TransacaoDeTransferencia({
        tipo: 'PIX_ESTORNO',
      });

      const estornoCreditoOrigem = new LancamentoContabil({
        transacaoId: transacaoEstorno.id,
        contaId: contaOrigem.id,
        tipo: 'CREDITO',
        valor: valorTransferencia,
        historico: `Estorno contábil Pix TX: ${transacaoPix.id}`,
      });

      const estornoDebitoDestino = new LancamentoContabil({
        transacaoId: transacaoEstorno.id,
        contaId: contaDestino.id,
        tipo: 'DEBITO',
        valor: valorTransferencia,
        historico: `Estorno contábil Pix TX: ${transacaoPix.id}`,
      });

      transacaoEstorno.adicionarLancamento(estornoCreditoOrigem);
      transacaoEstorno.adicionarLancamento(estornoDebitoDestino);

      transacaoEstorno.iniciarProcessamento();
      motorContabil.validarEquilibrio(transacaoEstorno);
      transacaoEstorno.liquidar();

      // Transacionar a operação original para ESTORNADA
      transacaoPix.estornar();
      assert.equal(transacaoPix.status, 'ESTORNADA');

      // Registrar os novos lançamentos de estorno (Append-Only)
      lancamentosOrigem.push(estornoCreditoOrigem);
      lancamentosDestino.push(estornoDebitoDestino);

      // 7. Comprovação da Restauração Exata dos Saldos Iniciais
      const saldoFinalOrigem = balanceService.calcularSaldo(contaOrigem, lancamentosOrigem);
      const saldoFinalDestino = balanceService.calcularSaldo(contaDestino, lancamentosDestino);

      assert.equal(saldoFinalOrigem, 100000, 'Saldo da conta de origem deve retornar exatamente a R$ 1.000,00');
      assert.equal(saldoFinalDestino, 50000, 'Saldo da conta de destino deve retornar exatamente a R$ 500,00');
    });

    it('deve impedir transições inválidas na FSM da transação', () => {
      const tx = new TransacaoDeTransferencia({ tipo: 'PIX_TRANSFERENCIA' });

      // Transição ilegal: CRIADA direto para LIQUIDADA
      assert.throws(
        () => tx.liquidar(),
        (err: unknown) => err instanceof TransicaoEstadoInvalidaError
      );

      // Transição ilegal: CRIADA direto para ESTORNADA
      assert.throws(
        () => tx.estornar(),
        (err: unknown) => err instanceof TransicaoEstadoInvalidaError
      );

      tx.iniciarProcessamento();
      tx.falhar('Rejeitado pelo SPI Bacen');
      assert.equal(tx.status, 'FALHADA');
      assert.equal(tx.motivoFalha, 'Rejeitado pelo SPI Bacen');

      // De FALHADA não pode ir para lugar nenhum
      assert.throws(
        () => tx.liquidar(),
        (err: unknown) => err instanceof TransicaoEstadoInvalidaError
      );
    });
  });

  describe('Value Objects Auxiliares: ValorMonetario e AgenciaConta', () => {
    it('ValorMonetario deve manipular centavos inteiros com precisão sem floating drift', () => {
      const v1 = ValorMonetario.fromCentavos(10);
      const v2 = ValorMonetario.fromCentavos(20);
      const soma = v1.somar(v2);

      assert.equal(soma.centavos, 30);
      assert.equal(soma.reais, 0.3);
      assert.equal(v2.maiorQue(v1), true);
      assert.equal(v1.menorQue(v2), true);

      const sub = v2.subtrair(v1);
      assert.equal(sub.centavos, 10);

      assert.throws(
        () => v1.subtrair(v2),
        (err: unknown) => err instanceof ValorMonetarioInvalidoError
      );
      assert.throws(
        () => ValorMonetario.fromCentavos(10.5),
        (err: unknown) => err instanceof ValorMonetarioInvalidoError
      );
      assert.throws(
        () => ValorMonetario.fromCentavos(-1),
        (err: unknown) => err instanceof ValorMonetarioInvalidoError
      );
    });

    it('AgenciaConta deve validar banco COMPE, agência e conta corrente Febraban', () => {
      const agenciaConta = AgenciaConta.criar('341', '1234', '56789-0');
      assert.equal(agenciaConta.banco, '341');
      assert.equal(agenciaConta.agencia, '1234');
      assert.equal(agenciaConta.conta, '56789');
      assert.equal(agenciaConta.digitoConta, '0');
      assert.match(agenciaConta.formatado, /Banco: 341 \| Ag: 1234 \| CC: 56789-0/);

      // Rejeições
      assert.throws(
        () => AgenciaConta.criar('3410', '1234', '56789-0'),
        (err: unknown) => err instanceof AgenciaContaInvalidaError
      );
      assert.throws(
        () => AgenciaConta.criar('341', '12345', '56789-0'),
        (err: unknown) => err instanceof AgenciaContaInvalidaError
      );
      assert.throws(
        () => AgenciaConta.criar('341', '1234', '567890'),
        (err: unknown) => err instanceof AgenciaContaInvalidaError
      );
      assert.throws(
        () => AgenciaConta.criar('341', '1234', '1-0'),
        (err: unknown) => err instanceof AgenciaContaInvalidaError
      );
    });
  });
});
