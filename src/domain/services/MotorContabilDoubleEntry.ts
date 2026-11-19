// src/domain/services/MotorContabilDoubleEntry.ts
import { TransacaoDeTransferencia } from '../entities/TransacaoDeTransferencia.js';
import { TransacaoDesbalanceadaError } from '../errors/domain-errors.js';

export class MotorContabilDoubleEntry {
  /**
   * RN-01: Valida o perfeito balanceamento da transação contábil.
   * A soma de todos os débitos deve ser RIGOROSAMENTE IGUAL à soma de todos os créditos.
   */
  public validarEquilibrio(transacao: TransacaoDeTransferencia): void {
    const lancamentos = transacao.lancamentos;
    if (lancamentos.length < 2) {
      throw new TransacaoDesbalanceadaError(
        transacao.id,
        0,
        0,
        'Transação de partidas dobradas deve conter ao menos 2 lançamentos (1 débito e 1 crédito).'
      );
    }

    let totalDebitosCentavos = 0;
    let totalCreditosCentavos = 0;
    let countDebitos = 0;
    let countCreditos = 0;

    for (const lan of lancamentos) {
      if (lan.tipo === 'DEBITO') {
        totalDebitosCentavos += lan.valor.centavos;
        countDebitos++;
      } else if (lan.tipo === 'CREDITO') {
        totalCreditosCentavos += lan.valor.centavos;
        countCreditos++;
      }
    }

    if (countDebitos === 0 || countCreditos === 0) {
      throw new TransacaoDesbalanceadaError(
        transacao.id,
        totalDebitosCentavos,
        totalCreditosCentavos,
        'Transação deve conter simultaneamente lançamentos de DÉBITO e CRÉDITO.'
      );
    }

    if (totalDebitosCentavos !== totalCreditosCentavos) {
      throw new TransacaoDesbalanceadaError(
        transacao.id,
        totalDebitosCentavos,
        totalCreditosCentavos,
        `Divergência nas partidas dobradas: Total Débito (${totalDebitosCentavos}c) ≠ Total Crédito (${totalCreditosCentavos}c). Diferença: ${Math.abs(totalDebitosCentavos - totalCreditosCentavos)}c.`
      );
    }
  }
}
