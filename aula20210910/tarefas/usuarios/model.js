import util from 'util';
import { v4 as uuidv4 } from 'uuid';
import sequelizeLib from 'sequelize';

import { DadosOuEstadoInvalido, TokenInvalido } from '../erros.js';
import sequelize from '../orm.js';
import knex from '../querybuilder.js';

const { DataTypes, Model } = sequelizeLib;
class Usuario extends Model {}
Usuario.init({
  login: DataTypes.TEXT,
  nome: DataTypes.TEXT
}, { sequelize, modelName: 'usuarios' });

const pausar = util.promisify(setTimeout);

const usuarios = {
  pedro: {
    nome: 'Pedro',
    senha: '123456', // na prática obviamente seria um bcrypt
    admin: false
  },
  clara: {
    nome: 'Clara',
    senha: '234567',
    admin: true
  }
};

const autenticacoes = {
  'f3a86b8f-49a7-4f97-bea0-78990c5cd9b1': 'pedro',
  'a2a011ef-b6c5-471f-98cd-95837c7bdea5': 'clara'
};

export async function autenticar (login, senha) {
  await pausar(25);
  const usuario = usuarios[login];
  if (usuario === undefined) {
    throw new DadosOuEstadoInvalido('UsuarioNaoEncontrado', 'Usuário não encontrado.');
  }
  if (usuario.senha !== senha) {
    throw new DadosOuEstadoInvalido('SenhaInvalida', 'Senha inválida.');
  }
  const autenticacao = uuidv4();
  autenticacoes[autenticacao] = login;
  return autenticacao;
}

export async function recuperarUsuarioAutenticado (autenticacao) {
  if (autenticacao === undefined) {
    throw new Error('Token é necessário para autenticar.');
  }
  const res = await knex('usuarios')
    .join('autenticacoes', 'autenticacoes.id_usuario', 'usuarios.id')
    .where('autenticacoes.id', autenticacao)
    .select('nome', 'login');
  if (res.length === 0) {
    throw new TokenInvalido();
  }
  const usuario = res[0];
  return {
    nome: usuario.nome,
    login: usuario.login,
    admin: false
  };
}

export async function recuperarDadosDoUsuario (loginDoUsuario) {
  const res = await knex('usuarios')
    .select('nome')
    .where('login', loginDoUsuario);
  if (res.length === 0) {
    throw new Error('Usuário não encontrado.');
  }
  return res[0];
}

export async function alterarNome (novoNome, loginDoUsuario) {
  await pausar(25);
  const usuario = usuarios[loginDoUsuario];
  usuario.nome = novoNome;
}
