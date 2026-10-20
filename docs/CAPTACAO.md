# Captação de clientes: configuração e operação

O botão **Solicitar orçamento** (no topo da página, no menu e no cabeçalho) abre o questionário numa janela (modal) por cima do site; ele não fica exposto no meio ou no fim da página. Cada envio é salvo e chega completo no seu e-mail, para você chamar o cliente por telefone ou WhatsApp.

## Como o aviso chega até você

Há dois canais de aviso. O primeiro funciona sem nenhuma senha ou chave:

| Canal | O que precisa | O que faz |
|---|---|---|
| **Netlify Forms** (padrão) | Só indicar o seu e-mail em *Forms → Notifications* no Netlify (uma vez) | Guarda cada envio no painel *Forms* do Netlify e manda e-mail com todos os dados |
| **Resend** (opcional) | Conta no resend.com + variáveis `RESEND_API_KEY` e `NOTIFY_EMAIL` | E-mail extra, no formato do projeto, com remetente configurável |

Além disso, todo contato é salvo no banco do projeto (Netlify Blobs). Com `ADMIN_PASSWORD` definido, o painel `/admin` mostra essa lista, com status, busca, WhatsApp e exclusão. Se um canal falhar, o contato é preservado e o aviso é reenviado (botão no painel e rotina automática a cada 15 minutos). Um canal que já deu certo nunca é repetido, então não há avisos duplicados.

### Configurar o e-mail do Netlify Forms (uma vez)

1. Netlify → seu site → **Forms** (o formulário `orcamento` aparece depois do primeiro deploy com esta versão).
2. **Form notifications → Add notification → Email notification**.
3. Informe o e-mail que vai receber os orçamentos e escolha o formulário `orcamento`. Salve.

O plano gratuito do Netlify inclui 100 envios de formulário por mês.

## Arquitetura

| Peça | Tecnologia | Onde fica |
|---|---|---|
| Questionário (front-end) | HTML/CSS/JS puro, mesmo design do site, em `<dialog>` | `index.html` (`<dialog id="formulario">`) |
| Declaração do formulário ao Netlify | `<form name="orcamento" data-netlify>` oculto | `index.html` |
| Receber e validar o envio | Netlify Function `POST /api/lead` | `netlify/functions/lead.mjs` |
| Anti-spam (token) | Netlify Function `GET /api/form-token` | `netlify/functions/form-token.mjs` |
| Banco de dados | **Netlify Blobs** (privado, persistente, sem conta extra) | `netlify/lib/store.mjs` |
| Aviso (Netlify Forms e Resend) | `fetch` pelo servidor | `netlify/lib/forms.mjs`, `netlify/lib/email.mjs` |
| Painel do proprietário | `/admin` + API `/api/admin/*` com sessão assinada | `admin/index.html`, `netlify/functions/admin.mjs` |
| Reenvio, prazo de guarda e limpeza | Função agendada (15 min) | `netlify/functions/notify-retry.mjs` |
| Aviso de privacidade | Página estática | `privacidade.html` |

Os botões só abrem o questionário quando a página recebe "ok" de `/api/form-token`; caso contrário eles levam à seção de contato (WhatsApp e Instagram), o que acontece quando há um jeito de você receber os contatos (Netlify Forms, que é o padrão, ou `ADMIN_PASSWORD`).

## O questionário

Obrigatórios: nome completo, e-mail, telefone com DDD, interesse principal e o aceite do aviso de privacidade. Opcionais, para você chegar preparado ao contato: nome da empresa, prazo desejado, investimento previsto, site atual e uma descrição do projeto.

## Variáveis de ambiente (todas opcionais)

Cadastre em **Netlify → Site configuration → Environment variables** (modelo em `.env.example`; nunca faça commit de um `.env` real). Depois de mudar variáveis, faça um novo deploy.

