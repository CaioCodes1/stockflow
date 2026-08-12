/**
 * Hash e verificacao de senha com bcrypt.
 *
 * REGRA INEGOCIAVEL: senha nunca e guardada em texto. Se o banco vazar - e
 * bancos vazam - as senhas nao podem ser legiveis. Como muita gente repete a
 * mesma senha em varios servicos, um vazamento em texto puro compromete a vida
 * digital inteira do usuario, nao so este sistema.
 *
 * HASH NAO E CRIPTOGRAFIA:
 *   criptografia -> mao dupla, existe chave para desfazer.
 *   hash         -> mao unica, nao existe "des-hash".
 * Por isso o sistema nunca "recupera" a senha: ele so consegue comparar hashes.
 *
 * POR QUE BCRYPT E NAO SHA-256?
 * Porque SHA-256 foi feito para ser RAPIDO - e velocidade e exatamente o que o
 * atacante quer. Uma GPU calcula bilhoes de SHA-256 por segundo e quebra senhas
 * comuns por forca bruta em minutos. O bcrypt foi feito para ser LENTO e ter o
 * custo ajustavel: com `saltRounds = 10` sao 2^10 iteracoes. Cada +1 dobra o
 * tempo - o seu, imperceptivel; o do atacante, o dobro do trabalho para sempre.
 *
 * O SALT: o bcrypt gera um valor aleatorio por senha e o embute no proprio hash.
 * Efeito pratico - dois usuarios com a senha "123456" tem hashes DIFERENTES.
 * Sem salt, hashes iguais denunciariam senhas iguais e uma tabela pre-calculada
 * (rainbow table) quebraria todas de uma vez.
 *
 * Usamos `bcryptjs` (implementacao em JavaScript puro) em vez de `bcrypt`
 * (binding nativo em C++): mesmo algoritmo, sem etapa de compilacao - o que
 * evita dor de cabeca no Windows e em imagens Docker alpine.
 */
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

export async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, env.bcryptSaltRounds);
}

/**
 * Compara a senha digitada com o hash guardado.
 *
 * O salt esta dentro do proprio hash, entao o bcrypt sabe extrai-lo, reaplicar o
 * mesmo processo na senha enviada e comparar os resultados - em tempo constante,
 * o que evita ataques de temporizacao.
 */
export async function comparePassword(plainPassword, hash) {
  return bcrypt.compare(plainPassword, hash);
}
