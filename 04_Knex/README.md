# Knex

Sua API começa a entregar funcionalidades, mas tem um detalhe importante nela: o que acontece se você reiniciar o processo Node? Isso mesmo, os dados todos se perdem.

Para evitar que os dados se percam entre execuções do seu software a solução é usar algum tipo de *armazenamento persistente*. Olhando no contexto do seu computador, esse armazenamento é o disco magnético ou SSD. Esse disco possui uma *formatação* e é gerenciado pelo sistema operacional, que fornece APIs para usar esse armazenamento, normalmente usando a abstração de diretórios e arquivos. Praticamente todas as linguagens de programação/plataformas de desenvolvimento oferecem alguma maneira de acessar esse armazenamento (tanto para leitura quanto escrita).

Seria possível então usar o sistema de arquivos para obter armazenamento persistente? Com certeza. Para demonstrar, vamos adaptar o model de tarefas para usar o sistema de arquivos (de uma forma muito ingênua, jamais use isso em produção) ao invés de armazenamento em memória. A estratégia será:

- Sumir com as variáveis `tarefas` e `sequencial`;
- Criar uma função `carregarTarefas` que lê um arquivo com os dados;
- Criar uma função `armazenarTarefas` que substitui esses dados.

Comece criando um arquivo `dados.json` (a extensão não é obrigatória mas ajuda a lembrar do conteúdo) do lado do arquivo `app.ts` do projeto. Coloque nele este conteúdo:

```json
{
  "sequencial": 3,
  "tarefas": [
    {
      "id": 1,
      "loginDoUsuario": "pedro",
      "descricao": "Comprar leite",
      "dataDaConclusao": null
    },
    {
      "id": 2,
      "loginDoUsuario": "pedro",
      "descricao": "Trocar lâmpada",
      "dataDaConclusao": "2021-05-03T10:30:00"
    },
    {
      "id": 3,
      "loginDoUsuario": "clara",
      "descricao": "Instalar torneira",
      "dataDaConclusao": null
    }
  ]
}
```

No arquivo `tarefas/model.ts`, remova as variáveis `sequencial`, `tarefas`, adicione os métodos `carregarTarefas` e `armazenarTarefas`, e ajuste as outras funções exportadas (note também que o `pausar` não é mais necessário):

```ts
import { readFile, writeFile } from 'fs/promises';

type Dados = {
  sequencial: number,
  tarefas: Tarefa[],
};

async function carregarTarefas(): Promise<Dados> {
  const dados = await readFile('dados.json', 'utf-8');
  return JSON.parse(dados);
}

async function armazenarTarefas(dados: Dados): Promise<void> {
  await writeFile('dados.json', JSON.stringify(dados, undefined, 2), 'utf-8');
}

...

export async function cadastrarTarefa(usuario: Usuario | null, dados: DadosTarefa): Promise<IdTarefa> {
  if (usuario === null) {
    throw new UsuarioNaoAutenticado();
  }
  let { tarefas, sequencial } = await carregarTarefas();
  sequencial++;
  const idTarefa = sequencial;
  const tarefa = {
    ...dados,
    id: idTarefa,
    loginDoUsuario: usuario.login,
    dataDaConclusao: null,
  };
  tarefas.push(tarefa);
  await armazenarTarefas({ tarefas, sequencial });
  console.log('cadastrou', tarefa);
  return idTarefa;
}

...

  const { tarefas } = await carregarTarefas();
  return tarefas
    .filter(x => usuario.admin || x.loginDoUsuario === usuario.login)
    .filter(x => !termo || x.descricao.includes(termo));

...

// mesma coisa nos outros métodos
```

Quais os problemas com essa implementação? Por qual motivo não devemos utilizar esse tipo de estratégia em um backend? Considere:

- Cada chamada que precisa de uma informação sobre tarefas carrega a lista completa na memória do processo;
- Chamadas que precisam alterar ou adicionar informações novas acabam substituindo o arquivo por completo;
- A implementação do jeito que foi feita não lida muito bem com usuários simultâneos, podendo inclusive acarretar em dados perdidos;
- O arquivo `dados.json` reside em um único disco, sem nada garantindo que exista redundância na informação (se o disco falhar há certamente perda de dados). Esse problema poderia ser resolvido com abstrações no nível do sistema operacional (ex: RAID) mas costuma ser uma feature resolvida em nível de clusterização do sistema de armazenamento.

Podemos também explorar alguns conceitos-chave que giram ao redor de armazenamento:

## ACID

Atomicidade, consistência, isolamento e durabilidade (felizmente as iniciais funcionam em português também) são 4 atributos muito importantes em qualquer provedor de armazenamento persistente. Veja o que significam:

- Atomicidade: um grupo de operações/comandos relacionados deve se comportar de modo "tudo ou nada" (transação);
- Consistência: em nenhuma hipótese dados inconsistentes/inválidos/corrompidos devem ser armazenados;
- Isolamento: transações executadas paralelamente não devem de modo algum interferir umas com as outras (pense em saques/depósitos como um exemplo fácil);
- Durabilidade: uma vez que o sistema de armazenamento disse que a informação foi persistida, ela não será mais perdida.

Sem qualquer um desses 4 atributos a grande maioria das aplicações não seria viável em escala sem exigir uma alta carga de complexidade incidental (em oposição a complexidade essencial de um domínio).

Note que nossa implementação ingênua de armazenamento não provê nenhuma das 4 letras, exceto durabilidade dependendo do ponto de vista e nível de tolerância do leitor.

## CAP Theorem

Este teorema diz que sistemas de armazenamento distribuídos precisam escolher apenas 2 dos 3 atributos abaixo:

- Consistência: todas as leituras recebem a escrita mais recente ou um erro;
- Disponibilidade: todas as operações (leituras/escritas) recebem uma resposta diferente de erro, sem a garantia de ser a escrita mais recente;
- Tolerância a particionamento de rede: o sistema continua operando independente da quantidade de pacotes perdidos na rede.

As consequências desse teorema são profundas e aterrorizam todas as soluções que precisam escalar seus sistemas de armazenamento, pois nunca há uma resposta simples.

