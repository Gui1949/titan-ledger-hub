// src/domain/value-objects/ChavePix.ts
import { ChavePixInvalidaError } from '../errors/domain-errors.js';

export type TipoChavePix = 'CPF' | 'CNPJ' | 'EMAIL' | 'TELEFONE' | 'EVP';

export class ChavePix {
  private readonly _valor: string;
  private readonly _tipo: TipoChavePix;

  private constructor(valor: string, tipo: TipoChavePix) {
    this._valor = valor;
    this._tipo = tipo;
  }

  public static criar(valorBruto: string, tipoSugerido?: TipoChavePix): ChavePix {
    if (!valorBruto || valorBruto.trim().length === 0) {
      throw new ChavePixInvalidaError('Chave Pix não pode ser vazia');
    }

    const valorLimpo = valorBruto.trim();
    const tipo = tipoSugerido ?? ChavePix.identificarTipo(valorLimpo);

    ChavePix.validarPorTipo(valorLimpo, tipo);
    return new ChavePix(valorLimpo, tipo);
  }

  private static identificarTipo(valor: string): TipoChavePix {
    const apenasDigitos = valor.replace(/\D/g, '');
    if (apenasDigitos.length === 11 && !valor.includes('@') && !valor.startsWith('+')) return 'CPF';
    if (apenasDigitos.length === 14) return 'CNPJ';
    if (valor.includes('@')) return 'EMAIL';
    if (valor.startsWith('+55') || (apenasDigitos.length === 13 && valor.startsWith('55'))) return 'TELEFONE';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)) return 'EVP';

    throw new ChavePixInvalidaError(`Não foi possível inferir o tipo da Chave Pix: "${valor}"`);
  }

  private static validarPorTipo(valor: string, tipo: TipoChavePix): void {
    switch (tipo) {
      case 'CPF': {
        const digits = valor.replace(/\D/g, '');
        if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits) || !ChavePix.validarDVCpf(digits)) {
          throw new ChavePixInvalidaError(`CPF inválido para Chave Pix: "${valor}"`);
        }
        break;
      }
      case 'CNPJ': {
        const digits = valor.replace(/\D/g, '');
        if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits) || !ChavePix.validarDVCnpj(digits)) {
          throw new ChavePixInvalidaError(`CNPJ inválido para Chave Pix: "${valor}"`);
        }
        break;
      }
      case 'EMAIL': {
        const regexEmail = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
        if (!regexEmail.test(valor) || valor.length > 77) {
          throw new ChavePixInvalidaError(`E-mail inválido para Chave Pix Bacen: "${valor}"`);
        }
        break;
      }
      case 'TELEFONE': {
        // Padrão Bacen: +55 + DDD (2 dígitos) + 9 dígitos móveis = 14 chars (+5511999998888)
        const regexTelefone = /^\+55\d{2}9\d{8}$/;
        if (!regexTelefone.test(valor)) {
          throw new ChavePixInvalidaError(`Telefone celular fora do padrão Bacen E.164 (+55DD9XXXXXXXX): "${valor}"`);
        }
        break;
      }
      case 'EVP': {
        const regexUuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!regexUuidV4.test(valor)) {
          throw new ChavePixInvalidaError(`Chave Aleatória (EVP) deve ser um UUIDv4 canônico: "${valor}"`);
        }
        break;
      }
    }
  }

  private static validarDVCpf(cpf: string): boolean {
    for (let t = 9; t < 11; t++) {
      let d = 0;
      let c = 0;
      for (let m = t + 1; m > 1; m--) {
        d += parseInt(cpf[c++], 10) * m;
      }
      d = ((10 * d) % 11) % 10;
      if (parseInt(cpf[c], 10) !== d) return false;
    }
    return true;
  }

  private static validarDVCnpj(cnpj: string): boolean {
    const calcDV = (len: number) => {
      const pesos = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const soma = cnpj.slice(0, len).split('').reduce((acc, d, i) => acc + parseInt(d, 10) * pesos[i], 0);
      const resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    };
    return calcDV(12) === parseInt(cnpj[12], 10) && calcDV(13) === parseInt(cnpj[13], 10);
  }

  get valor(): string { return this._valor; }
  get tipo(): TipoChavePix { return this._tipo; }

  public equals(outra: ChavePix): boolean {
    return this._valor === outra._valor && this._tipo === outra._tipo;
  }
}
