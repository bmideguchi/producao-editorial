# Produção editorial

Aplicação da equipe de produção editorial. O administrador configura pessoas, templates e projetos. Quem opera vê os projetos em que participa, com uma bolinha por etapa.

O recorte deste repositório é o MVP: login, papéis, cadastros e a esteira com as cores cinza, azul, amarela e verde. O planejamento completo está em [docs/planejamento-produto.md](docs/planejamento-produto.md).

## Subir na máquina local

1. Copie `.env.example` para `.env`. As senhas do exemplo servem só para a máquina local. Troque-as antes de usar uma VPS.
2. Suba a API e o PostgreSQL:

```
docker compose up --build
```

3. No cliente:

```
cd client
npm install
npx expo start --web
```

A API fica em `http://127.0.0.1:8088`. O cliente fala com ela por `EXPO_PUBLIC_API_URL`, que por padrão também é `http://localhost:8088`.

O primeiro acesso usa o administrador definido em `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD`. O exemplo entra com `admin@example.com` e `troque-esta-senha`. Na primeira subida, os templates Livro e Revista já vêm cadastrados.

## Isolamento na VPS

A stack usa o projeto Compose `producao-editorial`, rede bridge própria e contêineres com nome prefixado. O PostgreSQL só escuta em `127.0.0.1:54329`. A API só escuta em `127.0.0.1:8088`, com usuário não root, filesystem raiz somente leitura, sem modo privilegiado e sem socket do Docker. O proxy que já termina TLS na máquina encaminha o hostname público para essa porta. O cliente web é exportado à parte (`npx expo export --platform web`) e servido por esse proxy, com fallback para `index.html`.