Talvez alguns se lembrem do surgimento do serviço Spanner da Google, que causou bastante alvoroço na comunidade que compreendeu errado e concluiu que era um sistema que "desmentia" o teorema CAP. No fundo o Spanner é uma solução (bem cara) que foca na Consistência e Tolerância a particionamento, mas que possui baixíssima taxa de indisponibilidade, a ponto de tornar a ausência do A praticamente negligível na prática. Os links abaixo fornecem boas leituras sobre este tópico:

- https://www.quora.com/Does-Google-Spanner-comply-with-CAP-theorem
- https://cloud.google.com/blog/products/databases/inside-cloud-spanner-and-the-cap-theorem

## Tipos de sistemas de armazenamento

Agora que ficou evidente a necessidade de um sistema robusto para gerenciar os dados da sua aplicação, vamos passar rapidamente pelos principais tipos:

- Relacional (MySQL, PostgreSQL etc): possui como conceito principal as tabelas e registros. Oferece transações e "joins" (consultas cruzando dados de várias tabelas diferentes). É muito flexível e quase sempre a decisão certa para o início da solução. O principal problema com esse tipo de sistema é a dificuldade em escalar horizontalmente por conta da grande quantidade de features incompatíveis com clusterização (sistemas relacionais costumam ser CP no CAP Theorem);

Todos os outros tipos abaixo podem ser categorizados como "NoSQL" (não relacionais). A popularização desses modelos se deu junto com a necessidade de escalar sistemas de armazenamento horizontalmente:

- Documento (MongoDB, CouchDB etc): trabalha com o conceito de "documentos" e "coleções" sem esquema fixo, encorajando duplicação de dado para atingir escalabilidade com performance;

- Chave-valor (Riak, Redis etc): vai ainda mais fundo na simplificação e atua como um grande dicionário/hash. Performance e eficiência muito altas. No caso do Redis, por exemplo, a solução evoluiu e começou a entregar outras coisas também, como canais "pub sub" (que podem servir de base para soluções de mensageria);

- Famílias de colunas (Cassandra);
- Grafos (Neo4J);
- Armazenamento orientado a objetos (Informix, db4o etc);
- Série temporal (InfluxDB).

Um bom livro para aprender mais a respeito é o livro "Seven Databases in Seven Weeks: A Guide to Modern Databases and the NoSQL Movement".

## Armazenamento relacional com PostgreSQL

O restante dessa disciplina irá focar no armazenamento relacional, mais especificamente usando PostgreSQL. Além de ser o sistema mais popular e abrangente, uma boa parte dos conceitos podem ser transferidos para outros sistemas com pouca diferença.

O primeiro passo é garantir que você possui um servidor PostgreSQL executando. Uma opção é instalar direto na sua máquina e outra é subir um container docker da imagem oficial `postgres`. Caso opte pelo docker (recomendado), use o comando abaixo para subir o container:

```sh
$ docker run -d --name ufscar-desenvweb-2023-1 -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres
```

No momento da escrita deste material a versão estável mais recente era a 15: https://www.postgresql.org/support/versioning/.

Você também vai precisar de um client SQL capaz de conversar com o banco de dados. Uma boa recomendação é o `pgAdmin4`, mas nada nesta disciplina impede que você use outras opções como o `DataGrip` ou `DBeaver`.

## Criando a primeira tabela

Antes de discutir como conectar a API na base de dados, vamos criar uma tabela para armazenar os usuários. Para isso você precisa conectar usando o client escolhido, abrir a ferramenta de edição e execução de comandos SQL e executar o comando DDL (linguagem de definição de dados) abaixo:

```sql
create table usuarios (
  id int not null,
  login text not null,
  senha text not null, /* nós vamos parar de usar texto plano em algum momento, confia :) */
  nome text not null,
  admin boolean not null default false,

  constraint pk_usuarios primary key (id),
  constraint un_usuarios_login unique (login)
);
```

E depois insira os dados do Pedro e da Clara usando o seguinte DML (linguagem de manipulação de dados):

```sql
insert into usuarios (id, login, senha, nome, admin)
values (1, 'pedro', '123456', 'Pedro', false),
  (2, 'clara', '234567', 'Clara', true);
```

Você pode conferir se os dados foram persistidos usando a seguinte consulta:

```sql
select * from usuarios;
```

## Visão geral da comunicação com o banco de dados

Agora que temos o sistema de armazenamento disponível, como devemos seguir para conectar nossa API a ele? Existem três principais estratégias, diferenciando-se no nível de abstração em que atuam. São elas:

- Driver direto: a biblioteca usada neste caso é a que se comunica direto com o banco de dados, fornecendo praticamente nenhuma abstração. Uma forma simples de entender é pensar em uma função que recebe comandos SQL e cuida da comunicação com o banco para executá-los, e nada mais;

- ORM (mapeamento objeto relacional): essas bibliotecas estão no outro extremo, escondendo por completo (ou quase isso) o fato de estar lidando com uma base relacional, fornecendo uma API orientada a objetos e cuidando de toda a dinâmica entre esses dois mundos. Pense em um objeto `pessoa` com uma função `getDependentes()` e, caso você manipule os dependentes, uma forma de pedir para a biblioteca cuidar de todo o processo de espelhar as mudanças no banco de dados;

- Query builders (construtores de comandos SQL): essas ficam no meio do caminho, sem o objetivo de esconder o fato de estar lidando com armazenamento relacional, mas também sem exigir que o desenvolvedor "concatene strings".

Analisaremos um exemplo de driver direto, um de ORM e por fim o restante da disciplina irá utilizar o query builder Knex.

## Driver direto

A biblioteca Node.js para conexão com PostgreSQL é a `pg`. Vamos começar instalando ela no projeto usando npm:

```sh
$ npm install pg
$ npm install --save-dev @types/pg
```

Crie agora um arquivo chamado `db.ts` na pasta `shared`. Este arquivo vai cuidar da configuração de conexão:

```ts
import pg from 'pg';


export async function conectar () {
  const client = new pg.Client({
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'postgres'
  }); // note que tudo isso pode (e é boa prática) vir em variáveis de ambiente
  await client.connect();
  return client;
}
```

