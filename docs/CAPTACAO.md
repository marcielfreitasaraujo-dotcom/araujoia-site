# Captação de clientes: configuração e operação

Formulário "Quero receber um contato" no final do site, com banco de dados, aviso por e-mail e painel privado em `/admin`.

## Como funciona

| Peça | Tecnologia | Onde fica |
|---|---|---|
| Formulário (front-end) | HTML/CSS/JS puro, mesmo design do site | `index.html` (seção `#formulario`) |
| Receber e validar o envio | Netlify Function `POST /api/lead` | `netlify/functions/lead.mjs` |
| Anti-spam (token) | Netlify Function `GET /api/form-token` | `netlify/functions/form-token.mjs` |
| Banco de dados | **Netlify Blobs** (privado, persistente, sem conta extra) | `netlify/lib/store.mjs` |
| E-mail de aviso | **Resend** (API chamada só pelo servidor) | `netlify/lib/email.mjs` |
| Painel do proprietário | Página `/admin` + API `/api/admin/*` com sessão assinada | `admin/index.html`, `netlify/functions/admin.mjs` |
| Reenvio automático, prazo de guarda e limpeza | Função agendada (a cada 15 min) | `netlify/functions/notify-retry.mjs` |
| Aviso de privacidade | Página estática | `privacidade.html` |

Por que essa escolha: o site já roda no Netlify com deploy automático pelo GitHub. Netlify Functions e Netlify Blobs funcionam na mesma hospedagem, sem servidor, banco ou conta extras. O único serviço externo é o de e-mail.

O botão **Solicitar orçamento** (e os botões "Fale conosco") leva ao questionário. Obrigatórios: nome completo, e-mail, telefone com DDD, interesse principal e o aceite do aviso de privacidade. Opcionais, para você já chegar preparado no contato: nome da empresa, prazo desejado, investimento previsto, site atual e uma descrição do projeto. Tudo vai no e-mail de aviso e fica no painel `/admin`.

**O formulário só aparece no site depois de configurado.** A página consulta `/api/form-token`; enquanto `ADMIN_PASSWORD` e `FORM_SECRET` não existirem no servidor, a seção fica oculta e nenhum dado é coletado (para nunca guardar contatos que você não consiga ler).

## Variáveis de ambiente

Cadastre em **Netlify → Site configuration → Environment variables** (modelo em `.env.example`; nunca faça commit de um `.env` real).

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `ADMIN_PASSWORD` | Sim | Senha do painel `/admin`. Use uma senha longa e única. |
| `FORM_SECRET` | Sim | Texto aleatório (32+ caracteres) que assina tokens anti-spam e sessões. Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `RESEND_API_KEY` | Para e-mail | Chave da API do Resend. |
| `NOTIFY_EMAIL` | Para e-mail | Endereço que recebe o aviso de novo contato. |
| `NOTIFY_FROM` | Não | Remetente. Padrão `Araujo.IA <onboarding@resend.dev>`. |
| `ALLOWED_ORIGINS` | Não | Domínios extras autorizados a enviar o formulário (ex.: `https://www.araujoia.com.br`), além do próprio site. Necessário quando o domínio próprio for conectado e diferir do endereço do site. |
| `RETENTION_DAYS` | Não | Dias sem atividade até a exclusão automática (padrão 365). Mantenha igual ao prazo do aviso de privacidade. |

Depois de cadastrar as variáveis, faça um novo deploy (**Deploys → Trigger deploy → Deploy site**), pois funções só leem variáveis novas após o deploy.

## Configurar o e-mail (Resend)

1. Crie uma conta gratuita em resend.com.
2. Em **API Keys**, crie uma chave (permissão "Sending access") e cadastre como `RESEND_API_KEY` no Netlify.
3. Cadastre `NOTIFY_EMAIL` com o e-mail que deve receber os avisos.
4. Enquanto não houver domínio verificado no Resend, o remetente padrão `onboarding@resend.dev` só entrega para **o e-mail da própria conta Resend**. Use o mesmo e-mail em `NOTIFY_EMAIL` para começar.
5. Para enviar de um endereço próprio, verifique seu domínio em **Domains** no Resend e defina `NOTIFY_FROM` (ex.: `Araujo.IA <contato@seudominio.com.br>`).

Se o e-mail falhar ou não estiver configurado, **o contato é salvo mesmo assim**. No painel ele aparece com o aviso "E-mail falhou/não configurado" e o botão **Reenviar notificação**. A função agendada também tenta de novo sozinha, até 5 vezes, sem criar contatos duplicados.

## Painel `/admin`

