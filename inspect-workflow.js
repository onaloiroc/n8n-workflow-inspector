#!/usr/bin/env node
'use strict';

/**
 * Inspeciona um workflow do n8n pela API pública e imprime um resumo em JSON.
 *
 * Trabalhar n8n pela interface não escala: para saber o que um fluxo faz é
 * preciso abrir, navegar e ler nó por nó. Este script traz o essencial pelo
 * terminal — nós, tipos e conexões — sem baixar o JSON inteiro.
 *
 * Uso:
 *   N8N_API_KEY=... N8N_BASE_URL=https://seu-n8n.exemplo.com \
 *     node inspect-workflow.js <workflowId>
 */

const DEFAULT_BASE_URL = 'https://n8n.exemplo.com';

async function getFetch() {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }
  try {
    const mod = await import('node-fetch');
    return mod.default;
  } catch {
    throw new Error(
      'fetch indisponível neste Node e node-fetch não está instalado. ' +
      'Use Node 18+ ou instale com: npm install node-fetch',
    );
  }
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    workflowId: '',
    baseUrl: process.env.N8N_BASE_URL || DEFAULT_BASE_URL,
    full: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === '--workflow' || arg === '--id') {
      out.workflowId = args[i + 1] || '';
      i += 1;
    } else if (arg === '--base-url') {
      out.baseUrl = args[i + 1] || out.baseUrl;
      i += 1;
    } else if (arg === '--full') {
      out.full = true;
    } else if (!arg.startsWith('--') && !out.workflowId) {
      out.workflowId = arg;
    }
  }
  return out;
}

function validateInput({ workflowId, baseUrl }) {
  if (!workflowId.trim()) {
    throw new Error('workflowId não informado. Uso: node inspect-workflow.js <workflowId>');
  }
  if (!process.env.N8N_API_KEY || !process.env.N8N_API_KEY.trim()) {
    throw new Error('Variável de ambiente N8N_API_KEY não definida.');
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error(`N8N_BASE_URL inválida: "${baseUrl}". Exemplo: https://n8n.exemplo.com`);
  }
}

async function readBody(res) {
  const raw = await res.text();
  try {
    return { raw, json: raw ? JSON.parse(raw) : null };
  } catch {
    return { raw, json: null };
  }
}

/**
 * Resumo do fluxo: o que interessa para entender a forma dele sem abrir a tela.
 */
function buildSummary(wf, { full }) {
  const nodes = Array.isArray(wf.nodes) ? wf.nodes : [];

  const byType = nodes.reduce((acc, node) => {
    const short = String(node.type).split('.').pop();
    acc[short] = (acc[short] || 0) + 1;
    return acc;
  }, {});

  const summary = {
    id: wf.id,
    name: wf.name,
    active: wf.active,
    createdAt: wf.createdAt,
    updatedAt: wf.updatedAt,
    nodeCount: nodes.length,
    nodeTypes: Object.fromEntries(
      Object.entries(byType).sort((a, b) => b[1] - a[1]),
    ),
    nodes: nodes.map((node) => ({
      name: node.name,
      type: node.type,
      disabled: Boolean(node.disabled),
    })),
    entryPoints: Object.keys(wf.connections || {}),
  };

  if (full) summary.connections = wf.connections;
  return summary;
}

/**
 * Instâncias diferentes aceitam cabeçalhos diferentes: as recentes usam
 * X-N8N-API-KEY, algumas aceitam Bearer. Tenta os dois antes de desistir, e
 * só insiste quando a falha é de autenticação.
 */
async function fetchWorkflow(fetchFn, baseUrl, workflowId, apiKey) {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/v1/workflows/${encodeURIComponent(workflowId)}`;
  const attempts = [
    { label: 'X-N8N-API-KEY', headers: { Accept: 'application/json', 'X-N8N-API-KEY': apiKey } },
    { label: 'Authorization Bearer', headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` } },
  ];
  const errors = [];

  for (const attempt of attempts) {
    const res = await fetchFn(url, { method: 'GET', headers: attempt.headers });
    const body = await readBody(res);

    if (res.ok) {
      if (!body.json || typeof body.json !== 'object') {
        throw new Error(`Resposta não é JSON válido (${attempt.label}): ${body.raw.slice(0, 200)}`);
      }
      return { authMode: attempt.label, workflow: body.json };
    }

    errors.push(`[${attempt.label}] HTTP ${res.status} ${res.statusText} — ${body.raw || 'resposta vazia'}`);

    // 401/403 pode ser só o cabeçalho errado; qualquer outro status não melhora tentando de novo.
    if (![401, 403].includes(res.status)) break;
  }

  throw new Error(`Falha ao consultar o workflow ${workflowId}.\n\n${errors.join('\n')}`);
}

async function main() {
  const opts = parseArgs(process.argv);
  validateInput(opts);

  const fetchFn = await getFetch();

  // Diagnóstico vai para stderr: stdout fica limpo para `| jq`.
  console.error(`workflow: ${opts.workflowId}`);
  console.error(`base url: ${opts.baseUrl}`);

  const { authMode, workflow } = await fetchWorkflow(
    fetchFn,
    opts.baseUrl,
    opts.workflowId,
    process.env.N8N_API_KEY.trim(),
  );

  console.error(`auth aceita: ${authMode}\n`);
  console.log(JSON.stringify(buildSummary(workflow, opts), null, 2));
}

main().catch((err) => {
  console.error(`\nErro: ${err.message}`);
  process.exit(1);
});