E agora use essa conexão no método `autenticar` do arquivo `usuarios/model.ts`:

```js
import { conectar } from '../shared/db';

...

export async function autenticar (login: Login, senha: Senha): Promise<IdAutenticacao> {
  const conexao = await conectar();
  try {
    const res = await conexao.query(
      'select nome, senha, admin from usuarios where login = $1',
      [ login ]
    );
    const row = res.rows[0];
    if (row === undefined || row.senha !== senha) {
      throw new DadosOuEstadoInvalido('Login ou senha inválidos', {
        codigo: 'CREDENCIAIS_INVALIDAS'
      });
    }
    const id = gerarId();
    autenticacoes[id] = {
      login,
      ...row, // repare que row é do tipo any, por isso o TypeScript não reclama
    };
    return id;
  } finally {
    await conexao.end();
  }
}
```

## ORM

Do outro lado da régua das maneiras de se comunicar com o banco de dados nós temos as bibliotecas de mapeamento objeto relacional. Elas pedem um bom tanto de configuração e prometem entregar facilidade no desenvolvimento. A biblioteca de ORM mais conhecida no ecossistema Node.js é sem dúvida a `Sequelize`. Existem outras como a `TypeORM`. Antes do código é válido discutir alguns pontos positivos e negativos do uso de ORMs:

Pontos positivos de acordo com [1] e [2] (infelizmente o autor do material discorda de todos, sem exceção):

- Codificar a comunicação com o banco de dados usando a mesma linguagem das regras de negócio/domínio;
- Permite focar os algoritmos no mundo orientado a objetos, sob a premissa de que a ferramenta vai transferir os comandos/consultas para o mundo relacional;
- Facilita a mudança de um SGBD para outro;
- Muitas consultas tem melhor performance comparadas com a escrita direto no SQL (controverso);

[1] https://blog.bitsrc.io/what-is-an-orm-and-why-you-should-use-it-b2b6f75f5e2a
[2] https://www.quora.com/What-are-the-benefits-of-using-an-ORM-layer (segunda resposta)

Pontos negativos usando as mesmas fontes, [3] e também alguns argumentos próprios do autor do material):

[3] https://blog.logrocket.com/why-you-should-avoid-orms-with-examples-in-node-js-e0baab73fa5/#isormreallynecessary

- Curva de aprendizado é longa;
- Usar uma camada de abstração raramente é desculpa para não entender exatamente o que está acontecendo por baixo. A falha de consideração nessa etapa leva o desenvolvedor a tomar decisões ruins que, no médio e longo prazo, acarretam em sérios problemas;
- O fato de tentar mapear domínios bem distintos acarreta em bibliotecas muito complexas.

Como tudo no dia a dia do profissional de TI, usar ou não uma abstração ORM é uma decisão complexa que envolve muitos fatores, sendo um dos principais dele a opinião e composição do time.

Para terminar de exemplificar, vamos configurar o Sequelize no projeto e adaptar a consulta de dados do usuário logado. Comece instalando a biblioteca via npm:

```sh
$ npm install sequelize
```

Teríamos agora que instalar um driver específico do banco de dados, mas já fizemos isso na seção anterior. 

Crie um arquivo `shared/orm.ts` que será responsável por expor uma instância do Sequelize configurada com os dados de conexão do banco de dados, da mesma forma que fizemos com o `db.js`:

```js
import { Sequelize } from 'sequelize';

const sequelize = new Sequelize('postgres://postgres:postgres@localhost:5432/postgres', {
  define: {
    timestamps: false
  }
});

export default sequelize;
```

Agora adapte o arquivo `usuarios/model.ts` criando a classe `UsuarioORM`, informando os metadados necessários para o Sequelize e usando essa classe para efetuar a consulta:

```ts
import sequelizeLib, { Model } from 'sequelize';

import sequelize from '../shared/orm';
//...
class UsuarioORM extends Model {
  public id!: number;
  public nome!: string;
  public login!: string;
  public senha!: string;
  public admin!: boolean;
}
UsuarioORM.init({
  nome: sequelizeLib.DataTypes.STRING,
  login: sequelizeLib.DataTypes.STRING,
  senha: sequelizeLib.DataTypes.STRING,
  admin: sequelizeLib.DataTypes.BOOLEAN,
}, {
  sequelize,
  tableName: 'usuarios',
});
//...
export async function autenticar (login: Login, senha: Senha): Promise<IdAutenticacao> {
  const usuario = await UsuarioORM.findOne({ where: { login } });
  if (usuario === null || usuario.senha !== senha) {
    throw new DadosOuEstadoInvalido('Login ou senha inválidos', {
      codigo: 'CREDENCIAIS_INVALIDAS'
    });
  }
  const id = gerarId();
  autenticacoes[id] = usuario;
  return id;
}
```

