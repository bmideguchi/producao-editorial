# Produção editorial

Fotografia do produto como ele funciona em 6 de novembro de 2026. Descreve quem entra, o que cada tela faz e a arquitetura já em uso. O catálogo de etapas não é fixo: ele vive nos templates.

A equipe acompanha vários projetos ao mesmo tempo e lê, de relance, em que ponto cada um está. A cor de cada etapa é calculada pela API. Ninguém escolhe verde ou amarelo num seletor.

## Quem usa

Há dois papéis. Cada pessoa tem um só.

**Administrador.** Configura o sistema e vê todos os projetos ativos. Abre Operação (Projetos, Clientes, Fornecedores), Reports (Alocação) e Configuração (Templates, Equipe, Calendário, Projetos arquivados, Sair). Cria projetos, templates e pessoas. Edita o nome do projeto, as tarefas e as alocações. Marca Feita em qualquer tarefa. Arquiva projetos e apaga os que já estão arquivados. Vê o aviso "sem alocação" quando uma etapa ativada não tem ninguém.

**Operador.** Executa o trabalho. O menu traz Projetos e Sair. A lista mostra só os projetos ativos em que essa pessoa é o profissional de ao menos uma tarefa. Na ficha, marca e desmarca Feita somente na tarefa em que está alocado. Não cria pessoas, templates, projetos nem tarefas. Não aloca colegas, não muda datas nem predecessoras, não altera o escopo, não arquiva e não ativa etapa. Clientes, Fornecedores, Templates, Equipe, Serviços, Calendário, Alocação, Projetos arquivados e o endereço de novo projeto respondem "Sem acesso". Um projeto em que a pessoa não está alocada responde como inexistente.

O acesso é e-mail e senha. Credencial inválida não abre sessão e não revela se o e-mail existe. Pessoa inativa ou excluída não entra. A implantação cria um administrador inicial, para o primeiro acesso não depender de cadastro público.

## Menu

A barra lateral se chama Produção editorial e mostra o nome de quem entrou.

- Operação: Projetos. O administrador também vê Clientes, Fornecedores e o atalho Novo projeto.
- Reports, só administrador: Alocação.
- Configuração, só administrador: Templates, Equipe, Serviços, Calendário, Projetos arquivados e Sair.
- O operador vê Projetos e Sair.

## Templates

Um template tem nome único e uma lista ordenada de etapas. Precisa de ao menos uma etapa para nascer um projeto. Cada etapa tem nome e pode trazer tarefas. A tarefa do template tem nome, Tempo em dias úteis (inteiro maior que zero) e, se houver, uma predecessora na mesma etapa ou na imediatamente anterior. Não tem pessoa e não tem data de início.

Criar um projeto copia essas tarefas. A predecessora da cópia aponta para a tarefa copiada, ainda sem pessoa e sem data de início. Editar depois o nome, o tempo ou a predecessora de uma tarefa do template não reescreve as tarefas que o projeto já tem. A tela de edição diz isso.

O que continua sincronizando, inclusive em projeto arquivado:

- Renomear ou reordenar uma etapa reflete nas etapas correspondentes.
- Remover uma etapa do template tira essa etapa dos projetos, com as tarefas dela.
- Incluir uma etapa nova acrescenta essa etapa aos projetos que usam o template, inativa, já com as tarefas dela. Se essa etapa passar a ser a primeira de um projeto que ainda não tem nenhuma etapa ativada, ela nasce ativada na data de início do projeto.

O projeto não ganha, perde nem reordena etapas por conta própria: a ordem acompanha o template.

Excluir o template desliga os projetos dele e mantém as etapas e tarefas que eles já têm. Esses projetos continuam editáveis por conta própria. Arquivar tira o template da lista de criação e o deixa consultável em Arquivados.

Na primeira subida, se ainda não houver template, entram dois exemplos só com nomes de etapa, sem tarefas: Livro (Pauta, redação, preparação de originais, revisão, diagramação, revisão de prova, capa, aprovação, fechamento) e Revista (Pauta da edição, reportagem, edição, revisão, diagramação, prova, fechamento). O administrador pode renomear, esvaziar ou criar outros.

## Projetos

O administrador cria o projeto com nome, data de início e um template ativo. A primeira etapa nasce ativada nessa data. As demais nascem aguardando.