Acesse `https://SEU-SITE/admin/` e entre com `ADMIN_PASSWORD`. Permite ver todos os contatos, buscar por nome, e-mail ou telefone, filtrar por status, ordenar por data, alterar o status (novo, em atendimento, contatado, concluído), copiar o telefone, abrir o WhatsApp com o número do cliente (mensagem inicial pré-preenchida, enviada manualmente por você), reenviar a notificação e excluir um contato definitivamente. A sessão dura 8 horas e usa cookie `HttpOnly`/`SameSite=Strict`; há limite de tentativas de login.

## Segurança e privacidade (resumo do que está implementado)

- Validação no navegador e de novo no servidor (nome completo, e-mail, telefone brasileiro com DDD válido, interesse da lista, consentimento explícito).
- Dados normalizados e armazenados sem HTML executável. O painel e o e-mail escapam todo o conteúdo do visitante.
- Anti-spam: campo isca (honeypot), token assinado com tempo mínimo de preenchimento, limite por IP (8 tentativas/10 min e 30/dia), tamanho máximo do corpo e bloqueio de origem externa.
- Sem duplicidade: chave de idempotência por envio e bloqueio do mesmo e-mail+telefone por 10 minutos.
- O IP não é armazenado: guardamos apenas um hash dele com segredo.
- Credenciais só em variáveis de ambiente, nunca no navegador. Logs não contêm dados pessoais.
- Código-fonte, testes e documentação são bloqueados no site público (`netlify.toml`). O painel tem `noindex`.
- Consentimento registrado por contato: data/hora e versão do aviso (`PRIVACY_VERSION` em `netlify/lib/config.mjs`).

### Pendências do proprietário (jurídico/LGPD)

O texto de `privacidade.html` é um modelo preparado com base no que o sistema realmente faz. **Revise com atenção antes de divulgar:**

1. Inclua a razão social e o CNPJ (ou CPF, se for pessoa física) da controladora e um e-mail de contato para titulares, se desejar. Hoje o aviso indica WhatsApp e Instagram.
2. Confirme o prazo de guarda (12 meses sem atividade). Se mudar, ajuste o texto e `RETENTION_DAYS`.
3. Se mudar de prestador (e-mail/hospedagem), atualize o item 4 do aviso.
4. Se alterar o texto de consentimento do formulário ou o aviso, atualize `PRIVACY_VERSION`.
5. Pedidos de titulares (acesso, correção, exclusão) são atendidos manualmente: localize o contato no painel e use "Excluir" quando for o caso.

## Rodar localmente

```bash
npm install
cp .env.example .env     # preencha ADMIN_PASSWORD e FORM_SECRET (valores de teste)
npm run dev:mock         # http://localhost:5173, com e-mail simulado (nada é enviado de verdade)
```

`npm run dev` usa o Resend real se `RESEND_API_KEY` e `NOTIFY_EMAIL` estiverem no `.env`. Localmente os contatos ficam em `.data/` (ignorado pelo git). O painel fica em `http://localhost:5173/admin/`.

## Testes

```bash
npm test
```

Cobrem validação (e-mail, telefone), envio válido, campos vazios, dados inválidos, honeypot, token, duplicidade, limite de requisições, origem externa, falha e reenvio de e-mail, notificação não configurada, autenticação e ações do painel, exclusão, prazo de guarda e a ausência de segredos nos arquivos públicos. O envio real de e-mail depende de credenciais e precisa ser validado depois da configuração (veja abaixo).

## Publicar em produção

1. Faça commit e push para `main` (o Netlify publica sozinho).
2. Cadastre as variáveis de ambiente e rode um novo deploy.
3. Abra o site: a seção do formulário deve aparecer sozinha. Se não aparecer, confira `ADMIN_PASSWORD` e `FORM_SECRET`.
4. **Teste de ponta a ponta:** envie um contato fictício ("TESTE"), confira o e-mail recebido, veja o contato em `/admin` e exclua-o.

## Limitações conhecidas

- O envio real pelo Resend não foi exercitado nos testes (sem credenciais): foi validado contra um servidor simulado com o mesmo formato de requisição.
- Netlify Blobs não tem consulta por índice; o painel carrega os contatos e filtra no servidor, o que atende bem a centenas ou poucos milhares de contatos.
- Sair do painel apaga o cookie do navegador, mas o token de sessão continua válido até expirar (8 h). Trocar `ADMIN_PASSWORD` invalida todas as sessões.
- Não há envio automático de WhatsApp ao visitante: o contato é iniciado manualmente por você pelo botão do painel.
