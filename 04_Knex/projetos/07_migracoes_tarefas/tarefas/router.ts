import { FastifyInstance, FastifySchema } from 'fastify';

import {
  consultarTarefaPeloId, cadastrarTarefa, consultarTarefas,
  DadosTarefa, concluirTarefa, reabrirTarefa, alterarTarefa,
  excluirTarefa
} from './model';

export default async (app: FastifyInstance) => {

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

  app.post('/', { schema: postSchema }, async (req, resp) => {
    const dados = req.body as DadosTarefa;
    const id = await cadastrarTarefa(req.usuario, dados);
    resp.status(201);
    return { id };
  });
  
  app.get('/', async (req, resp) => {
    const { termo } = req.query as { termo?: string };
    const tarefas = await consultarTarefas(req.usuario, termo);
    return tarefas;
  });
  
  app.get('/:id', async (req, resp) => {
    const { id } = req.params as { id: string };
    const idTarefa = Number(id);
    const tarefa = await consultarTarefaPeloId(req.usuario, idTarefa);
    return {
      descricao: tarefa.descricao,
      data_conclusao: tarefa.data_conclusao,
      id_categoria: tarefa.id_categoria,
    };
  });

  app.patch('/:id', async (req, resp) => {
    const { id } = req.params as { id: string };
    const idTarefa = Number(id);
    const alteracoes = req.body as Partial<DadosTarefa>;
    await alterarTarefa(req.usuario, idTarefa, alteracoes);
    resp.status(204);
  });

  app.post('/:id/concluir', async (req, resp) => {
    const { id } = req.params as { id: string };
    const idTarefa = Number(id);
    await concluirTarefa(req.usuario, idTarefa);
    resp.status(204);
  });

  app.post('/:id/reabrir', async (req, resp) => {
    const { id } = req.params as { id: string };
    const idTarefa = Number(id);
    await reabrirTarefa(req.usuario, idTarefa);
    resp.status(204);
  });

  app.delete('/:id', async (req, resp) => {
    const { id } = req.params as { id: string };
    const idTarefa = Number(id);
    await excluirTarefa(req.usuario, idTarefa);
    resp.status(204);
  });

}
