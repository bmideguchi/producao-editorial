# Guia de design — Produção editorial

Linguagem visual da família do sistema de gestão, traduzida para este cliente Expo/React Native. O outro projeto usa shadcn/ui (Radix, CVA, Lucide). Aqui isso não entra: o equivalente é token no `client/global.css`, classe NativeWind em primitivo do React Native e SVG inline em `client/src/icons.tsx`.

## Cor

Neutros e marca seguem o slate e o azul do sistema de gestão. O farol das etapas não muda de regra: cinza, azul, amarelo, verde.

| Token | Uso | Valor |
| --- | --- | --- |
| `canvas` | Fundo da página | `#f4f6f8` |
| `paper` | Cartão, modal, campo | `#ffffff` |
| `ink` | Texto | `#0f172a` |
| `muted` | Descrição, cabeçalho de tabela | `#64748b` |
| `line` | Borda | `#e2e8f0` |
| `brand` | Botão primário, link, etapa azul | `#2563eb` |
| `accent` | Realce claro | `#eff6ff` |
| `sidebar` | Fundo da navegação | `#0f172a` |
| `sidebar-fg` | Texto da navegação | `#e7edf4` |
| `sidebar-muted` | Rótulo de seção | `#94a3b8` |
| `sidebar-accent` | Item ativo e hover | `#1e293b` |
| `ok` / `warn` / `wait` | Farol verde, amarelo, cinza | `#1f7a4d` / `#c48a12` / `#94a3b8` |
| `danger` | Ação destrutiva e calor de alocação | `#dc2626` |

Texto da sidebar é claro sobre fundo escuro. Bolinha de etapa leva um aro `paper` para separar da linha do tempo.

## Tipo

Inter no corpo, Space Grotesk no título (carregados só na web). Se a fonte não chegar, a pilha cai em Segoe UI / system-ui, com o título ainda em `tracking-tight`.

- Título de página: 24px, bold, tracking fechado, Space Grotesk (`Title`). Sem parágrafo de instrução embaixo.
- Descrição: 14px, `muted`, leading 20px (`Muted`). Só quando o texto já existia e informa o conteúdo.
- Rótulo de seção: 16px, semibold, tracking fechado (`SectionLabel`).
- Rótulo de campo: 14px, medium (`FieldLabel`).
- Cabeçalho de tabela: 14px, medium, `muted`, sem caixa alta (`TableHeaderText`).
- Corpo: 14px (`BodyText`). Botão: 14px.

## Sidebar

Coluna fixa de 256px, superfície `sidebar`, altura da janela. Seções em caixa alta, 12px, `sidebar-muted`: Operação, Reports, Configuração. Cada item tem ícone, 14px, raio médio; o ativo usa `sidebar-accent`. O rodapé, separado por uma linha, mostra a inicial, o nome e Sair. Operador vê só Projetos e Sair.

## Página

A coluna ao lado da sidebar é uma só medida para toda tela. `Screen` é `w-full max-w-none` com padding `px-6 py-6`. A próxima tela usa essa mesma medida.

- Cabeçalho: `PageHeader`. Título à esquerda, ação principal à direita, os dois na mesma linha e na mesma borda do conteúdo.
- Tabela: `TableScroll` + `TableShell` na largura do painel (`width: max-content`, `min-width: max(100%, piso)`). O nome cresce; o scroll horizontal só aparece quando as colunas passam da área.
- Catálogo em cartões: `CardGrid`, `repeat(auto-fit, minmax(260px, 1fr))` na largura do painel. Os cartões repartem a linha; a coluna mínima é 260px. Dois cartões ficam lado a lado e ocupam a largura, em vez de ilhas estreitas ou de um cartão por linha.
- Formulário de um bloco (calendário, novo projeto, template, pessoa): o mesmo `Screen` e o mesmo título. O miolo fica em `FormColumn` (`w-full max-w-5xl`), alinhado à esquerda, na borda do título.
- Login não tem sidebar. A coluna fica central, `w-full max-w-md`.

## Página, cartão, tabela

- Cabeçalho: título à esquerda, ação principal à direita, alinhados ao centro. A ação não estica na largura da página.
- Cartão: `paper`, borda `line`, raio 12px, sombra curta (`0 1px 2px` + `0 1px 3px` em slate a 6–8%). Cartão só de leitura (serviço, escopo fechado) não imita campo de formulário: nome em destaque, meta em `muted`.
- Tabela: mesmo cartão, cabeçalho `canvas` com texto `muted` medium, corpo 14px, hover `canvas`. Continua dentro de scroll horizontal. Gantt e editor de tarefa não mudam de estrutura.
- Vazio: uma linha `muted`, centralizada, sem explicação extra.

## Botão, status, ícone

- Primário: fundo `brand`, texto branco.
- Quieto: borda `line`, fundo `paper`, texto `ink`.
- Perigo: fundo `danger`, texto branco. Arquivar projeto fica pequeno e só no painel de escopo.
- Os três encolhem ao conteúdo (`self-start`), raio 8px.
- Status de etapa continua bolinha, não pílula. Pílula do outro sistema não se aplica ao farol.
- Ícone é SVG de 18px com `currentColor`. No nativo, um bloco da mesma cor. Não usar biblioteca de ícone que só existe no DOM.

## Espaço

Padding de página 24px. Cartão 16px. Raio de controle 10px (`rounded-lg`), cartão 12px (`rounded-xl`). Modal: mesma superfície do cartão, borda, raio e sombra, sobre véu `ink` a 50%.

## O que não copiar

Radix, CVA, `class-variance-authority` e Lucide quebram ou não existem no React Native. Menu, diálogo e select continuam os controles que já funcionam aqui; só a superfície muda. Sombra no nativo pode ser ignorada: no web ela é `boxShadow`.
