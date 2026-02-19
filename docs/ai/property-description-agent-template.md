# Template do agente de descricao de imovel

Este template e o contrato exato que o botao `Gerar com IA` envia para um agente externo.

## 1) Configuracao (server)

Defina no `.env`:

```env
PROPERTY_COPY_AGENT_URL=https://seu-endpoint-do-agente.com/webhook/property-copy
PROPERTY_COPY_AGENT_TOKEN=seu_token_opcional
```

- `PROPERTY_COPY_AGENT_URL`: endpoint POST do seu agente.
- `PROPERTY_COPY_AGENT_TOKEN`: opcional. Se existir, vai no header `Authorization: Bearer ...`.

## 2) Payload recebido pelo agente (POST body)

```json
{
  "task": "property_marketing_copy",
  "locale": "pt-BR",
  "property_id": "uuid-do-imovel",
  "data_paths": {
    "property_table": "public.properties",
    "category_table": "public.property_categories",
    "media_table": "disabled_for_now",
    "media_bucket": "disabled_for_now",
    "request_context": "input.context"
  },
  "data": {
    "property": {
      "purpose": "sale|rent|null",
      "title": "titulo atual",
      "city": "cidade",
      "neighborhood": "bairro",
      "address": "endereco",
      "area_m2": 120,
      "land_area_m2": 200,
      "built_area_m2": 150,
      "bedrooms": 3,
      "bathrooms": 2,
      "suites": 1,
      "parking": 2,
      "price": 950000,
      "rent_price": null,
      "condo_fee": 1200,
      "condition": "novo|usado|null",
      "usage": "residencial|comercial|null",
      "property_standard": "alto|medio|null"
    },
    "category": {
      "name": "Apartamento"
    },
    "portal_profile": "general|olx|zap|vivareal",
    "selected_features": [
      "Localizacao e Entorno: Sol da manha",
      "Estrutura e Layout: Varanda gourmet"
    ],
    "broker_base_description": "Texto inicial escrito pelo corretor para ser otimizado."
  }
}
```

## 3) Resposta esperada do agente

Retorne JSON com `title` e `description`:

```json
{
  "title": "Titulo comercial objetivo",
  "description": "Descricao premium, clara e sem inventar dados."
}
```

Tambem aceita:

```json
{
  "data": {
    "title": "Titulo",
    "description": "Descricao"
  }
}
```

## 4) Prompt base para o seu agente

Use este texto como instrucao principal do agente:

```text
Voce e especialista em copy imobiliaria premium no Brasil.
Tarefa: gerar titulo e descricao comercial para anuncio de imovel.
Regras:
- Nao inventar dados ausentes.
- Priorizar clareza, escaneabilidade e conversao.
- Linguagem profissional, elegante e objetiva.
- Incluir localizacao, tipologia, metragens, dormitorios, vagas e preco quando existirem.
- Respeitar o perfil do portal em `data.portal_profile`.
- Aproveitar `data.selected_features` como diferenciais reais do imovel.
- Reescrever e melhorar `data.broker_base_description` sem inventar fatos.
- Retornar somente JSON valido com chaves: title, description.
Limites:
- title: maximo 110 caracteres.
- description: maximo 2400 caracteres.
```

## 5) Onde o botao chama isso no app

- Botao: `app/(crm)/properties/[id]/PropertyFullEditorClient.tsx`
  - label: `Gerar com IA`
  - handler: `handleGenerateWithAI`
- Server action: `app/(crm)/properties/[id]/actions.ts`
  - funcao: `generatePropertyMarketingCopy`

Com `PROPERTY_COPY_AGENT_URL` definido, o botao ja passa a usar o seu agente automaticamente.
