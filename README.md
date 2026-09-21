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
| Ajustes | ✅ Perfil, Grupo, Categorias, Contas e Chaves de API, tudo gravando no banco |
| **Lançamentos** | ✅ Cartão de crédito com fatura, compras parceladas e lançamento dividido em categorias, em tempo real |
| **Orçamento** | ✅ Limite por categoria, valendo do mês em diante, com a barra de uso |
| **Relatórios** | ✅ Fluxo de caixa, gastos por categoria, orçado × realizado e gastos por pessoa |
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
- **Datas sempre pelas partes locais** (`lib/dates.ts`), nunca `toISOString()`: ele converte para UTC e um lançamento feito às 22h cairia no dia seguinte.
- **Formulários com fonte de 16px no celular.** Abaixo disso, o iPhone dá zoom automático ao tocar no campo. O `Input` do shadcn já faz isso.
- **Nunca `window.confirm()`.** Exclusões usam o `ConfirmDeleteDialog`.
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
| `categories` | Mercado, Moradia… `parent_id` nulo = principal (tem ícone e cor); preenchido = subcategoria (um nível só) |
| `accounts` | Conta corrente, poupança, cartão, dinheiro, investimento, com saldo inicial em centavos. Cartão guarda `closing_day`, `due_day` e `limit_cents` |
| `integration_keys` | Chaves de serviços externos, **criptografadas** (ver [Segurança](#segurança)) |
| `transactions` | Valor, tipo, conta, **data da compra**, **data do pagamento** e quem lançou. No cartão, `statement_month` (a fatura, pelo mês do vencimento). Parcelas: `installment_group_id`, `installment_number` e `installment_count` ("3 de 10") |
| `transaction_splits` | **As partes do lançamento, uma por categoria.** Lançamento comum tem uma parte; dividido tem várias, somando o valor dele. A categoria mora aqui, não no lançamento |
| `budgets` | Limite por categoria principal, **valendo do mês (`AAAA-MM`) em diante** até ser trocado. `limit_cents` nulo encerra o limite a partir daquele mês |

**Tabelas de login e grupos** (`auth.ts`): `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`. São geradas pelo próprio Better Auth — **não edite à mão**; para atualizar, use `apps/api/scripts/auth-schema.config.ts` com o CLI dele.

**Regras que o banco garante sozinho:**

- **Toda tabela tem `group_id`** (a "organização" do Better Auth) e toda consulta filtra por ele. Apagar um grupo apaga os dados dele em cascata.
- **Valores em `bigint` de centavos**, nunca float.
- **Nome repetido é barrado pelo banco**, por índices únicos sobre `name_key` (nome sem acento e em minúsculas): "Mercado" e "mercado" são o mesmo nome. A API checa antes para dar uma mensagem clara, e o índice segura o caso raro de duas pessoas criando o mesmo nome no mesmo instante — esse erro vira um 409 com mensagem pronta.
- Apagar uma categoria principal apaga as subcategorias; apagar uma conta ou categoria usada num lançamento **não apaga o lançamento**, só deixa o campo vazio (a parte cai em "Sem categoria").
- **As partes somam o valor do lançamento**, sempre. A API recusa uma divisão que não feche e a mesma categoria duas vezes.

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
| `/api/integration-keys` | Chaves de serviços externos |
| `/api/transactions` | Lançamentos. `?month=` filtra o mês; `&accountId=` uma conta; `&view=statement` devolve **a fatura** do cartão que vence no mês. Criar com `installments: 10` gera as 10 parcelas numa transação só do banco. Editar aceita `?scope=one\|all` e excluir `?scope=one\|following\|all` (parcela, esta e as próximas, série inteira) |
| `/api/budgets` | `GET ?month=` devolve o limite que vale no mês (e desde quando); `PUT` define do mês em diante |
| `/api/reports/cash-flow?year=` | Entradas e saídas mês a mês, pelo dia em que o dinheiro se move |
| `/api/reports/categories?month=&type=` | Total por categoria principal, com as subcategorias dentro |
| `/api/reports/budget?month=` | Orçado × realizado por categoria principal de despesa |
| `/api/reports/people?month=` | Quanto cada pessoa do grupo lançou |
| `POST /api/dev/sign-in` | Entra só com o nome e o e-mail, **sem tela**: existe para os testes automáticos. Nunca existe em produção |

**Como está organizada:**

- `app.ts` monta tudo. Da linha `secured` para baixo, um único middleware (`requireGroup`) exige login **e** grupo ativo, e coloca `user` e `groupId` no contexto. Nenhuma rota precisa lembrar de filtrar: `groupId` já vem pronto e entra em toda consulta.
- Cada rota valida a entrada com o schema do `packages/shared` — **o mesmo** que o formulário usa na tela. Front e API não têm como divergir.
- Depois de gravar, a rota chama `notify(...)`, que avisa o grupo pelo WebSocket.
- `buildApp(deps)` recebe as dependências prontas, então os testes sobem a API inteira com um banco em memória.

**Regras de negócio que a API garante:** as categorias de um lançamento precisam ser do mesmo tipo dele (não dá para pôr salário numa categoria de despesa); no cartão, a data de pagamento é **calculada** (o vencimento da fatura), não informada; mudar o fechamento ou o vencimento de um cartão move as compras das faturas ainda abertas (as passadas ficam); orçamento só em categoria principal de despesa; trocar o tipo de uma categoria arrasta as subcategorias junto, numa transação só; e um convite só pode ser aceito uma vez.

---

## Cartão, parcelas e divisão

As regras de dinheiro moram em `packages/shared` (`cards.ts`, `allocation.ts`, `dates.ts`), com testes próprios, porque é onde é fácil errar por um dia ou um centavo.

**Cartão de crédito**

- A conta do cartão tem **dia de fechamento**, **dia de vencimento** e **limite**.
- Cada compra cai sozinha na fatura certa. Regra dos bancos: compra **no dia do fechamento ou depois** já vai para a fatura seguinte. Fechamento no dia 31 vira o último dia do mês em fevereiro.
- A fatura é chamada pelo **mês do vencimento**, como as pessoas falam: "a fatura de outubro" é a que vence em outubro.
- As duas datas continuam separadas: o **orçamento** conta pela data da compra; o **fluxo de caixa** conta pelo vencimento da fatura, que é quando o dinheiro sai.
- Estorno ou cashback no cartão é lançado como receita nele e abate da fatura.

**Parcelado**

- 10x viram **10 lançamentos ligados**, um por mês, com a mesma data do mês (31/01 → 28/02). Os centavos que sobram vão nas primeiras: R$ 100 em 3x = 33,34 + 33,33 + 33,33.
- No cartão, cada parcela cai na fatura do mês dela. Fora do cartão, só a 1ª pode sair paga; as outras ficam "a pagar".
- Cada parcela conta no orçamento do mês dela, que é como o dinheiro realmente sai.
- **Editar** pergunta: só esta parcela, ou todas (descrição, conta e categorias mudam na série; valor e datas, só na editada). **Excluir** pergunta: só esta, esta e as próximas (compra cancelada ou quitada antes), ou todas.

**Dividir em categorias**

- "Dividir em categorias" no formulário abre uma linha por categoria com o valor de cada uma — R$ 300 no atacadão = 250 de Mercado + 50 de Restaurante. O campo mostra quanto falta distribuir.
- Parcelado e dividido juntos: cada parcela é repartida na mesma proporção, sem perder centavo (método do maior resto).
- Relatórios e orçamento somam as partes: cada categoria recebe exatamente o pedaço dela.

**O que ficou de fora, de propósito:** transferência entre contas (ex.: pagar a fatura com a conta corrente) e saldo por conta. O pagamento da fatura não precisa ser lançado — as compras já são as despesas; lançá-lo de novo contaria duas vezes. Quando houver saldo por conta, a transferência entra junto.

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

**Depois do MVP:** recorrências, transferência entre contas e saldo por conta, importação de extrato (OFX/CSV), metas, quem está online agora, lançamentos sem internet e notificações ("Mercado atingiu 80% do orçamento").

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
- **Formulário:** tipo, valor, descrição, categoria (ou "Dividir em categorias"), conta, parcelas e datas. Escolhendo um cartão, "Pago em" some e aparece "Cai na fatura de outubro, que vence em 05/10". Trocar o tipo limpa as categorias, porque a API recusa categoria de outro tipo.
- **Tempo real:** o que outra pessoa lançar entra na lista, no resumo, no orçamento e nos relatórios sozinho.

### Orçamento

- **Todas as categorias principais de despesa** aparecem, mesmo sem limite, para poder definir. Tocar numa abre o limite dela.
- **O limite vale do mês em diante**, até alguém mudar — ninguém redigita o orçamento todo mês. Mudar em outubro não altera setembro. "Tirar limite" encerra dali em diante.
- Cada categoria mostra "R$ 83,33 de R$ 200,00", a barra e quanto resta ou passou. A barra é verde até 80%, âmbar até 100% e vermelha quando estoura (`components/progress-bar.tsx`).
- No topo: orçado, gasto e o que resta no mês, e quanto foi gasto em categorias sem limite.
- Ordem: primeiro as com limite (as mais usadas no topo), depois as que gastaram sem limite, depois o resto.

### Relatórios

Somados no servidor: o navegador recebe só os totais. Todos se atualizam sozinhos quando alguém do grupo lança.

| Relatório | O que mostra |
|---|---|
| **Fluxo de caixa** | O ano em barras (entradas × saídas por mês) e a tabela com saldo e acumulado. Conta pelo dia em que o dinheiro se move; os meses futuros aparecem apagados com o que já está agendado (parcelas, faturas, contas a pagar) |
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
| **Categorias** | Despesas e receitas com nome, ícone e cor, e **subcategorias** (um nível só). **Só a categoria principal tem ícone e cor**: a subcategoria é só o nome e segue o tipo da principal. Começa com 10 categorias comuns, algumas já com subcategorias (Moradia → Aluguel, Condomínio…). Não deixa repetir nome entre irmãs, ignorando acento e maiúscula. Excluir uma principal exclui as subcategorias junto |
| **Contas** | Conta corrente, poupança, cartão de crédito, dinheiro e investimento, com saldo inicial (exceto cartão, que ganha limite e fatura depois) |
| **Chaves de API** | Chaves de serviços usados pelo Bolso (Open Finance, IA…). A chave aparece só com o final (••••abcd). Página enxuta: uma linha de descrição e a lista. Ficam **criptografadas no servidor**. Os **tokens de acesso ao Bolso** (para automações e Atalhos do iPhone) entram depois |
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
pnpm test           # testes da API (43 hoje)
pnpm typecheck      # checa os tipos dos três pacotes
pnpm lint           # verifica o código com o Biome
pnpm format         # formata e corrige o que for automático
pnpm build          # build de produção
pnpm preview        # serve o build em http://localhost:4173
```

Abra **http://localhost:5173** — a web repassa `/api` para a porta 3000 sozinha, inclusive o WebSocket. A primeira subida cria o banco em `apps/api/.data/pglite`.

**Para entrar:** use **Continuar com o Google** (exige `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` em `apps/api/.env`). Para testar o tempo real em duas janelas, entre com duas contas Google diferentes, uma delas numa janela anônima.

**Para começar do zero:** pare a API e apague `apps/api/.data`.

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

`pnpm test` sobe a API inteira contra um **PGlite em memória** — sem banco externo, sem mock: é o mesmo código que roda em produção. Cobrem o caminho de cada entidade, as regras de negócio (fatura do cartão, parcelas, divisão em categorias, orçamento que vale do mês em diante e os quatro relatórios), o isolamento entre grupos e o tempo real ponta a ponta (dois WebSockets, um aviso, e a checagem de que o aviso de um grupo não vaza para o outro).

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
2. **Transferência entre contas e saldo por conta**, **recorrências** (aluguel, salário, assinaturas) e **importação de extrato OFX**.
3. **Login social:** cadastrar o app em cada provedor e preencher as variáveis. Cada um exige um cadastro próprio:
   - **Google:** ✅ feito em desenvolvimento. Para produção, cadastrar também `https://SEU-DOMINIO/api/auth/callback/google` no mesmo cliente OAuth, e publicar a tela de consentimento (em modo "Teste", só os e-mails listados como testadores conseguem entrar).
   - **Microsoft:** registro do app no Microsoft Entra ID (antigo Azure AD). Gratuito.
   - **Apple:** **Apple Developer Program (US$ 99/ano)**, com Services ID e chave privada. Só funciona num domínio com HTTPS, não em `localhost`.
   - Se um dia o app for para a App Store, ter o login da Apple é obrigatório quando há login do Google (regra da Apple), e ele já está previsto.
4. **Convite por e-mail:** hoje o convite sai como link para copiar. Falta ligar um serviço de envio.
5. **Tokens de acesso ao Bolso** (para automações e Atalhos do iPhone), que voltam à tela de Chaves de API.
6. **Deploy:** Docker Compose + Caddy num VPS, com Postgres de verdade e HTTPS.
7. Aumentar para 44px a área de toque dos botões de ícone no celular (hoje 36px).

---

## Observações

- **Local do projeto:** o projeto fica em `sistemadaniel`, dentro do OneDrive. O OneDrive sincroniza o `node_modules`, o que pode deixar instalações lentas e travar arquivos de vez em quando. Se isso acontecer, mover o projeto para uma pasta fora do OneDrive (ex.: `C:\dev\bolso`) resolve.
- **Uma API por vez.** O PGlite não aceita dois processos na mesma pasta do banco: abrir duas APIs corrompe o banco (erro `RuntimeError: Aborted()`). Para parar, feche o `pnpm dev` com Ctrl+C, que encerra também o vigia (`tsx watch`); matar só o processo da porta 3000 deixa o vigia vivo, e ele reabre a API a cada arquivo salvo. Antes de mexer no banco à mão, pare tudo e faça uma cópia de `apps/api/.data`.
- **Cópia antiga:** existe uma cópia anterior em `C:\dev\bolso`. Esta pasta é a versão atual, e a outra pode ser apagada.
- **Origem:** o projeto começou avaliando o [fincore](https://github.com/danielboso/fincore), do Daniel, mas foi escrito do zero, porque as premissas (tempo real e orçamento compartilhado) pediam outra arquitetura.