Veja [esta página](https://sequelize.org/master/manual/eager-loading.html) e [esta](https://sequelize.org/master/manual/assocs.html#basics-of-queries-involving-associations) para entender ao mesmo tempo o poder prometido por bibliotecas ORMs e uma de suas maiores armadilhas. Se atente para a capacidade da abstração em confundir o desenvolvedor no peso do código que desenvolve (se usa eager corre o risco de impactar muitos pontos do projeto, se usa lazy corre o risco de executar uma quantidade exorbitante de consultas desnecessariamente).

E veja [esta página](https://sequelize.org/master/manual/creating-with-associations.html) para um exemplo de feature que todos esperam de um ORM mas infelizmente o Sequelize não oferece suporte ("merge" em cascata).

## Query builders

E no meio desses extremos? Caso você não queira concatenar strings nem esconder o modelo relacional atrás de uma biblioteca, você pode usar uma abstração que constrói comandos SQL (um query builder). A opção mais famosa no ecossistema Node.js é o Knex, que usaremos no restante dessa disciplina enquanto construímos nossa API. Note que vários dos conceitos apresentados a frente (como transações, migrações etc) não se aplicam apenas em query builders mas em todos os três esquemas de comunicação.

Vamos adequar novamente o endpoint de busca de dados do usuário logado, dessa vez com Knex. Comece instalando a biblioteca:

```sh
$ npm install knex
```

Note que também teríamos que instalar o driver `pg`, mas já fizemos isso.

Crie agora um arquivo chamado `shared/querybuilder.ts` que ficará responsável pela configuração reutilizável:

```ts
import knexLib from 'knex';

const knex = knexLib({
  client: 'pg',
  connection: 'postgres://postgres:postgres@localhost:5432/postgres',
  debug: true
});

export default knex;
```

E adapte novamente o arquivo `usuarios/model.ts`:

```js
import knex from '../shared/querybuilder';
//...
export async function autenticar (login: Login, senha: Senha): Promise<IdAutenticacao> {
  const usuario = await knex('usuarios')
    .select('login', 'senha', 'nome', 'admin')
    .where({ login })
    .first();
  if (usuario === null || usuario.senha !== senha) {
    throw new DadosOuEstadoInvalido('Login ou senha inválidos', {
      codigo: 'CREDENCIAIS_INVALIDAS'
    });
  }
  const id = gerarId();
  autenticacoes[id] = usuario;
  return id;
}
```

Tente o exemplo passando um login inexistente. Deu um erro 500, o que aconteceu? O TypeScript está considerando o tipo de `usuario` como any, e um registro não encontrado é retornado como `undefined` ao invés de `null` pelo Knex. Mude de === null para === undefined e verá que o problema se resolve. Mas como melhorar a tipagem desse código para que problemas similares não ocorram mais?

Uma maneira é ser explícito e dizer para o Knex qual o tipo esperado de retorno para a operação:

```ts
await knex<Usuario>('usuarios')
```

A outra maneira é enriquecer a interface de definição de tabelas do Knex:

```ts
declare module 'knex/types/tables' {
  interface Tables {
    usuarios: Usuario;
  }
}
```

O Knex olha nessa interface para buscar o tipo de um retorno baseado no nome da tabela que foi passado.

[Exercício 01_recuperar_usuario_autenticado](exercicios/01_recuperar_usuario_autenticado/README.md)

## Adequação da função de autenticação

Vamos agora adequar a função que cria autenticações validando as credenciais do usuário. Dessa vez não vamos armazenar a senha em texto plano, utilizaremos uma biblioteca que permite gerar hashes BCrypt (uma boa opção para este tipo de caso de uso). Comece instalando essa biblioteca:

```sh
$ npm install bcrypt
$ npm install --save-dev @types/bcrypt
```

Abra um console Node.js escrevendo apenas `node` no terminal. Importe a biblioteca e execute o seguinte código para encriptar uma senha:

```js
const bcrypt = require('bcrypt');
console.log(bcrypt.hashSync('123456', 8));
console.log(bcrypt.hashSync('123456', 12));
console.log(bcrypt.hashSync('123456', 16));
```

A partir de agora a coluna `senha` na tabela de usuários *não* conterá mais as senhas em texto plano, mas sim hashes bcrypt da senha:

```sql
update usuarios set senha = '$2b$12$4AbaFz9KpFU2T9MZbinfFeF8qgNsOyMRl8aFxp46eEXRUBIaHfLMK'; -- note que isso vai aplicar para TODOS os usuários
```

Por fim adeque a função `autenticar` no arquivo `usuarios/model.ts`:

```ts
import bcrypt from 'bcrypt';

...

export async function autenticar (login: Login, senha: Senha): Promise<IdAutenticacao> {
  const usuario = await knex('usuarios')
    .select('login', 'senha', 'nome', 'admin')
    .where({ login })
    .first();
  if (usuario === undefined || (await senhaInvalida(senha, usuario.senha))) {
    throw new DadosOuEstadoInvalido('Login ou senha inválidos', {
      codigo: 'CREDENCIAIS_INVALIDAS'
    });
  }
  const id = gerarId();
  autenticacoes[id] = usuario;
  return id;
}

async function senhaInvalida(senha: string, hash: string): Promise<boolean> {
  const hashCompativel = await bcrypt.compare(senha, hash);
  return !hashCompativel;
}
```

Falta agora inserir a autenticação na base. Adicione o campo `id` no tipo `Usuario`, busque a informação nos locais necessários e troque a atribuição no objeto `autenticacoes` por um INSERT usando Knex:

```ts
export type Usuario = {
  id: number;
  nome: string;
  login: Login;

...

export async function autenticar (login: Login, senha: Senha): Promise<IdAutenticacao> {
  const usuario = await knex('usuarios')
    .select('id', 'login', 'senha', 'nome', 'admin')
    .where({ login })
    .first();
  if (usuario === undefined || (await senhaInvalida(senha, usuario.senha))) {
    throw new DadosOuEstadoInvalido('Login ou senha inválidos', {
      codigo: 'CREDENCIAIS_INVALIDAS'
    });
  }
  const id = gerarId();
  await knex('autenticacoes')
    .insert({ id_usuario: usuario.id, id });
  return id;
}

...

export async function recuperarUsuarioAutenticado (token: IdAutenticacao): Promise<Usuario> {
  const usuario = await knex('autenticacoes')
    .join('usuarios', 'usuarios.id', 'autenticacoes.id_usuario')
    .select<Usuario>('usuarios.id', 'login', 'senha', 'nome', 'admin')
```

[Exercício 02_alterar_nome_usuario](exercicios/02_alterar_nome_usuario/README.md)

Repare que neste momento *todo* o model de usuários está adaptado! Sem uma única mudança necessária na camada de roteamento.

## Evoluindo o modelo (migrações de esquema)

Um sistema nunca para de ser evoluído, isso todo mundo que trabalha com software sabe. Como então lidar com as inevitáveis mudanças necessárias no banco de dados conforme adicionamos/alteramos funcionalidades da nossa API? Para isso existem ferramentas de migração de esquema. Essas ferramentas trabalham da seguinte forma:

- Você escreve scripts que indicam como evoluir o esquema (criando tabelas, adicionando colunas etc);
- A ferramenta olha para uma tabela de metadados no banco de destino e aplica os scripts que ainda não foram aplicados.

Essa estratégia é bem poderosa, pois permite que exatamente o mesmo script (ou coleção de últimos scripts) seja aplicado nos mais diversos ambientes do projeto (local, testes, produção etc).

O Knex oferece uma ferramenta dessa nativamente, e utilizaremos essa ferramenta a partir de agora. Comece criando um arquivo `knexfile`:

```sh
$ npm install --save-dev ts-node
$ npx knex init -x ts
```

Altere o arquivo `knexfile.ts` deixando-o dessa forma:

```ts
import type { Knex } from 'knex';

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'postgresql',
    connection: 'postgres://postgres:postgres@localhost:5432/postgres',
    migrations: {
      tableName: 'knex_migrations',
      extension: 'ts',
    }
  },
};

export default config;
```

Remova as tabelas `usuarios` e `autenticacoes`. Criaremos elas novamente usando migrations.

```sql
drop table autenticacoes;
drop table usuarios;
```

Crie a primeira migração com o seguinte comando:

```sh
$ npx knex migrate:make cria_tabela_usuarios
```

Implemente-a com o seguinte código:

```ts
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('usuarios', (table) => {
    table.increments();
    table.text('nome').notNullable();
    table.text('login').notNullable();
    table.text('senha').notNullable();
    table.boolean('admin').notNullable();
  });
}


export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('usuarios');
}
```

E execute-a com o seguinte comando:

```sh
$ npx knex migrate:latest
```

Um ponto de atenção aqui: execute `npm run build` e tente executar `npx knex migrate:latest` novamente. O Knex vai reclamar que não consegue criar novamente a tabela de usuários. Isso ocorreu pois ele está tentando executar a versão `.js` das migrações! Você definitivamente não quer isso. Uma maneira de resolver é excluir o arquivo `knexfile.js` gerado pela build, e ignorar tanto o `knexfile.ts` quanto a pasta `migrations` da build coordenada pelo `tsconfig.json`:

```sh
$ rm knexfile.js
$ rm migrations/*.js
```

```json
...
  },
  "exclude": ["knexfile.ts", "migrations"]
}
```

Essa é uma boa oportunidade para configurar um diretório diferente para os arquivos JavaScript. Também no arquivo `tsconfig.json`:

```json
    // "outFile": "./",                                  /* Specify a file that bundles all outputs into one JavaScript file. If 'declaration' is true, also designates a file that bundles all .d.ts output. */
    "outDir": "./build",                                   /* Specify an output folder for all emitted files. */
    // "removeComments": true,                           /* Disable emitting comments. */

```

Adicione a pasta build no `.gitignore`, no lugar dos arquivos `*.js`:

```
build
```

Também é necessário ajustar o script de execução no `package.json`, já que agora os arquivos JavaScript estarão na pasta `build`:

```json
  "scripts": {
    "build": "rm -rf build && tsc -p tsconfig.json",
    "start": "cd build && node app.js"
  },
```

Limpe eventuais arquivos existentes e construa o projeto novamente:

```sh
$ rm -rf node_modules
$ rm **/*.js
$ npm install
$ npm run build
```

Voltando agora às migrações. É possível usar o comando `down` para reverter o último lote executado:

```sh
$ npx knex migrate:down
```

Uma consideração importante é que alguns projetos decidem *não* oferecer suporte para rollback (o método `down` das migrações). Garantir a qualidade desses módulos é custoso e eles praticamente nunca são usados, portanto o argumento principal é não implementá-los e atuar nos rollbacks manualmente quando algum imprevisto ocorrer nos ambientes produtivos.

Crie uma migration agora para a tabela `autenticacoes`:

```sh
$ npx knex migrate:make criar_tabela_autenticacoes
```

E implemente-a:

```js
export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('autenticacoes', (table) => {
    table.uuid('id').primary();
    table.integer('id_usuario').notNullable().references('usuarios.id');
  });
}


export async function down(knex: Knex): Promise<void> {
  throw new Error('não suportado');
}
```

[Exercício 03_tabela_categorias](exercicios/03_tabela_categorias/README.md)

## Continuação das adequações

Vamos continuar as adequações, agora focando no model de tarefas. Vamos aproveitar o mesmo processo para enriquecer o cadastro com o campo identificador da categoria. Comece criando a migração responsável pela tabela:

```sh
$ npx knex migrate:make cria_tabela_tarefas
```

```ts
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('tarefas', (table) => {
    table.increments();
    table.text('descricao').notNullable();
    table.integer('id_categoria').notNullable().references('categorias.id');
    table.integer('id_usuario').notNullable().references('usuarios.id');
    table.timestamp('data_conclusao');
  });
}


export async function down(knex: Knex): Promise<void> {
  throw new Error('não suportado');
}
```

Lembre-se de sempre executar as migrações com o comando `npx knex migrate:latest`.

Adapte agora o arquivo `tarefas/model.ts`, começando pelas definições de modelo:

```ts
import knex from '../shared/querybuilder';

import { AcessoNegado, DadosOuEstadoInvalido, UsuarioNaoAutenticado } from '../shared/erros';
import { Usuario } from '../usuarios/model';

export interface DadosTarefa {
  descricao: string;
  id_categoria: number;
}

type IdTarefa = number;

type Tarefa =
  DadosTarefa
  & {
    id: IdTarefa,
    id_usuario: number,
    data_conclusao: Date | null,
  };

declare module 'knex/types/tables' {
  interface Tables {
    tarefas: Tarefa;
  }
}
```

Adapte agora o método `cadastrarTarefa`:

```ts
export async function cadastrarTarefa(usuario: Usuario | null, dados: DadosTarefa): Promise<IdTarefa> {
  if (usuario === null) {
    throw new UsuarioNaoAutenticado();
  }
  const res = await knex('tarefas')
    .insert({
      ...dados,
      id_usuario: usuario.id,
    })
    .returning<Pick<Tarefa, 'id'>[]>('id');
  if (res.length === 0) {
    throw new Error('Erro ao cadastrar a tarefa. res === undefined');
  }
  return res[0].id;
}
```

Adapte também o roteador `tarefas/router.ts` adicionando o campo `id_categoria` no schema:

```ts
const postSchema: FastifySchema = {
  body: {
    type: 'object',
    properties: {
      descricao: { type: 'string' },
      id_categoria: { type: 'number' },
    },
    required: ['descricao', 'id_categoria'],
    additionalProperties: false,
  },
  response: {
    201: {
      type: 'object',
      properties: {
        id: { type: 'number' },
      },
      required: ['id'],
    },
  },
};
```

Vamos adaptar agora o endpoint `GET /tarefas`. A alteração necessária é no `tarefas/model.ts`:

```ts
export async function consultarTarefas(usuario: Usuario | null, termo?: string): Promise<Tarefa[]> {
  if (usuario === null) {
    throw new UsuarioNaoAutenticado();
  }
  let query = knex('tarefas')
    .select('id', 'descricao', 'id_categoria',
            'id_usuario', 'data_conclusao', 'descricao'); // sem o await!
  if (!usuario.admin) {
    query = query.where('id_usuario', usuario.id);
  }
  if (termo) {
    query = query.where('descricao', 'ilike', `%${termo}%`);
  }
  return await query;
}
```

Adeque agora a consulta de tarefa por ID. Também no arquivo `tarefas/model.ts`:

```ts
export async function consultarTarefaPeloId(usuario: Usuario | null, id: IdTarefa): Promise<Tarefa> {
  if (usuario === null) {
    throw new UsuarioNaoAutenticado();
  }
  const res = await knex('tarefas')
    .select('id', 'descricao', 'id_categoria',
            'id_usuario', 'data_conclusao', 'descricao')
    .where('id', id);
  const tarefa = res[0];
  if (tarefa === undefined) {
    throw new DadosOuEstadoInvalido('Tarefa não encontrada', {
      codigo: 'TAREFA_NAO_ENCONTRADA'
    });
  }
  if (!usuario.admin && usuario.id !== res[0].id_usuario) {
     throw new AcessoNegado();
  }
  return tarefa;
}
```

Vamos desenvolver agora um novo endpoint: `PATCH /tarefas/{id}`. A ideia é permitir que a descrição e/ou a categoria de uma tarefa existente sejam alteradas. Comece adicionando o endpoint no arquivo `tarefas/router.ts`:

```ts
import {
  consultarTarefaPeloId, cadastrarTarefa, consultarTarefas,
  DadosTarefa, concluirTarefa, reabrirTarefa, alterarTarefa
} from './model';

...

app.patch('/:id', async (req, resp) => {
  const { id } = req.params as { id: string };
  const idTarefa = Number(id);
  const alteracoes = req.body as Partial<DadosTarefa>;
  await alterarTarefa(req.usuario, idTarefa, alteracoes);
  resp.status(204);
});
```

E agora implemente a função `alterarTarefa` no arquivo `tarefas/model.ts`:

```ts
export async function alterarTarefa(usuario: Usuario | null, id: IdTarefa, alteracoes: Partial<DadosTarefa>): Promise<void> {
  if (usuario === null) {
    throw new UsuarioNaoAutenticado();
  }
  await asseguraExistenciaDaTarefaEAcessoDeEdicao(usuario, id);
  if (Object.keys(alteracoes).length > 0) {
    await knex('tarefas')
      .update({
        descricao: alteracoes.descricao,
        id_categoria: alteracoes.id_categoria,
      })
      .where('id', id);
  }
}
```

O próximo passo será a adaptação dos métodos `concluirTarefa` e `reabrirTarefa`:

```ts
export async function concluirTarefa(usuario: Usuario | null, id: IdTarefa): Promise<void> {
  if (usuario === null) {
    throw new UsuarioNaoAutenticado();
  }
  await asseguraExistenciaDaTarefaEAcessoDeEdicao(usuario, id);
  await knex('tarefas')
    .update('data_conclusao', new Date())
    .where('id', id);
}

export async function reabrirTarefa(usuario: Usuario | null, id: IdTarefa): Promise<void> {
  if (usuario === null) {
    throw new UsuarioNaoAutenticado();
  }
  await asseguraExistenciaDaTarefaEAcessoDeEdicao(usuario, id);
  await knex('tarefas')
    .update('data_conclusao', null)
    .where('id', id);
}
```

Note que aqui acabaram as adequações! Daqui pra frente serão apenas novos endpoints.

## Exclusão de tarefa

Um endpoint relativamente simples que ficou de fora até agora é a exclusão de uma tarefa. Existem duas abordagens para exclusões: física e lógica. A exclusão física remove mesmo o registro do banco de dados, enquanto a exclusão lógica apenas muda um campo no registro (boolean ou uma data) indicando que ele foi excluído. O benefício da exclusão física é a simplicidade, enquanto o benefício da exclusão lógica é manter um registro melhor dos dados em troca de ter que tomar muito cuidado para limitar todas as consultas que usam essa tabela a desconsiderarem os registros excluídos.

Comece implementando no arquivo `tarefas/router.ts`:

```ts
import {
  consultarTarefaPeloId, cadastrarTarefa, consultarTarefas,
  DadosTarefa, concluirTarefa, reabrirTarefa, alterarTarefa,
  excluirTarefa
} from './model';

...

app.delete('/:id', async (req, resp) => {
  const { id } = req.params as { id: string };
  const idTarefa = Number(id);
  await excluirTarefa(req.usuario, idTarefa);
  resp.status(204);
});
```

E depois adicione o método no `tarefas/model.ts`:

```ts
export async function excluirTarefa(usuario: Usuario | null, id: IdTarefa): Promise<void> {
  if (usuario === null) {
    throw new UsuarioNaoAutenticado();
  }
  await asseguraExistenciaDaTarefaEAcessoDeEdicao(usuario, id);
  await knex('tarefas')
    .delete()
    .where('id', id);
}
```

## Transações (atomicidade)

Vamos implementar agora o vínculo de etiquetas com as tarefas. Note que o endpoint deve receber qualquer etiqueta e criá-la caso ainda não exista, atribuindo uma cor aleatória. Esse comportamento é novo, pois até o momento não tivemos nenhum caso parecido onde um único endpoint chama duas operações diferentes. Isso traz novas preocupações, principalmente com relação a atomicidade (ou tudo ou nada) da ação.

Começaremos implementando uma versão ingênua e depois vamos evoluí-la, incorporando conceitos que resolvem o problema. O primeiro passo é criar a tabela de etiqueta e uma tabela que representa as etiquetas vinculadas com as tarefas:

```sh
$ npx knex migrate:make cria_tabela_etiquetas_e_tarefa_etiqueta
```

```ts
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('etiquetas', (table) => {
    table.increments();
    table.text('descricao').notNullable().unique();
    table.specificType('cor', 'integer[3]').notNullable();
  });
  await knex.schema.createTable('tarefa_etiqueta', (table) => {
    table.integer('id_tarefa').notNullable().references('tarefas.id');
    table.integer('id_etiqueta').notNullable().references('etiquetas.id');
    table.primary(['id_tarefa', 'id_etiqueta']);
  });
}


export async function down(knex: Knex): Promise<void> {
  throw new Error('não suportado');
}
```

Crie agora uma pasta chamada `etiquetas`, com um arquivo chamado `model.ts` dentro dela com o seguinte conteúdo:

```ts
import knex from '../shared/querybuilder';

type FatorRGB = number; // 0-255
type Cor = [FatorRGB, FatorRGB, FatorRGB];

type Etiqueta = {
  id: number;
  descricao: string;
  cor: Cor;
}

declare module 'knex/types/tables' {
  interface Tables {
    etiquetas: Etiqueta;
  }
}

export async function cadastrarEtiquetaSeNecessario(etiqueta: string): Promise<number> {
  const res = await knex('etiquetas')
    .select('id')
    .where('descricao', etiqueta)
    .first();
  let id: number;
  if (res !== undefined) {
    id = res.id;
  } else {
    const res = await knex('etiquetas')
      .insert({
        descricao: etiqueta,
        cor: gerarCorAleatoria()
      })
      .returning<{ id: number }[]>('id');
    id = res[0].id;
  }
  return id;
}

function gerarCorAleatoria(): Cor {
  const num = Math.round(0xffffff * Math.random());
  const r = num >> 16;
  const g = num >> 8 & 255;
  const b = num & 255;
  return [r, g, b];
}
```

Adicione agora o seguinte método no modelo de tarefas:

```ts
import { cadastrarEtiquetaSeNecessario } from '../etiquetas/model';

...

export async function vincularEtiquetaNaTarefa(usuario: Usuario | null, id: IdTarefa, etiqueta: string): Promise<void> {
  if (usuario === null) {
    throw new UsuarioNaoAutenticado();
  }
  await asseguraExistenciaDaTarefaEAcessoDeEdicao(usuario, id);
  const idEtiqueta = await cadastrarEtiquetaSeNecessario(etiqueta);
  await knex('tarefa_etiqueta')
    .insert({
      id_tarefa: id,
      id_etiqueta: idEtiqueta,
    })
    .onConflict(['id_tarefa', 'id_etiqueta']).ignore();
}
```

E por fim o endpoint no router de tarefas:

```ts
import {
  consultarTarefaPeloId, cadastrarTarefa, consultarTarefas,
  DadosTarefa, concluirTarefa, reabrirTarefa, alterarTarefa,
  excluirTarefa, vincularEtiquetaNaTarefa
} from './model';

...

app.post('/:id/etiquetas/:etiqueta', async (req, resp) => {
  const { id, etiqueta } = req.params as { id: string, etiqueta: string };
  const idTarefa = Number(id);
  await vincularEtiquetaNaTarefa(req.usuario, idTarefa, etiqueta);
  resp.status(204);
});
```

Nota: é possível passar caracteres especiais dessa forma. Basta passar o resultado da chamada JavaScript `encodeURIComponent(etiquetaComCaracteresEspeciais)`. Por exemplo:

```js
> encodeURIComponent("grupo/item")
< 'grupo%2Fitem'
```

Pare um momento e analise o que ocorre se o código que insere o vínculo entre tarefa e etiqueta falhar. Você pode ter chegado à conclusão que a etiqueta vai permanecer cadastrada. Isso ocorre pois o endpoint não está se comportando de maneira atômica. Neste caso pode parecer inofensivo, mas nem sempre será assim (pense em uma situação mais complicada envolvendo por exemplo saques e depósitos bancários).

Sistemas de gerenciamento de bancos de dados relacionais trazem um mecanismo que permite tornar vários comandos SQL atômicos. Esse conceito é o conceito de transações. A ideia é que você abra uma transação, execute os comandos, e eventualmente confirme (faça o `commit`) ou reverta tudo (fazendo o `rollback`).

O Knex oferece transações através dos métodos `knex.transaction(async trx => {})` e `knex.transacting(trx)`. O primeiro cria uma transação e, ao final da promise, faz o commit ou rollback dependendo do fato de ter ocorrido algum erro ou não. O método `transacting` permite que uma operação entre em uma `trx` existente. A instância `trx` se comporta como um objeto `knex`, ou seja é possível chamar `select`, `insert` etc direto nela.

Com base nisso qual seria a melhor maneira de desenhar o suporte a transações no nosso model? Lembre-se que queremos que garantir que todas as operações chamadas para atender determinada requisição participem da mesma transação. Existe um padrão de projeto muito bom nessas horas que é o `Unit of Work`. A ideia é criar um objeto que acompanha toda a chamada ao redor da camada de modelo, e esse objeto é usado sempre que uma operação de banco de dados precisa descobrir qual transação participar. Comece instalando a biblioteca `fastify-plugin`:

```sh
$ npm i fastify-plugin
```

Agora crie um arquivo chamado `core/uow.ts`:

```ts
import { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

import knex from '../shared/querybuilder';


export default fastifyPlugin(async (app: FastifyInstance) => {
  app.decorateRequest('uow', null);

  app.addHook('preHandler', (req, _, done) => {
    knex.transaction(trx => {
      req.uow = trx;
      done();
    });
  });

  app.addHook('onSend', async (req) => {
    if (!req.uow.isCompleted()) {
      console.log('commit');
      await req.uow.commit();
    }
  });

  app.addHook('onError', async (req) => {
    console.log('rollback');
    await req.uow.rollback();
  });

});
```

Instale-o no arquivo `app.ts`:

```ts
import uowPlugin from './core/uow';

...

app.decorateRequest('usuario', null);
app.register(uowPlugin);
```

A ideia aqui é enriquecer as requisições que chegam no Fastify com uma transação Knex. Ao final da requisição, se tudo deu certo, efetuamos um commit, caso contrário, um rollback é emitido.

A partir desse ponto *todas* as rotas e *todos* os métodos da camada de modelo precisam ser ajustados da seguinte forma:

1. Passar `req.uow` como último parâmetro em todas as chamadas para a camada de modelo.
2. Receber `uow: Knex` na definição dos métodos da camada de modelo e usá-lo no lugar do `knex`.

Exemplo para o vínculo de etiqueta:

```ts
app.post('/:id/etiquetas/:etiqueta', async (req, resp) => {
  const { id, etiqueta } = req.params as { id: string, etiqueta: string };
  const idTarefa = Number(id);
  await vincularEtiquetaNaTarefa(req.usuario, idTarefa, etiqueta, req.uow);
  resp.status(204);
});
```

```ts
export async function vincularEtiquetaNaTarefa(
  usuario: Usuario | null, id: IdTarefa,
  etiqueta: string, uow: Knex
): Promise<void> {
  if (usuario === null) {
    throw new UsuarioNaoAutenticado();
  }
  await asseguraExistenciaDaTarefaEAcessoDeEdicao(usuario, id, uow);
  const idEtiqueta = await cadastrarEtiquetaSeNecessario(etiqueta, uow);
  await uow('tarefa_etiqueta')
    .insert({
      id_tarefa: id,
      id_etiqueta: idEtiqueta,
    })
    .onConflict(['id_tarefa', 'id_etiqueta']).ignore();
}
```

(note que o código acima assume que o mesmo já foi feito para os métodos `asseguraExistenciaDaTarefaEAcessoDeEdicao` e `cadastrarEtiquetaSeNecessario`).

Dica: remova todos os imports do tipo `import knex from '../shared/querybuilder'` dos arquivos `model.ts`. Eles não devem mais ser utilizados já que todas as chamadas devem ser feitas usando a instância `uow`, e não mais diretamente usando a instância `knex` exposta no módulo `querybuilder.ts`.

Existem outras abordagens além da unidade de trabalho para compartilhamento de transação na camada de modelo:

- Uma transação por thread (funciona em plataformas e frameworks onde uma request é atendida por completo em uma única thread);
- "Decorators", "anotações" nos métodos demarcando fronteiras de transação.

Um enorme benefício da unidade de trabalho, como veremos adiante, é a facilidade com que ela permite a implementação de testes unitários e de integração.

Vamos implementar agora o endpoint `DELETE /tarefas/:id/etiquetas/:etiqueta`. Note que, se for a última utilização da etiqueta, queremos excluí-la! Comece adicionando duas funções no arquivo `etiquetas/model.ts`: `removerEtiquetaSeObsoleta` e `buscarIdDaEtiquetaPelaDescricao`:

```ts
import { DadosOuEstadoInvalido } from '../shared/erros';

...

export async function buscarIdDaEtiquetaPelaDescricao(
  descricao: string, uow: Knex
): Promise<number> {
  const res = await uow('etiquetas')
    .select('id')
    .where('descricao', descricao)
    .first();
  if (res === undefined) {
    throw new DadosOuEstadoInvalido('Etiqueta não encontrada', {
      codigo: 'ETIQUETA_NAO_ENCONTRADA'
    });
  }
  return res.id;
}

export async function removerEtiquetaSeObsoleta(
  id: number, uow: Knex
): Promise<void> {
  // pequena dependência circular aqui
  // visto que o conceito de etiquetas
  // está dependendo do conceito de tarefas
  const res = await uow('tarefa_etiqueta')
    .count('id_tarefa')
    .where('id_etiqueta', id)
    .first();
  // infelizmente esse count é uma string e não um number
  if (res === undefined || res.count === '0') {
    await uow('etiquetas')
      .where('id', id)
      .delete();
  }
}
```

Adicione agora a função `desvincularEtiquetaDaTarefa` no arquivo `tarefas/model.ts`:

```ts
import {
  cadastrarEtiquetaSeNecessario, buscarIdDaEtiquetaPelaDescricao,
  removerEtiquetaSeObsoleta
} from '../etiquetas/model';

...

export async function desvincularEtiquetaDaTarefa(
  usuario: Usuario | null, id: IdTarefa,
  etiqueta: string, uow: Knex
): Promise<void> {
  if (usuario === null) {
    throw new UsuarioNaoAutenticado();
  }
  await asseguraExistenciaDaTarefaEAcessoDeEdicao(usuario, id, uow);
  const idEtiqueta = await buscarIdDaEtiquetaPelaDescricao(etiqueta, uow);
  await uow('tarefa_etiqueta')
    .delete()
    .where({
      id_tarefa: id,
      id_etiqueta: idEtiqueta,
    });
  await removerEtiquetaSeObsoleta(idEtiqueta, uow);
}
```

E por fim exponha o endpoint no arquivo `tarefas/router.ts`:

```ts
import {
  consultarTarefaPeloId, cadastrarTarefa, consultarTarefas,
  DadosTarefa, concluirTarefa, reabrirTarefa, alterarTarefa,
  excluirTarefa, vincularEtiquetaNaTarefa, desvincularEtiquetaDaTarefa
} from './model';

...

app.delete('/:id/etiquetas/:etiqueta', async (req, resp) => {
  const { id, etiqueta } = req.params as { id: string, etiqueta: string };
  const idTarefa = Number(id);
  await desvincularEtiquetaDaTarefa(req.usuario, idTarefa, etiqueta, req.uow);
  resp.status(204);
});
```

[Exercício 04_endpoints_de_suporte](exercicios/04_endpoints_de_suporte/README.md)