Na ficha, o nome fica fixo. O administrador o altera pelo lápis, com salvar e cancelar. Cancelar devolve o nome anterior. O operador não edita o nome.

Arquivar, só no escopo do projeto, pede a senha do administrador outra vez. Senha errada não arquiva. Com a senha certa, o projeto sai das listas operacionais e o histórico permanece. Projetos arquivados ficam em Configuração → Projetos arquivados, com nome e data de início. Dali o administrador pode apagar de vez, depois de confirmar. A exclusão permanente não pede senha e remove etapas, tarefas e alocações. Um projeto ativo precisa ser arquivado antes de poder ser excluído.

## Serviços e escopo

Configuração → Serviços é o catálogo. Cada serviço é um card com nome e tempo de alocação padrão em dias. O tempo pode ser menor que um dia, com até duas casas decimais, como 0,5 ou 0,25. O card salva ao sair do campo. Excluir é recusado enquanto algum projeto ainda usa o serviço no escopo.

Na criação do projeto e na ficha, o administrador define o escopo: quais serviços e quantos de cada. O mesmo serviço não se repete; a quantidade é um inteiro maior que zero. O operador vê o escopo e não o altera. O tempo padrão do serviço não cria tarefa nem muda a duração das tarefas. No escopo da ficha, a descrição geral, o cliente e o fornecedor ficam à esquerda e os serviços à direita. O cliente vem do catálogo em Operação → Clientes e o fornecedor do catálogo em Operação → Fornecedores; os dois podem ficar vazios. Cada linha do escopo guarda a própria duração, copiada do padrão do serviço ao entrar e editável só naquele projeto; o total exibido é essa duração vezes a quantidade.

## Bolinhas

A API é o único lugar que pinta a bolinha. O cliente só exibe. A ordem visual é a ordem das etapas.

| Situação | Cor |
| --- | --- |
| Etapa inativa, ou ativa sem ninguém alocado | Cinza |
| Etapa ativa, com alguém alocado, e ninguém concluiu todas as próprias tarefas | Azul |
| Ao menos uma pessoa alocada concluiu todas as próprias tarefas e ao menos uma ainda não | Amarela |
| Toda pessoa alocada concluiu todas as próprias tarefas | Verde |

Marcar Feita na tarefa é o sinal de conclusão. Uma pessoa alocada em várias tarefas da mesma etapa só conta como concluída quando todas as tarefas dela nessa etapa estão Feitas. Com uma única pessoa, a etapa vai de azul para verde quando ela termina; não passa por amarelo. Desmarcar Feita recalcula na hora.

Etapa ativada sem pessoa fica cinza. O aviso "sem alocação" aparece para o administrador, na lista e na linha do tempo. O operador não vê esse aviso.

Quando a última pessoa pendente termina e a etapa fica verde, a etapa seguinte que ainda estiver inativa é ativada nesse dia. A API também aceita ativar uma etapa que ainda aguarda, antes de a anterior ficar verde. A ficha do projeto não mostra um comando para essa antecipação.

Incluir uma pessoa nova numa etapa verde pede confirmação: a bolinha volta para amarela até essa pessoa concluir as tarefas dela. Se não restar ninguém alocado, a etapa ativada volta a cinza.

A cor mede essa conclusão. O percentual de tarefas da lista é outro número e não pinta a bolinha.

## Lista de projetos

Tabela com quatro colunas:

- **Nome do projeto.**
- **Status.** Uma bolinha por etapa, na ordem do template.
- **Status %.** Tarefas feitas sobre o total, no formato "30% (3/10)". Sem tarefas, "0% (0/0)".
- **Geral.** "Concluído" só quando o projeto tem etapas e todas estão verdes. Nos demais casos, "Em andamento".

O administrador vê os projetos ativos. O operador vê os seus, com o título Meus projetos. Abrir a linha leva à ficha.

## Ficha do projeto

O nome fica no topo. Abaixo, a linha do tempo horizontal: bolinha, nome da etapa e, sob o nome, o intervalo em dias úteis. Esse intervalo vai do início mais cedo ao fim mais tarde das tarefas da etapa, com os dois extremos inclusos, contando só dias úteis. Tarefas paralelas não se somam. Sem tarefa com data, o texto é "0 dias". A etapa aberta ao entrar é a última da linha que esteja azul, amarela ou verde. Se nenhuma se qualifica, abre a primeira.