| Variável | Para que serve |
|---|---|
| `ADMIN_PASSWORD` | Liga o painel `/admin` (senha forte e só sua). Sem ela, o painel fica desativado. |
| `RESEND_API_KEY` + `NOTIFY_EMAIL` | Liga o aviso por e-mail via Resend. |
| `NOTIFY_FROM` | Remetente do Resend. Padrão `Araujo.IA <onboarding@resend.dev>`, que só entrega para o e-mail da sua conta Resend. Para remetente próprio, verifique o domínio em *Domains* no Resend. |
| `FORM_SECRET` | Segredo de assinatura. Se não existir, o servidor gera um e guarda sozinho. |
| `NETLIFY_FORMS` | Use `off` para desligar o canal do Netlify Forms. |
| `ALLOWED_ORIGINS` | Domínios extras autorizados a enviar o formulário (ex.: `https://www.araujoia.com.br`), necessário quando o domínio próprio for conectado. |
| `RETENTION_DAYS` | Dias sem atividade até a exclusão automática (padrão 365). Mantenha igual ao aviso de privacidade. |

## Painel `/admin`

Ative definindo `ADMIN_PASSWORD`. Acesse `https://SEU-SITE/admin/`. Permite ver todos os contatos, buscar por nome, e-mail ou telefone, filtrar por status, ordenar por data, alterar o status (novo, em atendimento, contatado, concluído), copiar o telefone, abrir o WhatsApp com o número do cliente (mensagem inicial pré-preenchida, enviada manualmente por você), reenviar o aviso e excluir um contato definitivamente. A sessão dura 8 horas e usa cookie `HttpOnly`/`SameSite=Strict`; há limite de tentativas de login.

## Segurança e privacidade (resumo do que está implementado)

- Validação no navegador e de novo no servidor (nome completo, e-mail, telefone brasileiro com DDD válido, opções de listas, consentimento explícito).
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
3. Os contatos também ficam no painel *Forms* do Netlify, que não é limpo pela rotina automática. Exclua envios antigos por lá quando necessário (*Forms → formulário → Submissions*).
4. Se mudar de prestador, atualize o item 4 do aviso. Se alterar o texto de consentimento ou o aviso, atualize `PRIVACY_VERSION`.
5. Pedidos de titulares (acesso, correção, exclusão) são atendidos manualmente: localize o contato no painel (e no *Forms* do Netlify) e exclua quando for o caso.

## Rodar localmente

```bash
npm install
npm run dev:mock         # http://localhost:5173, com avisos simulados (nada é enviado de verdade)
```

`npm run dev:mock` imprime no terminal o e-mail e o envio ao Netlify Forms simulados. Para testar o painel, rode com `ADMIN_PASSWORD=teste npm run dev:mock` (no Windows use um arquivo `.env`). Localmente os contatos ficam em `.data/` (ignorado pelo git). O painel fica em `http://localhost:5173/admin/`.

## Testes

```bash
npm test
```

Cobrem validação, envio válido, campos vazios, dados inválidos, honeypot, token, duplicidade, limite de requisições, origem externa, falha e reenvio de aviso nos dois canais (sem duplicar), geração automática do segredo, autenticação e ações do painel, exclusão, prazo de guarda e a ausência de segredos nos arquivos públicos.

## Publicar em produção

1. Commit e push para `main` (o Netlify publica sozinho).
2. Configure o e-mail em *Forms → Notifications* (veja acima).
3. **Teste de ponta a ponta:** envie um orçamento fictício ("TESTE") pelo site, confira o e-mail, veja o envio em *Forms* no Netlify e, se usar o painel, em `/admin`. Exclua o contato de teste.

## Limitações conhecidas

- O envio ao Netlify Forms depende de a detecção de formulários estar ativa no site e do limite do plano (100 envios/mês no gratuito). O e-mail é do próprio Netlify (assunto e formato padrão deles).
- O Netlify Forms aplica filtro de spam próprio e pode, raramente, marcar um envio legítimo como spam (ele aparece na aba de spam do painel *Forms*).
- Netlify Blobs não tem consulta por índice; o painel carrega os contatos e filtra no servidor, o que atende bem a centenas ou poucos milhares de contatos.
- Sair do painel apaga o cookie do navegador, mas o token de sessão continua válido até expirar (8 h). Trocar `ADMIN_PASSWORD` invalida todas as sessões.
- Não há envio automático de WhatsApp ao visitante: o contato é iniciado manualmente por você.
