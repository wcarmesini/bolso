# Bolso

Sistema de **orçamento colaborativo**: **leve, rápido, bonito e em tempo real** para várias pessoas (casal, família, república…) usando ao mesmo tempo. A web é a plataforma principal, e o app também pode ser instalado no celular como PWA.

> **Última atualização:** 21/09/2026. Este README é a referência do projeto. Quando uma decisão mudar, atualize aqui junto com o código.

---

## Situação atual

| Parte | Situação |
|---|---|
| Interface web (`apps/web`) | ✅ Navegação, tema, busca e PWA |
| API (`apps/api`) | ✅ Hono + Drizzle + WebSocket, com login, grupos e as cinco entidades |
| Banco de dados | ✅ PostgreSQL pelo Drizzle. Para desenvolver roda **PGlite** (Postgres embutido), sem instalar nada |
| Tipos e validações compartilhados (`packages/shared`) | ✅ Um Zod só, válido para o front e para a API |
| Tempo real | ✅ WebSocket por grupo, testado com duas pessoas: a mudança aparece na outra tela em ~15ms |
| Login | ✅ Sessões com Better Auth. **Google configurado** (em desenvolvimento); faltam Apple e Microsoft (ver [Pendências](#pendências)). A tela de login só tem os botões dos provedores |
| Grupos | ✅ Grupo pessoal no primeiro acesso, convite por link, troca de grupo |
| Ajustes | ✅ Perfil, Grupo, Categorias, Contas, Contatos, Integrações e Chaves de API, tudo gravando no banco |
| **Lançamentos** | ✅ Cartão de crédito com fatura, compras parceladas, lançamento dividido em categorias, cópia de lançamento e contato, em tempo real |
| **Importar extrato (OFX)** | ✅ Lê o arquivo do banco, concilia com o que já foi lançado e importa o resto |
| **Banco conectado (Open Finance)** | ✅ Pluggy. O Bolso busca sozinho e o que chega **espera aprovação**; nada entra no orçamento sem alguém dizer que pode |
| **Chaves da API do Bolso** | ✅ Outro programa chama a nossa API com `Authorization: Bearer`, com permissão de leitura ou de escrita |
| **Orçamento** | ✅ Limite por categoria, valendo do mês em diante, com a barra de uso |
| **Relatórios** | ✅ Seis: fluxo de caixa, mês a mês por categoria, **evolução patrimonial**, gastos por categoria, orçado × realizado e gastos por pessoa |
| **Rastro e lixeira** | ✅ Quem criou, quem mudou o quê e quando. Excluir marca em vez de apagar, e a lixeira traz de volta |
| Painel | ⏳ Tela criada, ainda vazia |
| Instalação no celular (PWA) | ✅ Ícones, manifesto, service worker e convite de instalação |

---

## Visão geral

```
┌─────────────────────────┐        HTTP (gravações)       ┌──────────────────────┐
│  Web (SPA)              │ ────────────────────────────▶ │  API                 │
│  React + Tailwind       │                               │  Hono (Node)         │
│  TanStack Query (cache) │ ◀──────────────────────────── │  WebSocket por grupo │
└─────────────────────────┘   WebSocket (avisos ao vivo)   └──────────┬───────────┘
                                                                     │ Drizzle
                                                              ┌──────▼──────┐
                                                              │ PostgreSQL  │
                                                              └─────────────┘
```

É um único repositório (monorepo com pnpm) dividido em três partes:

- **`apps/web`**: a interface
- **`apps/api`**: o servidor
- **`packages/shared`**: os tipos e as validações usados pelos dois lados, para frontend e backend nunca divergirem

**Por que SPA e não Next.js:** o app fica todo atrás do login, então não precisa de SEO nem de renderização no servidor. Uma SPA é mais leve, mais simples e responde mais rápido depois de carregada.

---

## Tecnologias

✅ = já em uso · ⏳ = planejado

| Camada | Escolha | Por quê | |
|---|---|---|---|
| Frontend | React 19 + Vite 8 + TypeScript 7 | Rápido para desenvolver e para carregar | ✅ |
| Estilo | Tailwind CSS v4 + **shadcn/ui na versão Base UI** (preset `nova`) | Componentes bonitos e acessíveis, com o código dentro do projeto | ✅ |
| Ícones | Lucide | Vetoriais (nítidos em qualquer tela) e leves, só os usados entram no app | ✅ |
| Fonte | **Sofascore Sans** | O estilo "meio quadrado" do torneo.com (ver [Fonte](#fonte)) | ✅ |
| Rotas | TanStack Router (rotas por arquivo) | Rotas tipadas, sem link quebrado | ✅ |
| PWA | vite-plugin-pwa | Instalação no celular, abertura em tela cheia, carregamento offline da interface | ✅ |
| Qualidade | Biome | Lint e formatação numa ferramenta só, e muito rápida | ✅ |
| Dados na tela | TanStack Query | Cache, atualização otimista e integração com o tempo real | ✅ |
| Formulários | React Hook Form + Zod | Leves, com validação instantânea | ✅ |
| Gráficos | Barras em CSS (sem biblioteca) | Os relatórios só precisam de barras: desenhá-las com Tailwind mantém o app leve, sem os ~100 KB de uma biblioteca de gráficos | ✅ |
| Backend | Hono (Node) | Muito leve e rápido, com WebSocket nativo | ✅ |
| Validação | Zod | Um schema só vale para o formulário na tela e para a rota da API (`packages/shared`) | ✅ |
| Banco | PostgreSQL (PGlite para desenvolver) | Robusto com várias pessoas gravando ao mesmo tempo e ótimo para somas mensais. O PGlite é o mesmo Postgres embutido no Node, sem instalar nada | ✅ |
| ORM | Drizzle | Leve, SQL tipado, migrations simples | ✅ |
| Login | Better Auth | Sessões no próprio banco, e o plugin de "organizações" virou os **grupos com convite** | ✅ |
| Testes | Vitest | Rápido, e sobe a API de verdade contra um banco em memória | ✅ |
| Deploy | Docker Compose + Caddy | Um VPS barato com HTTPS automático | ⏳ |

---

## Como funciona o tempo real

Esse é o coração da proposta:

1. A Ana lança "Mercado R$ 250". A tela dela atualiza na hora.
2. A API grava no banco e **avisa pelo WebSocket** só quem está no mesmo grupo.
3. Na tela do João, o lançamento aparece e a barra do orçamento de "Mercado" sobe. Sem recarregar e sem ficar perguntando ao servidor de tempos em tempos.
4. Se a conexão cair, o app reconecta sozinho e busca tudo de novo.

**O detalhe que faz isso ser simples:** o servidor **não manda os dados** pelo WebSocket. Ele manda só um aviso do que mudou:

```json
{ "type": "invalidate", "resources": ["transactions", "budgets"], "actorId": "..." }
```

Quem recebe marca aquela lista como velha e busca de novo pela API. Assim a tela sempre mostra o que está no banco, não uma cópia montada de pedaços — e nunca há dois caminhos de gravação para dar manutenção. As gravações vão por HTTP comum, que é mais fácil de validar e depurar.

**Como está feito:**

- `/api/ws` aceita a conexão usando o **cookie da sessão**. Sem sessão válida, recusa (código 4401) e o app sabe que precisa entrar de novo.
- O `RealtimeHub` guarda as conexões **por grupo**. Um aviso de um grupo não chega a outro — há um teste só para isso.
- Quem recebe o aviso ignora o que ele mesmo acabou de fazer (`actorId`), para não buscar duas vezes.
- Ping e pong de tempos em tempos derrubam conexões mortas, que acontecem quando a rede cai sem avisar.
- Ao reconectar, o app espera um pouco mais a cada tentativa (até 10s) e, quando volta, **busca tudo**: o que perdeu enquanto estava fora já chega junto.

**No celular:** o iOS desliga o WebSocket quando o app vai para segundo plano. Ao voltar (ou quando a internet retorna), o app reconecta e busca o que mudou.

---

## Regras de base

Valem desde o primeiro dia:

- **Valores em centavos inteiros**, nunca float: R$ 10,50 vira `1050`. Assim não há erro de arredondamento. O campo `MoneyInput` já digita assim, como em app de banco.
- **Tudo filtrado por grupo no backend**, para ninguém ver dados de outro grupo.
- **Uma validação só:** o schema Zod fica em `packages/shared` e vale para o formulário e para a rota. Nada de validar duas vezes, de dois jeitos.
- **Um componente por campo, ligado só ao próprio valor** (`useController`/`useWatch` em `transaction-form-fields.tsx`): digitar o valor não repinta categoria, conta nem contato — o formulário inteiro nunca re-renderiza por causa de uma tecla. O que é caro de montar (o calendário) entra sob demanda, com `lazy()`.
- **Datas sempre pelas partes locais** (`lib/dates.ts`), nunca `toISOString()`: ele converte para UTC e um lançamento feito às 22h cairia no dia seguinte.
- **Formulários com fonte de 16px no celular.** Abaixo disso, o iPhone dá zoom automático ao tocar no campo. O `Input` do shadcn já faz isso.
- **Nunca `window.confirm()`.** Exclusões usam o `ConfirmDeleteDialog`.
- **Todo campo vem do shadcn**, nunca do navegador: data usa o `DateField` (Popover + Calendar, em português, com mês e ano em lista), mês usa o `MonthPicker`, e categoria usa o `CategoryPicker` com busca. Os campos nativos (`<input type="date">`, `type="month"`) trazem a caixa e o ícone do navegador e destoam do resto.
- **Ações de cada linha** (`RowActions`): no computador, ícones pequenos e juntos ✏️ ＋ 🗑️ **logo após o nome, só com o mouse sobre a linha**; no celular, **tocar na linha abre um menu** com as mesmas ações. Nada fica visível em todas as linhas. A linha precisa de `group/row relative`.
- **Só o conteúdo rola**, entre a barra superior e as abas (`AppShell`): a barra de rolagem começa abaixo do menu, que ocupa sempre a largura toda. O espaço da barra fica reservado dos dois lados do conteúdo (`scrollbar-gutter: stable both-edges`), então nada pula para o lado e o conteúdo segue alinhado com o menu. Barra fina, nas cores do tema. Ao trocar de tela, o conteúdo volta ao topo (`scrollToTopSelectors` do router).

---

## Banco de dados

Tudo em **PostgreSQL**, com **Drizzle** para o SQL tipado e as migrations.

- **Para desenvolver não é preciso instalar nada:** sem `DATABASE_URL`, a API sobe com **PGlite**, um Postgres de verdade embutido no Node, gravando em `apps/api/.data/pglite`. Para começar do zero, basta apagar essa pasta.
- **Em produção**, a mesma `DATABASE_URL` liga num Postgres normal (driver `postgres-js`). O código das consultas é o mesmo nos dois casos.
- As migrations ficam em `apps/api/drizzle/` e rodam sozinhas quando a API sobe. Para gerar uma nova depois de mexer no schema: `pnpm --filter api db:generate`.

**Tabelas do app** (`apps/api/src/db/schema/app.ts`):

| Tabela | Para quê |
|---|---|
| `categories` | Mercado, Moradia… `parent_id` nulo = principal (tem ícone e cor); preenchido = subcategoria (um nível só). `icon` e `color` são **texto**, não enum: a cor é um hex livre e a lista de ícones cresce sem migração. `position` guarda a ordem escolhida arrastando |
| `accounts` | Conta corrente, poupança, cartão, dinheiro, investimento, com saldo inicial em centavos. Cartão guarda `closing_day`, `due_day` e `limit_cents` |
| `integration_keys` | Chaves de serviços externos (Pluggy, IA…), **criptografadas** (ver [Segurança](#segurança)). `client_id` guarda a parte pública das chaves de Open Finance |
| `api_keys` | Chaves **da nossa API**, para outro programa entrar no lugar da pessoa. Fica só o hash (SHA-256): a chave inteira aparece uma vez, na criação |
| `bank_connections` | Uma conta do banco ligada a uma conta do Bolso (Pluggy). Guarda o `item_id`, o estado da conexão, a **data a partir da qual buscar** e a última busca |
| `pending_transactions` | **A caixa de entrada:** o que o banco mandou e ainda não virou lançamento. Aprovado ou dispensado, a linha fica marcada — é o que impede a busca seguinte de trazer tudo de novo |
| `import_batches` · `import_batch_items` | Cada confirmação e o que ela fez, linha por linha. É o que permite **desfazer** uma leva inteira em vez de apagar lançamento por lançamento |
| `transaction_sources` | **A conciliação:** a ligação entre um lançamento e o movimento que o banco confirmou. Tabela à parte, e não um campo, porque o mesmo movimento pode chegar pelo extrato **e** pelo Open Finance — com um campo só, a segunda origem viraria um lançamento repetido |
| `audit_log` | O rastro: quem fez o quê, em que coisa, e **o que mudou** (campo, de, para). É daqui que sai "você criou, a Débora trocou a descrição na terça" |
| `transactions` | Valor, tipo, conta, contato, **data da compra**, **data do pagamento** e quem lançou. `origin` diz se foi digitado ou importado, e `external_id` guarda o identificador do banco (FITID). No cartão, `statement_month` (a fatura, pelo mês do vencimento). Parcelas: `installment_group_id`, `installment_number` e `installment_count` ("3 de 10"). `transfer_group_id` liga as duas pernas de uma transferência entre contas |
| `contacts` | Quem recebe ou paga (mercado, escola, cliente), com tipo, documento e observação |
| `transaction_splits` | **As partes do lançamento, uma por categoria.** Lançamento comum tem uma parte; dividido tem várias, somando o valor dele. A categoria mora aqui, não no lançamento |
| `budgets` | Orçamento de uma categoria (principal ou sub, de saída ou de entrada), **valendo do mês (`AAAA-MM`) em diante** até ser trocado. `limit_cents` nulo encerra o orçamento a partir daquele mês |
| `budget_items` | Detalhamento do orçamento ("Salário Débora", "Salário Wilson"). Havendo itens, o valor do orçamento é a soma deles |

**Tabelas de login e grupos** (`auth.ts`): `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`. São geradas pelo próprio Better Auth — **não edite à mão**; para atualizar, use `apps/api/scripts/auth-schema.config.ts` com o CLI dele.

**Regras que o banco garante sozinho:**

- **Toda tabela tem `group_id`** (a "organização" do Better Auth) e toda consulta filtra por ele. Apagar um grupo apaga os dados dele em cascata.
- **Valores em `bigint` de centavos**, nunca float.
- **Nome repetido é barrado pelo banco**, por índices únicos sobre `name_key` (nome sem acento e em minúsculas): "Mercado" e "mercado" são o mesmo nome. A API checa antes para dar uma mensagem clara, e o índice segura o caso raro de duas pessoas criando o mesmo nome no mesmo instante — esse erro vira um 409 com mensagem pronta.
- Apagar uma categoria principal apaga as subcategorias; apagar uma conta ou categoria usada num lançamento **não apaga o lançamento**, só deixa o campo vazio (a parte cai em "Sem categoria").
- **As partes somam o valor do lançamento**, sempre. A API recusa uma divisão que não feche e a mesma categoria duas vezes.
- **O mesmo lançamento do banco não entra duas vezes:** índice único por grupo, conta e `external_id`. Reimportar o arquivo é seguro.

**Migrations com dados:** a `0001` criou `transaction_splits` e **copiou a categoria de cada lançamento existente** para uma parte; só a `0002` removeu a coluna antiga. Foi ensaiada numa cópia do banco antes de rodar no de verdade.

---

## API

Tudo fica em `/api`, no mesmo domínio da web (em desenvolvimento o Vite repassa `/api` para a porta 3000). As respostas de erro saem sempre no formato `{ error, field? }`, e o front transforma `field` em mensagem ao lado do campo.

| Rota | O que faz |
|---|---|
| `GET /api/health` | Diz que a API está de pé |
| `GET /api/auth-providers` | Quais provedores de login estão configurados (a tela de login mostra só esses) |
| `/api/auth/*` | Login, sessão, grupos e convites (Better Auth) |
| `GET · PATCH /api/me` | Nome e foto de quem está logado, mais o grupo ativo |
| `/api/groups` | Membros, renomear, criar grupo, trocar de grupo ativo e convites |
| `/api/invitations/:id` (+ `/accept`) | Ver e aceitar um convite pelo link |
| `/api/categories` | Lista, cria, edita e exclui (inclusive subcategorias) |
| `/api/accounts` | Contas |
| `/api/integration-keys` | Chaves de serviços externos (Pluggy, IA…) |
| `/api/api-keys` | Chaves da API do Bolso: cria (devolve o token uma vez), lista e revoga |
| `/api/bank` | Bancos conectados e se já dá para conectar (chave do Pluggy cadastrada) |
| `/api/bank/connect-token` | Token do widget do Pluggy (30 min). O Client Secret **nunca** sai do servidor |
| `/api/bank/connections/:id/pending` | O que espera aprovação nesta conexão, já conciliado com o que existe |
| `/api/bank/connections/:id/approve` | Aprova, concilia, transfere ou dispensa cada linha da caixa de entrada |
| `/api/imports/history` | As últimas 50 importações, com o resumo do que cada uma fez |
| `/api/imports/history/:id/undo` | Desfaz uma importação inteira e devolve tudo para a fila |
| `/api/contacts` | Contatos do grupo |
| `/api/imports/ofx/preview` | Lê o extrato e classifica cada linha: nova, parecida com um lançamento existente, ou já importada |
| `/api/imports/ofx/confirm` | Aplica as decisões: cria, concilia ou ignora cada linha |
| `/api/transactions` | Lançamentos. `?month=` filtra o mês; `&accountId=` uma conta; `&view=statement` devolve **a fatura** do cartão que vence no mês. Criar com `installments: 10` gera as 10 parcelas numa transação só do banco. Editar aceita `?scope=one\|all` e excluir `?scope=one\|following\|all` (parcela, esta e as próximas, série inteira) |
| `/api/budgets` | `GET ?month=` devolve o limite que vale no mês (e desde quando); `PUT` define do mês em diante |
| `/api/reports/cash-flow?year=` | Entradas e saídas mês a mês, pelo dia em que o dinheiro se move |
| `/api/reports/net-worth?start=&count=&interval=` | O saldo de cada conta ao fim de cada período, o que se deve e o que sobra |
| `/api/transactions/:id/history` | O rastro de um lançamento |
| `/api/transactions/deleted` · `/:id/restore` | A lixeira e a volta |
| `/api/reports/monthly?start=&count=&interval=` | Cada categoria por período (tabela cruzada). `interval` junta meses: `month`, `quarter` ou `year` |
| `/api/reports/categories?month=&type=` | Total por categoria principal, com as subcategorias dentro |
| `/api/reports/budget?month=` | Orçado × realizado em árvore (principal com as subcategorias), separando saídas e entradas |
| `/api/reports/people?month=` | Quanto cada pessoa do grupo lançou |
| `POST /api/dev/sign-in` | Entra só com o nome e o e-mail, **sem tela**: existe para os testes automáticos. Nunca existe em produção, e **só responde a quem chama da própria máquina** (por causa do túnel, ver [Abrir no celular](#abrir-no-celular)) |

**Como está organizada:**

- `app.ts` monta tudo. Da linha `secured` para baixo, um único middleware (`requireGroup`) exige login **e** grupo ativo, e coloca `user` e `groupId` no contexto. Nenhuma rota precisa lembrar de filtrar: `groupId` já vem pronto e entra em toda consulta.
- Cada rota valida a entrada com o schema do `packages/shared` — **o mesmo** que o formulário usa na tela. Front e API não têm como divergir.
- Depois de gravar, a rota chama `notify(...)`, que avisa o grupo pelo WebSocket.
- `buildApp(deps)` recebe as dependências prontas, então os testes sobem a API inteira com um banco em memória.

**Regras de negócio que a API garante:** as categorias de um lançamento precisam ser do mesmo tipo dele (não dá para pôr salário numa categoria de despesa); no cartão, a data de pagamento é **calculada** (o vencimento da fatura), não informada; mudar o fechamento ou o vencimento de um cartão move as compras das faturas ainda abertas (as passadas ficam); o orçamento da principal e o das subcategorias precisam fechar (a soma das filhas não pode passar do orçamento próprio da principal, nem a principal ser baixada abaixo do que já foi orçado nelas); trocar o tipo de uma categoria arrasta as subcategorias junto, numa transação só; e um convite só pode ser aceito uma vez.

---

## Cartão, parcelas e divisão

As regras de dinheiro moram em `packages/shared` (`cards.ts`, `allocation.ts`, `dates.ts`), com testes próprios, porque é onde é fácil errar por um dia ou um centavo.

**Cartão de crédito**

- A conta do cartão tem **dia de fechamento**, **dia de vencimento** e **limite**.
- Cada compra cai sozinha na fatura certa. Regra dos bancos: compra **no dia do fechamento ou depois** já vai para a fatura seguinte. Fechamento no dia 31 vira o último dia do mês em fevereiro.
- A fatura é chamada pelo **mês do vencimento**, como as pessoas falam: "a fatura de outubro" é a que vence em outubro.
- As duas datas continuam separadas: o **orçamento** conta pela data da compra; o **fluxo de caixa** conta pelo vencimento da fatura, que é quando o dinheiro sai.
- É por isso que o mês a mês tem **regime**: em *competência* a compra conta no mês em que foi feita; em *caixa*, no mês em que o dinheiro sai — a fatura do cartão inteira pula para o mês do vencimento. Sem data de pagamento, vale a data da compra (`packages/shared/src/basis.ts`).
- Estorno ou cashback no cartão é lançado como receita nele e abate da fatura.

**Transferência entre contas**

- Dinheiro que só muda de lugar: sai de uma conta e entra em outra. No banco são **dois lançamentos** com o mesmo `transfer_group_id` — uma saída na origem e uma entrada no destino —, para o extrato de cada conta ficar certo.
- **Não é gasto nem ganho**, então fica de fora do orçamento, de todos os relatórios e do resumo do mês. Sem isso, guardar R$ 1.000 na poupança pareceria gastar e receber R$ 1.000 no mesmo dia.
- Nenhuma das pernas tem categoria — é justamente o que as mantém fora dos relatórios por categoria.
- Na lista, sem filtro de conta, aparece **uma linha só**, com o caminho ("Conta corrente → Poupança") e o valor em tom neutro. Filtrando por conta, cada lado aparece no extrato dela, como num banco.
- Editar e excluir valem para as duas pernas ao mesmo tempo: meia transferência não existe.

**Importar extrato (OFX)**

- O leitor deixa de fora as **linhas de saldo** que vários bancos mandam como se fossem lançamentos ("Saldo do dia", "Saldo Anterior"): são a foto da conta, não dinheiro entrando ou saindo. A tela diz quantas foram ignoradas, para ninguém achar que sumiu algo.
- **Fecha a conta do extrato**: saldo anterior mais o movimento tem que dar o saldo final que o banco informa. Quando fecha, a tela diz — é a prova de que nada se perdeu na leitura.
- **FITID vazio ou repetido** (os dois acontecem) ganha um identificador derivado da própria linha, estável entre importações: nenhuma linha some por colidir com outra.
- Quando o banco manda em `DTSTART`/`DTEND` o dia da exportação em vez do período, **as datas dos lançamentos é que valem**.
- A descrição junta o que o banco separa: `NAME` é o tipo da linha ("Pix - Enviado") e `MEMO` tem o resto, do qual saem a data, a hora e o CPF/CNPJ que vêm na frente do nome.
- A codificação é decidida **pelo conteúdo**, não pelo cabeçalho: o arquivo é lido como UTF-8 estrito e, se os bytes não formarem UTF-8 válido, vale windows-1252. Cabeçalho de OFX erra e mente, e errar aqui estraga todo acento ("Aplicação" virando "AplicaÃ§Ã£o").
- **O par é escolhido pelo conjunto, não pela ordem do arquivo.** Cada combinação possível (linha do extrato × lançamento já feito) recebe uma nota — distância entre as datas e palavras em comum nas descrições — e os melhores pares são fixados primeiro, no arquivo inteiro. Do jeito antigo, a primeira linha escolhia primeiro e levava um lançamento que combinava muito mais com outra logo abaixo; as duas saíam erradas.
- **Nenhum palpite é definitivo.** Cada linha tem um `✕` para desfazer o par e um **Trocar par**, que abre a lista dos lançamentos do período — os de mesmo valor em cima, marcados, e busca por descrição ou valor. Um lançamento pertence a uma linha só: escolhê-lo aqui o solta de onde estava, sem precisar desfazer nada antes. A conta de "sem par" acompanha as escolhas na hora.
- A tela separa o extrato em **já parecem lançados**, **novos** e **já importados antes**, com a linha que vai ser conciliada destacada e ligada ao lançamento existente. E mostra, à parte, **o que está no Bolso e não apareceu no extrato** — é ali que aparece o valor digitado errado, a conta trocada ou a compra que o banco ainda não processou.

**Parcelado**

- 10x viram **10 lançamentos ligados**, um por mês, com a mesma data do mês (31/01 → 28/02). Os centavos que sobram vão nas primeiras: R$ 100 em 3x = 33,34 + 33,33 + 33,33.
- No cartão, cada parcela cai na fatura do mês dela. Fora do cartão, só a 1ª pode sair paga; as outras ficam "a pagar".
- Cada parcela conta no orçamento do mês dela, que é como o dinheiro realmente sai.
- **Editar** pergunta: só esta parcela, ou todas (descrição, conta e categorias mudam na série; valor e datas, só na editada). **Excluir** pergunta: só esta, esta e as próximas (compra cancelada ou quitada antes), ou todas.

**Dividir em categorias**

- "Dividir em categorias" no formulário abre uma linha por categoria com o valor de cada uma — R$ 300 no atacadão = 250 de Mercado + 50 de Restaurante. O campo mostra quanto falta distribuir.
- Parcelado e dividido juntos: cada parcela é repartida na mesma proporção, sem perder centavo (método do maior resto).
- Relatórios e orçamento somam as partes: cada categoria recebe exatamente o pedaço dela.

**Sobre o pagamento da fatura:** ele não precisa ser lançado como despesa — as compras já são as despesas, e lançá-lo de novo contaria duas vezes. Quem quiser registrar o dinheiro saindo da conta corrente usa uma **transferência** (abaixo), que não entra em relatório nem em orçamento. **O que ainda ficou de fora:** saldo por conta.

---

## Trazer do banco: conectado ou por arquivo

São dois caminhos para a mesma pergunta — *isto é novo, ou já está lançado?* — e a tela de
conferência (`/importar`) é a mesma para os dois.

**Banco conectado (Open Finance, via Pluggy).** A pessoa cadastra o Client ID e o Client
Secret em *Ajustes → Integrações*, conecta o banco pelo widget do Pluggy e diz qual conta de
lá é qual conta daqui — e **desde quando** buscar, para a caixa de entrada não nascer com dois
anos de histórico. Daí em diante o Bolso busca sozinho a cada 30 minutos.

O que ele acha **não entra no orçamento**: fica na caixa de entrada esperando aprovação, com o
palpite de conciliação já feito. Um aviso discreto aparece na barra de cima quando há algo
esperando. Aprovar cria o lançamento, conciliar gruda no que já existia, e dispensar descarta —
nos três casos a linha fica marcada no banco de dados, e é isso que impede a busca seguinte de
trazer tudo de novo.

Duas regras do lado do servidor: o **Client Secret nunca sai dele** (o navegador recebe apenas
um `connectToken` de 30 minutos), e cada busca reconfere os **últimos 7 dias** além do que
ainda não viu, porque banco mexe no que mandou há pouco (muda a descrição, ajusta o valor de
uma compra internacional).

**Depois × Dispensar.** São coisas diferentes, e a tela diz qual é qual. *Depois* deixa a
linha como está: ela não entra na confirmação e continua esperando na próxima vez. *Dispensar*
resolve a linha para sempre — sai da fila e não volta, porque aquilo não interessa. No extrato
OFX só existe *Ignorar*, que é ficar de fora daquela importação: o arquivo continua no
computador e pode ser lido de novo.

**Histórico, com volta.** Cada confirmação vira um lote (`import_batches`), com o que ela fez e
o suficiente para andar para trás. **Desfazer** apaga os lançamentos que nasceram dali (a
transferência perde as duas pernas), solta os que foram conciliados — o lançamento fica, só
perde o vínculo com o banco — e devolve tudo para a fila, inclusive o que foi dispensado. O que
alguém já tinha apagado na mão é contado à parte, em vez de fazer o desfazer inteiro falhar.

**Uma compra, duas cobranças.** Acontece: a pessoa paga a carne, decide levar mais um pedaço,
e o banco cobra duas vezes — mas no Bolso existe **um** lançamento, feito à mão, com o valor
cheio. Conciliar um-para-um não resolve, porque nenhuma das linhas bate com ele sozinha. Então
escolhe-se o **mesmo lançamento nas duas linhas** (o seletor oferece "juntar com «…»" quando
ele já é de outra linha) e ele se **divide**: a primeira parte continua sendo ele, com o valor
reduzido, e cada linha a mais vira uma parte nova — mesma data, mesma categoria, mesmo contato.
No fim, o Bolso mostra os mesmos dois movimentos que o banco mostra, cada um com o seu
identificador. A tela só deixa confirmar quando as partes somam o valor do lançamento, e
desfazer pelo histórico devolve o valor inteiro e apaga as partes.

**Detalhar antes de aprovar.** Ao lado da categoria, um lápis abre o **formulário completo**
já preenchido com o que o banco mandou (valor, data, descrição, conta). Serve para o que a
linha sozinha não diz: contato, parcelas, divisão em categorias, uma observação. Ao salvar, o
lançamento passa a existir e a linha fica **conciliada** com ele — nada entra duas vezes. Quem
só precisa da categoria continua resolvendo no próprio seletor, sem abrir nada.

**Cartão de crédito.** Cada compra cai na fatura do próprio mês, pelo dia de fechamento do
cartão — importar três meses de uma vez continua certo, porque a conta é feita compra a compra
(e o dia do fechamento separa: comprou no dia 4 vai para esta fatura, no dia 5 vai para a
seguinte).

**Compra parcelada.** As dez parcelas de uma compra em 10x são todas da **data da compra**: foi
ali que o gasto aconteceu, e é assim que elas somam juntas no regime de competência. O que anda
mês a mês é o **caixa** — cada parcela na sua fatura, com o seu vencimento. Vale para o
parcelamento lançado à mão e para o que vem do banco.

Do Pluggy vem `creditCardMetadata`, com o número da parcela, o total e — quando o banco manda —
a **data da compra**. Quando não manda, a data é calculada: a parcela 2 que caiu em setembro
veio de uma compra de agosto. No OFX não existe campo para isso, então o número sai do próprio
texto (`PARC 02/10`), com uma regra apertada para não confundir parcela com data.

Quando o banco não preenche esse campo — e vários não preenchem —, a parcela sai da própria
descrição (`PARC 02/10`), que é de onde o extrato OFX já lia. A conferência mostra as duas
coisas na linha: *"parcela 2/10 · compra em 21/08"*, para ninguém achar que o Bolso errou o mês.

A busca **atualiza** o que já está na fila, em vez de ignorar: o banco reenvia as linhas ainda
abertas, e é assim que uma linha guardada por uma versão antiga do Bolso ganha o que ela não
tinha. Por isso a janela de revisão alcança a linha pendente mais antiga, por mais velha que
seja — enquanto ela espera decisão, é assunto aberto.

As parcelas que chegam mês a mês se juntam numa **série** (a mesma de "3 de 10" do lançamento
manual), então editar ou excluir a série inteira funciona igual. O Pluggy não manda um
identificador que ligue as parcelas — eles dizem isso na documentação —, então a âncora é a
data da compra, mais o total de parcelas, a conta e a descrição.

**Tudo o que o banco manda fica guardado.** Cada linha da caixa de entrada leva o payload
inteiro do Pluggy (`raw`), e cada lançamento do OFX leva todas as tags do bloco. O Bolso usa
poucos campos hoje, mas descartar na leitura é perder para sempre — e foi assim que o número da
parcela passou despercebido por um tempo.

**Transferência e pagamento de fatura.** Cada linha tem uma quarta saída além de aprovar,
conciliar e dispensar: **Transferir**. Ela é para dinheiro que só mudou de conta — a fatura do
cartão saindo da corrente, dinheiro indo para a poupança, um saque. Vira uma transferência de
duas pernas, sem categoria, e por isso **fica fora dos relatórios e do orçamento**: as compras
do cartão já são as despesas, e lançar o pagamento da fatura de novo contaria duas vezes.

Só a perna da conta que está sendo conferida leva o identificador do banco. Quando o cartão
também estiver conectado, a outra ponta aparece na caixa de entrada dele e o Bolso sugere
conciliar com a perna que a transferência já criou — sem repetir nada.

**Extrato OFX**, para quando o banco não tem Open Finance ou para trazer um histórico antigo de
uma vez. É o formato que todo banco brasileiro exporta.

**Como o app lê o arquivo.** O leitor é escrito à mão (`packages/shared/src/ofx.ts`), sem
biblioteca: o OFX 1.x é SGML (tags que não fecham) e o 2.x é XML, e os dois se resolvem com a
mesma regra — o valor vai da tag até o próximo `<`. Os valores viram centavos por texto, nunca
por float, porque extrato tem que fechar. O arquivo costuma vir em Latin-1: o app lê os bytes e
converte com a codificação que o próprio cabeçalho informa, senão "SÃO JOSÉ" viraria "S�O JOS�".

**Conciliar** é dizer "este lançamento do banco é aquele que eu já tinha lançado". O app sugere
sozinho: mesma conta, mesmo valor, mesmo tipo e data até **4 dias** de diferença (a compra sai
hoje e cai na conta depois). A descrição não entra na comparação — o banco escreve
"PAG*MERCADO SAO JOSE" e a pessoa escreveu "Feira da semana".

Cada linha do extrato chega classificada como:

| Situação | O que o app faz |
|---|---|
| **Nova** | Sugere importar, e dá para escolher a categoria na hora |
| **Parecida** | Mostra o lançamento parecido e sugere conciliar (também dá para importar assim mesmo) |
| **Já importada** | Fica de fora: aquele identificador do banco já entrou antes |

Ao conciliar, o lançamento que você digitou passa a carregar o identificador do banco (FITID).
Por isso reimportar o mesmo arquivo não duplica nada, e o que foi conciliado aparece como
"conciliado" na lista (o que veio direto do extrato aparece como "do extrato").

---

## Login e grupos

Feitos com **Better Auth**, que grava sessões no próprio banco. O plugin de organizações vira os **grupos** do Bolso.

- **Primeiro acesso:** ao criar a conta, a pessoa já ganha um grupo pessoal ("Meu Bolso") com **10 categorias iniciais** prontas, algumas com subcategorias. Ninguém começa com a tela vazia.
- **Convite:** em Ajustes → Grupo, escrever o e-mail gera um **link**, que já vai copiado para a área de transferência (serve para mandar no WhatsApp). Quem abre o link vê de qual grupo é o convite e entra com um clique. O link continua valendo quando existir envio por e-mail: o convite é o mesmo.
- **Várias pessoas, vários grupos:** cada pessoa pode estar em mais de um grupo (o dela e o da casa, por exemplo) e troca de grupo em Ajustes → Grupo. A sessão guarda qual é o grupo ativo.
- **A tela de login mostra só os provedores configurados** (pergunta em `/api/auth-providers`). Em desenvolvimento, os que faltam aparecem desligados, para lembrar o que falta; em produção, somem.
- **Depois de entrar, a pessoa volta para onde queria ir** (`/entrar?continuar=/lancamentos`). Se o provedor recusar ou ela cancelar, volta para `/entrar` com o motivo num aviso, em vez de uma página de erro crua.
- **Mesmo e-mail, mesma conta:** quem já tinha conta e entra pelo Google com o mesmo e-mail cai na conta que já existia (o Google confirma o e-mail, então a ligação é automática).
- **As chaves ficam em `apps/api/.env`, nunca no `.env.example`:** o exemplo vai para o git, o `.env` não.
- **Sem campos de nome e e-mail na tela**, nem em desenvolvimento: só os botões dos provedores. Os testes automáticos entram pela rota `/api/dev/sign-in`, que não tem tela e não existe em produção.

---

## Segurança

- **Nada atravessa grupo:** todas as rotas do app passam pelo `requireGroup`, e nenhuma consulta roda sem `group_id`. Um teste confere: a categoria de outro grupo não aparece na lista, e tentar editá-la ou excluí-la pelo id responde 404, como se não existisse.
- **Chaves de serviços externos criptografadas** com AES-256-GCM (`ENCRYPTION_KEY`) antes de ir para o banco. A API **nunca** devolve a chave: só os 4 últimos caracteres, para a pessoa reconhecer qual é.
- **Sessão em cookie** `httpOnly`, que o JavaScript da página não consegue ler. O WebSocket usa o mesmo cookie.
- **Origens confiáveis** declaradas em `PUBLIC_URL` e `TRUSTED_ORIGINS`: um site qualquer não consegue chamar a API com o cookie de quem está logado.
- **Em produção a API não sobe** sem `BETTER_AUTH_SECRET` e `ENCRYPTION_KEY` de verdade: os valores de desenvolvimento só existem fora de produção.

---

## Primeira versão (MVP)

**Entidades** (todas já existem no banco e na API — ver [Banco de dados](#banco-de-dados)):

- `user`, `organization` (grupo) e `member` (via Better Auth)
- `accounts`: Nubank, carteira, conta conjunta…
- `categories`: Mercado, Moradia, Lazer…
- `transactions` e `transaction_splits`: valor, tipo, conta, datas, quem lançou, e as partes por categoria
- `budgets`: limite mensal por categoria

**Telas:**

1. ✅ Login, criar grupo e convidar pessoa
2. ⏳ **Painel do mês:** saldo e orçamento por categoria com barras de progresso
3. ✅ **Orçamento:** limites mensais por categoria
4. ✅ **Lançamentos:** lista e cadastro rápido, com botão **"+" flutuante** no celular
5. ✅ **Relatórios:** fluxo de caixa, gastos por categoria, orçado × realizado e gastos por pessoa
6. ✅ **Ajustes:** perfil, grupo, categorias, contas e chaves de API

**Depois do MVP:** recorrências, saldo por conta, metas, quem está online agora, lançamentos sem internet e notificações ("Mercado atingiu 80% do orçamento").

---

## Interface

### Navegação

- **Ordem das abas:** Painel → **Orçamento → Lançamentos** → Relatórios. Orçamento vem antes de propósito: no Bolso, primeiro se planeja e depois se gasta.
- **Computador:** barra horizontal no topo, com o Navigation Menu do shadcn. Não há menu lateral. **Relatórios** abre um menu suspenso.
- **Celular:** a barra de cima mostra só a marca e os ícones, e as abas ficam **na barra de baixo**, ao alcance do polegar.
- **À direita da barra:** lupa (busca), sol/lua (tema) e avatar.

### Visual (clean e minimalista)

- **Tema escuro por padrão**, com opção de claro no ícone sol/lua. A escolha fica salva no aparelho e o app abre sem piscar.
- **Aba ativa sem fundo:** ela se destaca só pela cor do texto, sem aparência de botão pressionado. Por isso os links usam `bg-transparent!` sobre os estilos do shadcn. O contorno de foco aparece só com o teclado.
- **Título de página discreto e sem descrição** (`PageHeader`): a aba ativa na barra já diz onde a pessoa está. O título continua existindo para orientar no celular.
- **Cor forte só em ações**, no **azul da marca `#374DF5`** (o mesmo do logo, nos dois temas). O verde ficou só como cor de categoria. Navegação e textos em tons neutros.
- **Cores só por tokens do shadcn** (`bg-background`, `text-muted-foreground`, `bg-card`, `bg-primary`…), definidos em `apps/web/src/styles.css`. Nada de cor literal nos componentes.
- **Tamanhos:** links do menu no padrão do shadcn (36px de altura, fonte de 14px).

### Duas regras que valem em todas as telas

- **Receita antes de despesa.** Entradas aparecem acima das saídas — no orçamento, no formulário de lançamento, nas categorias e nos relatórios. A ordem de `transactionTypes` e `categoryKinds` não muda, porque ela define o `enum` do banco: a tela usa `transactionTypesInOrder` e `categoryKindsInOrder`.
- **Filtro tem memória.** Todo filtro de **recorte** (tipo, conta, ordem, intervalo, quantidade de períodos) volta como a pessoa deixou, guardado no aparelho pelo hook `useRemembered` (`bolso:filtro:*`). O que é *quando* — mês, ano, início do período — **não** é lembrado: a tela abre sempre perto de hoje, senão se volta a ela no passado sem ter pedido. Um valor salvo que não existe mais (uma conta apagada, uma opção que saiu) é descartado pelo validador do próprio hook.

### Busca (Ctrl K)

- Aberta pela **lupa** ou por **Ctrl K** (⌘K no Mac). Passar o mouse na lupa mostra a dica.
- É uma **paleta de comandos** que busca telas, relatórios e ações, como trocar o tema. Funciona **sem acento** ("orcamento" encontra "Orçamento").
- Fica fora do pacote inicial para não pesar o app, e é baixada em segundo plano 2 segundos depois de a tela abrir. Assim o primeiro Ctrl K já abre pronto.
- Quando houver lançamentos, eles entram nessa mesma busca.

### Avatar

- É o Avatar do shadcn como gatilho de um Dropdown Menu, igual ao exemplo oficial da documentação.
- Tem as opções **Ajustes** e **Sair**. "Sair" fica desativado até existir login.
- Mostra a foto e o nome salvos em **Ajustes → Perfil**. Sem foto, mostra as iniciais; sem nome, "Você".

### Login (`/entrar`)

- Tela limpa, **fora do layout do app** (sem barra nem abas): logo, título, e os botões **Continuar com o Google / a Apple / a Microsoft** (44px de altura, bons para o dedo).
- **O login é obrigatório:** quem abre o app sem sessão cai aqui, e volta para onde queria ir depois de entrar.
- Um provedor ainda não configurado aparece desligado em desenvolvimento e some em produção.
- A tela só chama `signInWithProvider()` em `features/auth/api.ts`, que usa o `authClient` do Better Auth.
- **Logos:** "G" oficial do Google, Apple do Simple Icons (CC0) e os quatro quadrados da Microsoft, em `features/auth/components/brand-icons.tsx`.

### Lançamentos

A tela do dia a dia. Tudo dela é de um **mês por vez**, o mesmo recorte do orçamento.

- **Barra de meses** com as setas ‹ › e o mês por extenso. Saindo do mês de referência, aparece **Hoje** para voltar.
- **Filtro de conta** ao lado. Escolhendo um **cartão**, a tela vira **a fatura**: "Fatura de outubro de 2026", com total, fechamento, vencimento e limite no topo, e as setas andam de fatura em fatura. "Hoje" volta para a fatura aberta.
- **Resumo do mês** (entradas, saídas e saldo), contado no navegador a partir da lista que já está na tela.
- **Lista agrupada por dia.** Cada linha: ícone da categoria (ou um ícone de divisão quando há várias), descrição, a parcela ("1/3") e embaixo as categorias ("Mercado + 1"), a conta, **quem lançou** (só quando foi outra pessoa), a fatura ("fatura out/26") ou "a pagar".
- **Valor com sinal:** `−R$ 250,00` para saída e `+R$ 3.000,00` para entrada, em verde — cor de dado, não de tema (`features/transactions/amount.ts`).
- **Novo lançamento:** botão na barra no computador e **"+" flutuante** no celular, acima das abas. Com a lista filtrada numa conta, o lançamento novo já vem nela.
- **Duplicar:** nas ações da linha, a cópia abre um lançamento novo já preenchido (valor, categorias, conta e contato), com a data de hoje — bom para o que se repete sem ser recorrente.
- **Contato:** quem recebeu ou pagou. O campo busca pelo nome e, se não existir, cria na hora com um clique (o cadastro completo fica em Ajustes → Contatos).
- **Escolher a categoria é uma busca:** o campo abre uma lista com filtro que ignora acento ("educacao" encontra "Educação"). Quando o texto casa com uma subcategoria, a **principal dela continua na lista**, para se ver de onde ela vem. Numa divisão, a categoria já usada some das outras linhas.
- **Formulário curto, nada escondido:** tipo; valor e data; descrição; categoria; conta e contato; "pago em" e o botão **Parcelar** (o campo de parcelas só aparece para quem pedir — 1x não é parcelamento). Tudo em duas colunas, inclusive no celular. No cartão, "pago em" some (quem manda é o vencimento da fatura) e entra o aviso de em qual fatura a compra cai. Escolhendo um cartão, "Pago em" some e aparece "Cai na fatura de outubro, que vence em 05/10". Trocar o tipo limpa as categorias, porque a API recusa categoria de outro tipo.
- **Tempo real:** o que outra pessoa lançar entra na lista, no resumo, no orçamento e nos relatórios sozinho.

- **Um botão para todas as formas de lançar.** "Novo lançamento" abre a despesa, que é o caso comum; a seta ao lado abre o resto — **Entrada**, **Saída**, **Transferência entre contas** e **Importar extrato**. Antes eram três botões soltos na barra; juntos, sobra espaço e fica claro que são variações da mesma coisa. No celular eles ficam no menu ao lado do filtro de conta, e o botão redondo continua sendo o atalho para lançar.
- **Criar sem sair do lançamento.** Categoria, subcategoria, conta e contato podem nascer no próprio seletor: digite o nome e escolha onde ele entra. Na categoria, o que aparece é **"Criar «…» dentro de"** seguido da lista de grupos — porque o normal é a categoria nova ser uma filha ("Streaming" dentro de "Lazer"), e não mais um grupo solto na raiz. Criar uma principal continua possível, como a última opção da lista. A categoria nasce do tipo do lançamento (receita ou despesa); o grupo da categoria já escolhida no campo vem primeiro, que é o palpite mais provável. Quem criou uma solta por engano conserta em **Ajustes → Categorias → "Mover para dentro de…"**, sem perder os lançamentos que já a usam. A conta nasce como conta comum — cartão pede fechamento e vencimento, e isso fica em Ajustes → Contas. O capricho (ícone, cor, documento, saldo inicial) é lá; aqui o que importa é não perder o fio do lançamento.

### Orçamento

- **Todas as categorias aparecem**, mesmo sem orçamento, para poder definir. As principais abrem e mostram as subcategorias: dá para orçar no detalhe (só "Restaurante") ou por cima (toda a "Alimentação fora").
- **Principal com orçamento próprio manda no total dela**; sem ele, vale a soma do que foi orçado nas subcategorias. Assim nada é contado duas vezes.
- **Entradas primeiro, depois saídas.** Entrada é previsão de receber ("espero R$ 9.000 de salário"), e a barra cheia é coisa boa.
- **Detalhamento:** em vez de um número solto, o orçamento pode virar uma lista — "Salário Débora R$ 5.000" e "Salário Wilson R$ 4.000". O valor do orçamento passa a ser a soma dos itens; a linha só menciona que existem ("· 2 itens"), e a lista fica no diálogo.
- **Principal e filhas fecham.** Tendo a principal um orçamento próprio, o diálogo da subcategoria já diz quanto cabe ("Cabe até R$ 700,00 aqui, do orçamento de Alimentação fora"), fica vermelho e trava o Salvar quando passa. O mesmo vale ao contrário: não dá para baixar a principal abaixo do que as filhas já somam. A API recusa nos dois casos — a tela só avisa antes.
- **O orçamento vale do mês em diante**, até alguém mudar — ninguém redigita tudo todo mês. Mudar em outubro não altera setembro. "Tirar orçamento" encerra dali em diante.
- Cada categoria mostra "R$ 83,33 de R$ 200,00", a barra e quanto resta ou passou. A barra é verde até 80%, âmbar até 100% e vermelha quando estoura (`components/progress-bar.tsx`).
- No topo: orçado, gasto e o que resta no mês, e quanto foi gasto em categorias sem limite.
- Ordem: primeiro as com limite (as mais usadas no topo), depois as que gastaram sem limite, depois o resto.

### Relatórios

Somados no servidor: o navegador recebe só os totais. Todos se atualizam sozinhos quando alguém do grupo lança.

| Relatório | O que mostra |
|---|---|
| **Fluxo de caixa** | O ano em barras (entradas × saídas por mês) e a tabela com saldo e acumulado. Conta pelo dia em que o dinheiro se move; os meses futuros aparecem apagados com o que já está agendado (parcelas, faturas, contas a pagar) |
| **Mês a mês** | Uma tabela: as categorias nas linhas, os períodos nas colunas, o total de cada linha e a variação em relação à coluna anterior. **Clicar num número abre os lançamentos que formam ele** — e a soma bate, porque um lançamento dividido entra com a parte daquela categoria (a lista mostra "de R$ 200,00" ao lado). A barra de cima escolhe **intervalo** (mensal, trimestral, anual), **regime** (competência ou caixa), **início** (o seletor vira mês, trimestre ou ano conforme o intervalo) e **quantas colunas** (de 1 a 13); esses quatro ficam numa peça só, sem rótulo escrito na frente de cada um — "Mensal", "Competência" e "12 meses" já dizem o que são. Ao lado, **abrir/fechar tudo** e os **filtros**: mostrar só entradas ou só saídas; ordenar por maior total, por nome ou pela **estrutura das categorias** (a ordem que você montou arrastando em Ajustes → Categorias, subcategorias incluídas); e mostrar a **Média** (uma coluna) e os percentuais **% do grupo** e **% da receita**. Os percentuais não viram colunas: aparecem **dentro de cada célula**, discretos embaixo do número, para dar para ver o peso de cada linha mês a mês — e não só no total — sem alargar a tabela. O "% do grupo" de uma principal é dentro da seção; o de uma subcategoria, dentro da principal dela. A tabela se arrasta com o mouse, com a mãozinha no cursor. A cor do selo diz se foi bom ou ruim (gastar mais é vermelho, receber mais é verde), não a direção. As principais abrem para mostrar as subcategorias, e a primeira coluna fica parada quando a tabela rola para o lado |
| **Gastos por categoria** | Uma faixa com a fatia de cada categoria no total e a lista com valor, percentual e as subcategorias dentro da principal. Alterna entre despesas e receitas |
| **Orçado × realizado** | Cada categoria com limite: orçado, gasto, percentual e diferença. Os gastos em categorias sem limite aparecem à parte. Tem o atalho "Ajustar limites" |
| **Gastos por pessoa** | Quanto cada pessoa do grupo lançou no mês, com a participação no total. Todo mundo aparece, mesmo zerado |

Os números de topo das telas usam o mesmo bloco (`components/stat-grid.tsx`), e a navegação por meses é uma só (`components/month-nav.tsx`).

### Ajustes

- **Computador:** lista lateral de seções à esquerda e conteúdo à direita. A seção ativa ganha texto forte e uma linha fina à esquerda, sem fundo. Abrir `/ajustes` leva direto a Perfil.
- **Celular:** `/ajustes` mostra a lista de seções em cartão, e cada seção abre com "‹ Ajustes" para voltar.
- As seções também aparecem na busca (Ctrl K).

| Seção | O que faz |
|---|---|
| **Perfil** | Nome e **foto** (aparecem no avatar, para você e para quem divide o grupo). A foto é escolhida da galeria ou câmera, recortada no centro em quadrado e reduzida para 256×256 (poucos KB), e salva na hora. "Remover" volta às iniciais |
| **Grupo** | Nome do grupo, quem está nele, convite por link, criar outro grupo e trocar o grupo em uso |
| **Categorias** | Despesas e receitas com nome, ícone e cor, e **subcategorias** (um nível só). **Só a categoria principal tem ícone e cor**: a subcategoria é só o nome e segue o tipo da principal. São **164 ícones em 10 famílias** (Alimentação, Casa, Contas e serviços…), com busca em português que entende tanto o **significado** quanto o **nome do desenho** — "luz" e "raio" acham Energia, "uber" acha Táxi, "cadeado" acha o cadeado — e sugestões a partir do nome que está sendo digitado. Plural não atrapalha ("Filhos" sugere o bebê), porque a comparação é por radical, e o que casa mais cedo no vocabulário do ícone aparece primeiro. A **cor é livre**: paleta pronta, matiz/intensidade/claridade ou o hex colado. O ícone nunca some: o app mede o **contraste real** (WCAG) da cor contra o fundo do selo em cada tema e clareia ou escurece só o quanto for preciso para passar de 3,6:1 — um rosa clarinho vira magenta no tema claro, um azul-marinho clareia no escuro, e o tom escolhido continua sendo o da pessoa (é ele que aparece nas bolinhas da paleta). A lista se **reordena arrastando** pela alça (mouse, toque ou setas do teclado), e a ordem vale para o grupo inteiro. Arrastando, a categoria vira uma cópia solta na tela, que não é cortada pelas bordas do grupo — e **soltar uma subcategoria em cima de outra principal a muda de lugar**, levando o tipo da nova mãe junto. Nome repetido no destino é recusado, com o aviso dizendo qual é. Começa com 10 categorias comuns, algumas já com subcategorias (Moradia → Aluguel, Condomínio…). Não deixa repetir nome entre irmãs, ignorando acento e maiúscula. Excluir uma principal exclui as subcategorias junto |
| **Contas** | Conta corrente, poupança, cartão de crédito, dinheiro e investimento, com saldo inicial (exceto cartão, que ganha limite e fatura depois) |
| **Contatos** | Quem recebe ou paga: nome, pessoa ou empresa, documento e observação. Excluir um contato não apaga os lançamentos dele |
| **Integrações** | Serviços **de fora que o Bolso usa**. Em cima, os bancos conectados (Pluggy) — o que a pessoa de fato quer; embaixo, as chaves que fazem isso funcionar, mostradas só com o final (••••abcd) e **criptografadas no servidor** |
| **Chaves de API** | O caminho contrário: chaves **do Bolso**, para outro programa (planilha, robô, Atalhos do iPhone) chamar a nossa API no lugar da pessoa. A chave aparece inteira uma vez só; depois fica o começo dela e a data do último uso |
| **Aplicativo** | Instalação no celular |

**Cores de dados:** a única exceção à regra de "só tokens". São cores do dado, não do tema: as das categorias em `features/categories/colors.ts` e o verde de entrada em `features/transactions/amount.ts`.

---

## Instalação no celular (PWA)

- O app pode ser **instalado com ícone na tela inicial** do celular e abre em tela cheia.
- **Android e computador:** o Painel mostra um aviso com o botão "Instalar app".
- **iPhone:** o mesmo aviso mostra o passo a passo, porque a Apple não permite botão de instalar: Compartilhar → Adicionar à Tela de Início.
- A instalação só funciona em **HTTPS**. Pelo IP da rede local (`http://192.168…`) o app abre, mas não oferece instalação. Para testar no celular antes do deploy, use um link HTTPS temporário (ex.: `cloudflared tunnel --url http://localhost:4173`).
- **Ícones:** gerados a partir de `apps/web/public/logo.svg` com `pnpm --filter web generate-pwa-assets`.
- **Lojas (futuro):** um PWA não aparece na App Store nem na Play Store. Para publicar lá, o caminho é **TWA** (Play Store) ou **Capacitor** (App Store). A separação entre SPA e API já deixa isso possível sem reescrever o frontend.

---

## Logo

- **Estilo:** geométrico em grade, como o da Sofascore. É um **"b" minúsculo montado numa grade de 4×4 quadrados**, só com retângulos, branco sobre **azul liso `#374DF5`** (o mesmo azul da Sofascore, escolha do Wilson), sem gradiente e sem curvas.

  ```
  ■ □ □ □
  ■ ■ ■ ■
  ■ □ □ ■
  ■ ■ ■ ■
  ```

- **Arquivo-fonte:** `apps/web/public/logo.svg`. Os ícones do app (PWA, iPhone, Android, favicon) são gerados dele com `pnpm --filter web generate-pwa-assets`. O ícone de Android tem margem extra, porque o sistema pode recortá-lo em círculo.
- **Na barra do app** a marca continua só em texto ("Bolso"). O símbolo aparece no ícone do app e na tela de login.

## Fonte

A fonte é a **Sofascore Sans**, proprietária da Sofa IT (Sofascore) e usada com **autorização de um representante da Sofascore** (21/09/2026).

- Os arquivos (pesos 400, 500 e 700) e o registro da autorização estão em `apps/web/src/assets/fonts/sofascore-sans/`.
- **Guarde a autorização por escrito.** A licença gravada na fonte só permite uso expressamente autorizado, e num app web os arquivos da fonte ficam baixáveis por qualquer visitante.
- Se a autorização for revogada, a alternativa livre mais parecida é a **Instrument Sans** (licença OFL).

---

## Como rodar

Requisitos: **Node 22+** e **pnpm 10+**. Não precisa instalar banco nem Docker.

```bash
pnpm install        # instala as dependências
pnpm dev            # sobe a web (5173) e a API (3000) juntas
pnpm test           # testes da API (66 hoje)
pnpm typecheck      # checa os tipos dos três pacotes
pnpm lint           # verifica o código com o Biome
pnpm format         # formata e corrige o que for automático
pnpm build          # build de produção
pnpm preview        # serve o build em http://localhost:4173
```

Abra **http://localhost:5173** — a web repassa `/api` para a porta 3000 sozinha, inclusive o WebSocket. A primeira subida cria o banco em `apps/api/.data/pglite`.

**Para entrar:** use **Continuar com o Google** (exige `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` em `apps/api/.env`). Para testar o tempo real em duas janelas, entre com duas contas Google diferentes, uma delas numa janela anônima.

**Para começar do zero:** pare a API e apague `apps/api/.data`.

### Abrir no celular

`localhost` não serve: no celular, ele é o próprio celular. E pelo IP da rede (`192.168…`) o
**login com o Google não funciona** — ele só aceita endereço de retorno `http://` quando é
`localhost` — nem dá para instalar o app, que exige HTTPS.

O caminho é um túnel HTTPS com o **ngrok** (a conta grátis dá um domínio fixo):

1. Criar a conta em ngrok.com, pegar o token e rodar uma vez:
   `ngrok config add-authtoken SEU_TOKEN`
2. Reservar o domínio grátis no painel do ngrok (ex.: `bolso-seunome.ngrok-free.app`).
3. No Google Cloud → Credenciais → seu cliente OAuth, acrescentar em **URIs de redirecionamento**:
   `https://SEU-DOMINIO.ngrok-free.app/api/auth/callback/google`
4. Em `apps/api/.env`, trocar o endereço público e manter o localhost na lista de confiança:
   ```
   PUBLIC_URL=https://SEU-DOMINIO.ngrok-free.app
   TRUSTED_ORIGINS=http://localhost:5173,http://localhost:4173
   ```
5. Subir o app avisando o domínio ao Vite e ligar o túnel (duas janelas):
   ```bash
   BOLSO_TUNNEL_HOST=SEU-DOMINIO.ngrok-free.app pnpm dev
   ngrok http 5173 --domain=SEU-DOMINIO.ngrok-free.app
   ```

Aí o app abre no celular pelo endereço `https://`, com login do Google e instalação como
aplicativo. Com o túnel no ar, o app fica acessível na internet: por isso o login de
desenvolvimento (`/api/dev/sign-in`) só responde a chamadas da própria máquina — de fora,
qualquer um entraria informando o e-mail de outra pessoa.

### Configuração (`.env`)

Para desenvolver, nada é obrigatório. O arquivo fica em `apps/api/.env`:

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Postgres de verdade. **Sem ela, usa o PGlite embutido** |
| `PORT` | Porta da API (padrão 3000) |
| `PUBLIC_URL` | Endereço público do app (padrão `http://localhost:5173`). É a base dos links de convite |
| `TRUSTED_ORIGINS` | Outros endereços aceitos, separados por vírgula |
| `BETTER_AUTH_SECRET` | Assina as sessões. **Obrigatória em produção** (32+ caracteres) |
| `ENCRYPTION_KEY` | Criptografa as chaves de serviços externos. **Obrigatória em produção** (64 caracteres hexadecimais) |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Ligam o login do Google. O mesmo vale para `APPLE_` e `MICROSOFT_` |

Cada provedor de login só aparece funcionando quando as duas variáveis dele existem.

Componentes novos do shadcn: rodar `pnpm dlx shadcn@latest add <componente>` dentro de `apps/web`.

### Testes

`pnpm test` sobe a API inteira contra um **PGlite em memória** — sem banco externo, sem mock: é o mesmo código que roda em produção. Cobrem o caminho de cada entidade, as regras de negócio (fatura do cartão, parcelas, divisão em categorias, orçamento que vale do mês em diante, os relatórios, e a leitura e conciliação de OFX), o isolamento entre grupos e o tempo real ponta a ponta (dois WebSockets, um aviso, e a checagem de que o aviso de um grupo não vaza para o outro).

---

## Estrutura

```
.
├── apps/
│   ├── api/                     # servidor (Hono + Drizzle + WebSocket)
│   │   ├── drizzle/             # migrations geradas (aplicadas na subida)
│   │   ├── src/
│   │   │   ├── db/schema/       # app.ts (nossas tabelas) · auth.ts (gerado pelo Better Auth)
│   │   │   ├── lib/crypto.ts    # AES-256-GCM das chaves de serviços externos
│   │   │   ├── realtime/        # hub.ts (conexões por grupo) · socket.ts (/api/ws)
│   │   │   ├── routes/          # uma rota por entidade, mais reports.ts (os 4 relatórios)
│   │   │   ├── app.ts           # monta a API e trata os erros
│   │   │   ├── auth.ts          # Better Auth: sessão, grupos e grupo pessoal inicial
│   │   │   ├── env.ts           # variáveis de ambiente validadas com Zod
│   │   │   ├── http.ts          # requireGroup, erros e o aviso de tempo real
│   │   │   ├── statements.ts    # fatura do cartão ao gravar e ao mudar o ciclo
│   │   │   └── index.ts         # sobe o servidor HTTP + WebSocket
│   │   └── test/                # a API de verdade contra um banco em memória
│   └── web/                     # interface (SPA + PWA)
│       ├── public/              # ícones do app e logo.svg
│       ├── src/
│       │   ├── assets/fonts/    # Sofascore Sans + LICENCA.md
│       │   ├── components/      # componentes compartilhados do app
│       │   │   └── ui/          # componentes do shadcn (gerados pelo CLI; não editar à mão)
│       │   ├── features/        # uma pasta por funcionalidade
│       │   │   │                #   api.ts (fala com a API) · queries.ts · components/
│       │   │   ├── accounts/    accounts · auth · budgets · categories · groups
│       │   │   └── …            integrations · profile · reports · transactions
│       │   ├── hooks/           # tema, instalação, atalho de busca
│       │   ├── lib/             # api-client, auth-client, realtime, dinheiro, tema…
│       │   ├── routes/          # uma rota por arquivo (TanStack Router)
│       │   │                    #   _app.*.tsx = com barra e abas; entrar.tsx e convite.$id = sem moldura
│       │   ├── main.tsx
│       │   └── styles.css       # tokens de cor, fonte, tema claro/escuro
│       ├── components.json      # configuração do shadcn
│       └── vite.config.ts       # Vite, rotas, Tailwind, PWA e repasse de /api
├── packages/
│   └── shared/                  # tipos, validações Zod e as contas de dinheiro (fatura,
│                                #   parcelas, rateio, datas) usados pelos dois lados
├── biome.json
├── package.json
└── pnpm-workspace.yaml
```

**O caminho dos dados na tela** continua o mesmo de antes, só que agora a última parada é a API:

```
Tela  →  queries.ts (TanStack Query)  →  api.ts  →  HTTP /api/...
                    ▲
                    └── WebSocket avisa "mudou" → busca de novo
```

Só o `api.ts` de cada funcionalidade conhece a API. As telas não sabem de onde os dados vêm.

---

## Pendências

1. **Painel:** a tela inicial do mês (saldo, orçamento e últimos lançamentos). Os dados já existem nos relatórios.
2. **Saldo por conta** e **recorrências** (aluguel, salário, assinaturas). A transferência entre contas já existe; falta o saldo que ela move.
3. **Login social:** cadastrar o app em cada provedor e preencher as variáveis. Cada um exige um cadastro próprio:
   - **Google:** ✅ feito em desenvolvimento. Para produção, cadastrar também `https://SEU-DOMINIO/api/auth/callback/google` no mesmo cliente OAuth, e publicar a tela de consentimento (em modo "Teste", só os e-mails listados como testadores conseguem entrar).
   - **Microsoft:** registro do app no Microsoft Entra ID (antigo Azure AD). Gratuito.
   - **Apple:** **Apple Developer Program (US$ 99/ano)**, com Services ID e chave privada. Só funciona num domínio com HTTPS, não em `localhost`.
   - Se um dia o app for para a App Store, ter o login da Apple é obrigatório quando há login do Google (regra da Apple), e ele já está previsto.
4. **Convite por e-mail:** hoje o convite sai como link para copiar. Falta ligar um serviço de envio.
5. **Aviso do Pluggy por webhook:** hoje a busca é de 30 em 30 minutos. Com um endereço público, o Pluggy avisa na hora em que o banco traz algo novo.
6. **Deploy:** Docker Compose + Caddy num VPS, com Postgres de verdade e HTTPS.
7. Aumentar para 44px a área de toque dos botões de ícone no celular (hoje 36px).

---

## Observações

- **Local do projeto:** o projeto fica em `sistemadaniel`, dentro do OneDrive. O OneDrive sincroniza o `node_modules`, o que pode deixar instalações lentas e travar arquivos de vez em quando. Se isso acontecer, mover o projeto para uma pasta fora do OneDrive (ex.: `C:\dev\bolso`) resolve.
- **Uma API por vez.** O PGlite não aceita dois processos na mesma pasta do banco: abrir duas APIs corrompe o banco (erro `RuntimeError: Aborted()`). Por isso a API confere a porta 3000 antes de abrir o banco e se recusa a subir se já houver outra, e o Vite fica preso à porta 5173 (numa porta diferente, a API recusaria login e logout). Para parar, feche o `pnpm dev` com Ctrl+C, que encerra também o vigia (`tsx watch`); matar só o processo da porta 3000 deixa o vigia vivo, e ele reabre a API a cada arquivo salvo. Antes de mexer no banco à mão, pare tudo e faça uma cópia de `apps/api/.data`.
- **Cópia antiga:** existe uma cópia anterior em `C:\dev\bolso`. Esta pasta é a versão atual, e a outra pode ser apagada.
- **Origem:** o projeto começou avaliando o [fincore](https://github.com/danielboso/fincore), do Daniel, mas foi escrito do zero, porque as premissas (tempo real e orçamento compartilhado) pediam outra arquitetura.

---

## Rastro: quem fez o quê

Orçamento de duas pessoas tem uma pergunta que aparece toda semana: *quem mexeu nisso?*
Perguntar por mensagem é pior do que abrir e ver. Por isso cada criação, alteração e exclusão
vira uma linha em `audit_log` com **o que mudou** — campo, de, para — e quem mudou. No
formulário do lançamento, "Ver o histórico" conta a coisa em português: *"Débora alterou
descrição: Feira → Feira da semana · 12 set, 14:03"*.

**Apagar um lançamento que veio do banco devolve a linha para a caixa de entrada.** A fila é o
acerto de contas entre o que o banco mandou e o que foi aceito: se o lançamento some, aquela
linha volta a não ter resposta, e precisa voltar a esperar aprovação — senão o movimento
sumiria do app inteiro sem ninguém ter decidido nada, e o banco não avisaria de novo, porque
para ele aquilo já foi entregue. Restaurar o lançamento pela lixeira faz o caminho inverso: a
linha sai da fila, para a mesma coisa não aparecer duas vezes. Para resolver de vez, é
**Dispensar**.

**Excluir não apaga.** O lançamento ganha `deleted_at` e some de todas as telas e de todos os
relatórios na hora, mas continua no banco: a **Lixeira** (no menu de "Novo lançamento") mostra
o que foi excluído, por quem, e traz de volta exatamente como estava — com as categorias, que
nunca foram embora. Vale também para a transferência, cujas duas pernas somem e voltam juntas.

O filtro de excluídos vive em todas as consultas de lançamento — lista, relatórios, orçamento,
fatura do cartão, conciliação e busca do banco. É a parte perigosa da ideia: basta uma consulta
esquecer o filtro para um lançamento excluído continuar somando em algum lugar. Por isso o
teste de lixeira confere justamente isso, no mês a mês e no patrimônio.

**O que ainda não tem rastro:** categoria, conta e contato. A estrutura já aceita (a tabela tem
`entity`), e eles continuam sendo apagados de verdade — coisas em uso já são protegidas pelo
próprio banco.

---

## Evolução patrimonial

O mês a mês responde "para onde foi o dinheiro"; este responde **"o que ficou"**. Cada coluna é
uma foto do fim do período: o que se tem em cima (conta corrente, poupança, dinheiro,
investimento), o que se deve embaixo (a fatura em aberto de cada cartão, em valor positivo), e
a diferença — mais a variação em relação à coluna anterior.

O saldo anda pela data em que o dinheiro se move, e aqui a **transferência conta**: passar
R$ 1.000 da conta para a poupança não muda o patrimônio, mas muda o saldo das duas — e é
exatamente isso que esta tela mostra. O cartão não tem saldo inicial: fica negativo conforme
se compra e volta a zero quando a fatura é paga, por isso aparece do lado do que se deve.

---

## A conciliação, e por que ela trava o lançamento

Conciliar é dizer que **este** lançamento é **aquele** movimento do banco. É o mecanismo de
conferência do Bolso: quando vale, o número deixa de ser o que alguém digitou e passa a ser o
que o banco confirma. Por isso ela é guardada como uma **prova**, e não como um campo solto.

**De onde vem aparece na tela.** O lançamento mostra "conciliado · Open Finance", "conciliado ·
extrato OFX", ou os dois quando o mesmo movimento chegou pelos dois caminhos — e aí são duas
confirmações independentes do mesmo número. Um lançamento já conferido pelo extrato continua
disponível para conciliar com o Open Finance: é o mesmo movimento, e as duas provas somam. O
que não se repete é a mesma origem duas vezes, nem o mesmo movimento em dois lançamentos — o
índice único `(grupo, origem, identificador)` garante isso no banco de dados, mesmo com duas
pessoas clicando ao mesmo tempo.

**As travas.** Enquanto a conciliação vale:

- **valor, conta e tipo não se editam** — são o que identifica o movimento, e mudá-los desfaria
  a prova sem ninguém perceber: o lançamento continuaria dizendo "conferido" sobre um número
  que o banco nunca confirmou;
- **o lançamento não se exclui** — nem a transferência conciliada;
- o resto segue livre: descrição, categoria, contato, observação e datas. Melhorar a descrição
  de um lançamento conferido é justamente o que se espera que as pessoas façam.

**Desfazer é um passo à parte**, dentro do próprio lançamento, com confirmação. Ao desfazer, a
linha volta para a caixa de entrada — porque de novo ninguém respondeu por ela.

**Nada do que o banco mandou se perde.** O que foi **dispensado** fica guardado e aparece em
"Dispensados", na caixa de entrada: dá para rever meses depois, ou trazer de volta para a fila
quando alguém dispensou por engano.