O cartão Gantt não aparece no escopo. Na etapa, começa recolhido, com o chevron à direita do título. Aberto, agrupa as tarefas por etapa. Os grupos nascem recolhidos; só a etapa selecionada na linha do tempo começa expandida. As barras usam o farol da tarefa: verde se está Feita, cinza se ainda não começou, amarela se outra tarefa da mesma etapa já está Feita, azul no restante. A coluna de hoje é um vermelho claro e, ao abrir, o gráfico rola para deixá-la na esquerda. Colunas de fim de semana e feriado são cinza claro. Quando as duas pontas do vínculo estão visíveis, uma seta liga o fim da predecessora ao início da sucessora.

A tabela Tarefas, da etapa selecionada, tem as colunas Feita, Tarefa, profissional, início da alocação, Tempo (dias), Fim, Predecessora e, para o administrador, a lixeira. A lixeira apaga a tarefa. Adicionar tarefa inclui uma linha; ela é gravada quando recebe nome. As datas usam um calendário. A mesma pessoa pode estar em várias tarefas da mesma etapa. O profissional escolhido é um operador ativo ou um fornecedor do catálogo.

A predecessora é uma só, do tipo término-início, e precisa ser outra tarefa da mesma etapa ou da etapa imediatamente anterior. A API recusa auto-vínculo, ciclo, outro projeto, etapa posterior e etapa anterior à imediatamente anterior. Com predecessora, o início fica desabilitado e mostra o dia calculado. Limpar a predecessora habilita o início e mantém essa data.

O dia de início conta como dia 1. Uma tarefa que começa em 02/11 e dura 5 dias úteis termina em 06/11, de segunda a sexta, quando sábado e domingo não têm expediente. A duração pula fins de semana e feriados do calendário da equipe. A sucessora começa no próximo dia útil depois do fim da predecessora. Tarefa sem predecessora usa o início informado; se ele não vier, a âncora é a data de ativação da etapa, ou a data de início do projeto enquanto a etapa ainda aguarda. O fim exibido é o que início e tempo determinam. A API calcula essas datas; mudar o calendário recalcula as datas já gravadas.

## Calendário

Em Configuração → Calendário há um calendário só, da equipe inteira. O administrador marca os dias da semana sem expediente (sábado e domingo vêm marcados) e inclui feriados. Salvar grava e recalcula os prazos. O operador não abre essa tela. O Gantt e o relatório de alocação usam o mesmo calendário.

## Equipe

A lista mostra um ponto verde para ativo e cinza para inativo, o nome, o e-mail, o papel e a lixeira. A lixeira pede confirmação. Excluir não apaga o histórico.

Nova pessoa pede nome, e-mail, papel e senha inicial, e tem botão Salvar. O e-mail é único. Editar membro abre duas colunas e não tem botão Salvar: nome, e-mail e senha gravam ao sair do campo (senha em branco mantém a atual); papel e status são listas e gravam ao mudar. Os papéis são Administrador e Operador. O status é Ativo ou Inativo.

Pessoa inativa não entra e não pode ser escolhida numa alocação nova. Alocação já feita permanece, e o nome na tarefa ganha a marca de inativo. O único administrador ativo não pode ser desativado, rebaixado nem excluído. Mudar o papel de quem está alocado em alguma tarefa é recusado até as alocações saírem.

Uma pessoa pode ser excluída mesmo alocada. A tarefa continua. O nome passa a "Usuário excluído". A pessoa some de Equipe e da lista de profissionais, a sessão cai e ela não entra de novo.

## Alocação

Reports → Alocação é uma tabela do mês, só para o administrador. As pessoas ficam nas linhas e os dias nas colunas. Debaixo do número do dia vai a letra da semana: D S T Q Q S S. A célula vazia de dia útil é cinza claro. A célula vazia de fim de semana ou feriado é cinza mais escuro. Um dia com 1 tarefa é verde, com 2 é amarelo e com 3 ou mais é vermelho. Passar o mouse lista projeto e tarefa. O intervalo de cada tarefa entra do início ao fim, inclusive. Dia ocupado usa a cor da contagem, mesmo em fim de semana ou feriado. O que é expediente vem do calendário da equipe.

