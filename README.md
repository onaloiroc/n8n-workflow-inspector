# n8n-workflow-inspector

CLI que lê um workflow do n8n pela API pública e imprime um resumo em JSON:
nós, tipos, quantidade e pontos de entrada.

## Por que existe

Trabalhar n8n pela interface não escala. Numa instância com centenas de fluxos,
responder "o que esse workflow faz?" significa abrir a tela, arrastar o canvas e
ler nó por nó. Baixar o JSON inteiro também não resolve — um fluxo de 30 nós
passa de 50 KB, quase tudo posição de tela e parâmetro default.

Este script traz só o esqueleto, direto no terminal.

## Uso

```bash
export N8N_API_KEY="sua-chave"
export N8N_BASE_URL="https://seu-n8n.exemplo.com"

node inspect-workflow.js <workflowId>
node inspect-workflow.js <workflowId> --full      # inclui as conexões
node inspect-workflow.js <workflowId> | jq .nodeTypes
```

## Saída

```json
{
  "id": "AbC123",
  "name": "Régua de cobrança",
  "active": true,
  "nodeCount": 34,
  "nodeTypes": { "if": 6, "code": 3, "httpRequest": 2, "microsoftSql": 2 },
  "nodes": [
    { "name": "Webhook", "type": "n8n-nodes-base.webhook", "disabled": false }
  ],
  "entryPoints": ["Webhook"]
}
```

`nodeTypes` é o campo mais útil no dia a dia: dá a forma do fluxo numa linha.
Muito `if` indica lógica de negócio espalhada pelo canvas em vez de concentrada
num nó de código. Muito `httpRequest` indica integração sem conector nativo.

## Detalhes de implementação

**Dois modos de autenticação.** Instâncias recentes usam `X-N8N-API-KEY`;
algumas aceitam `Authorization: Bearer`. O script tenta os dois — mas só insiste
quando a falha é 401 ou 403. Em qualquer outro status, repetir não melhora nada.

**Diagnóstico vai para stderr.** O `stdout` fica só com o JSON, então dá para
mandar direto num `| jq` sem filtrar ruído.

**Erro mostra o corpo da resposta.** Quando a API do n8n falha, a mensagem útil
quase sempre está no corpo, não no status.

## Requisitos

Node.js 18 ou superior. Sem dependências — usa o `fetch` nativo, com fallback
para `node-fetch` em versões antigas.

## Licença

MIT
