// src/domain/services/LedgerBalanceService.ts
import { ContaContabil } from '../entities/ContaContabil.js';
import { LancamentoContabil } from '../entities/LancamentoContabil.js';
import { ContaNaoOperacionalError, SaldoInsuficienteError } from '../errors/domain-errors.js';

export class LedgerBalanceService {
  /**
   * Calcula o saldo atual em centavos para uma conta a partir dos seus lançamentos imutáveis.
   */
  public calcularSaldo(conta: ContaContabil, lancamentosDaConta: LancamentoContabil[]): number {
    let saldoCentavos = 0;

    for (const lan of lancamentosDaConta) {
      if (lan.contaId !== conta.id) continue;

      if (conta.natureza === 'PASSIVO' || conta.natureza === 'PATRIMONIO_LIQUIDO' || conta.natureza === 'RECEITA') {
        // Natureza credora: Crédito aumenta, Débito reduz
        saldoCentavos += lan.tipo === 'CREDITO' ? lan.valor.centavos : -lan.valor.centavos;
      } else {
        // Natureza devedora (ATIVO, DESPESA): Débito aumenta, Crédito reduz
        saldoCentavos += lan.tipo === 'DEBITO' ? lan.valor.centavos : -lan.valor.centavos;
      }
    }

    return saldoCentavos;
  }

  /**
   * RN-04: Valida se a conta possui saldo disponível suficiente para o débito pretendido.
   */
  public validarSaldoDisponivel(
    conta: ContaContabil,
    saldoAtualCentavos: number,
    valorDebitoCentavos: number
  ): void {
    if (!conta.isOperacional) {
      throw new ContaNaoOperacionalError(conta.id, `Conta não operacional para movimentação (Status: ${conta.status})`);
    }

    // Saldo disponível = saldoAtual + limiteChequeEspecial
    const saldoDisponivel = saldoAtualCentavos + conta.limiteChequeEspecialCentavos;

    if (valorDebitoCentavos > saldoDisponivel) {
      throw new SaldoInsuficienteError(
        conta.id,
        valorDebitoCentavos,
        saldoDisponivel
      );
    }
  }
}