As linhas trazem os operadores ativos e, no mesmo quadro, o fornecedor que tiver dias nesse mês, pelo nome. Pessoa inativa ou excluída aparece no mês somente se ainda tiver tarefa nesse intervalo; a excluída entra como "Usuário excluído". A visão informa a carga e não impede a alocação.

## Arquitetura

Decisões já em uso. O cliente não escolhe banco, e o banco não fica exposto na internet.

### Cliente

O cliente é Expo com React Native, num único código, para a mesma base poder chegar a iOS e Android. O que roda hoje é a web. A distribuição nas lojas fica para depois e não é um segundo sistema.

O cliente só fala com a API HTTP. Não há conexão direta com o PostgreSQL nem credencial de banco no aplicativo. Em desenvolvimento a API fica em `http://127.0.0.1:8088`.

### API

A API é HTTP e REST. Ela concentra sessão, papéis, bolinhas, ativação da etapa seguinte, calendário útil e o cálculo de início e fim.

Recursos em uso:

- Sessão: entrar e sair. A entrada devolve o papel.
- Pessoas: criar, listar, editar, desativar e excluir.
- Templates: criar, listar, obter, editar, arquivar e excluir quando nenhum projeto os usa. As tarefas viajam com as etapas.
- Projetos: criar a partir de um template, listar, obter, renomear, arquivar com a senha de novo, listar arquivados e excluir o que já está arquivado.
- Etapas: a duração é o intervalo útil entre o início mais cedo e o fim mais tarde das tarefas. A lista devolve a cor, a contagem, o percentual e o rótulo geral.
- Tarefas: criar, editar, excluir e marcar Feita. A alocação (operador ou fornecedor, início e tempo) fica na tarefa. A predecessora é término-início, uma, na mesma etapa ou na imediatamente anterior.
- Calendário: ler e, o administrador, gravar dias sem expediente e feriados.
- Relatório de alocação do mês, só administrador.

A cor, a ativação da etapa seguinte e as datas são regra da API. As migrações ficam com a API e rodam no deploy dela.

### Banco

PostgreSQL, schema `editorial`. Nenhuma tabela é compartilhada com outros sistemas da mesma máquina. O papel `editorial_app`, usado pela API, acessa esse schema, não é superusuário e não usa o schema `public`.

### Execução

API e PostgreSQL sobem como serviços separados no Docker Compose, no projeto `producao-editorial`. Cada um tem imagem, ciclo de vida e volume próprios. O cliente web é estático e pode ser servido pelo proxy já existente na máquina; ele não entra no mesmo contêiner da API.

### Isolamento na VPS compartilhada

A máquina já hospeda outros projetos. Este ocupa a mesma VPS e permanece isolado deles.

- Nome de projeto do Compose dedicado, para redes, volumes e contêineres não caírem no grupo `default` de outra stack.
- Rede bridge própria (`producao-editorial-net`). Os contêineres não usam a rede do host.
- Sem modo privilegiado e sem montar o socket do Docker.
- A API roda com o usuário `node`, raiz do sistema de arquivos somente leitura e um `/tmp` explícito.
- O PostgreSQL publica só em `127.0.0.1:54329`. A API publica só em `127.0.0.1:8088`.
- Volume nomeado próprio para os dados do PostgreSQL.
- Limites de CPU e memória no Compose.
- Arquivo de ambiente e segredos próprios. As senhas do exemplo servem só para a máquina local.
- Nomes de contêiner prefixados por `producao-editorial`.
- TLS e o hostname público ficam no proxy reverso que já existe na VPS. Esse proxy é quem recebe tráfego da internet e encaminha para a API.

A marca do proxy não faz parte desta decisão: vale o que já termina TLS na VPS. O destino é essa VPS compartilhada.

Há um único time. Não há organizações separadas nem permissão por cliente. A interface e as mensagens são em português.

## O que ainda não existe

Confirmado ausente no código e nas telas:

- Avisos e notificações.
- Comentários e anexos.
- Linha de base e caminho crítico.
- Vínculos que não sejam término-início, mais de uma predecessora, espera, antecipação e restrições de data.
- Painel de atrasos.
