# Paula Olhan — V16

Aplicativo HTML/JavaScript com funções Node na Vercel e modelos de contrato no Neon.

## Agenda

Edição pelo formulário, arraste, reposição/substituição e propostas do assistente usam `scheduleRequest` / `OlhanSchedule.prepare`. Toda alteração é revisada com as opções **Somente esta sessão**, **Esta e as próximas** e **Cancelar sem alterar**. A recorrência abrange somente as próximas sessões cadastradas do mesmo dia/horário da série. Outros dias da semana e exceções anteriores ficam preservados. Sessões com registro clínico ou fechamento permanecem bloqueadas. Um conflito impede a aplicação de toda a sequência.

## Assistente e evolução por áudio

O menu e a página inicial oferecem **Assistente Olhan**. A IA propõe operações validadas por `assistant-actions.js`. As operações passam por revisão antes de salvar. Alterações de agenda ainda exigem a escolha de alcance. Contratos, fechamentos e evoluções abrem formulários para revisão, sem assinatura, pagamento ou conclusão clínica automática. Limites de demonstração continuam em vigor.

O assistente aceita gravação ou arquivo de áudio para transcrever um pedido editável, preservando o texto digitado. A transcrição nunca executa ações. Sair da página encerra o microfone, cancela pedidos pendentes e descarta o áudio.

A evolução aceita gravação de até três minutos, arquivo de áudio de até 2,5 MB ou texto. O servidor usa Groq para transcrição e organização fiel do relato. Não preenche valores ausentes nem determina condutas clínicas. A profissional escolhe os campos que deseja aplicar. Campos manuais começam desmarcados. O áudio não é armazenado no aplicativo.

### Ativação no servidor

Cadastrar **somente nas variáveis de ambiente da Vercel**:

- `GROQ_API_KEY`: chave de uma conta Groq autorizada para esta aplicação.
- `OLHAN_AI_ACCESS_CODE`: código aleatório e forte para limitar o acesso à API de IA. Recomendação: pelo menos 24 caracteres.
- `GROQ_TEXT_MODEL` (opcional): padrão `openai/gpt-oss-120b`.
- `GROQ_TRANSCRIPTION_MODEL` (opcional): padrão `whisper-large-v3`.

Depois de configurar, fazer novo deploy e usar **Assistente Olhan > Conectar IA** com o código de acesso. A chave do provedor nunca é enviada ao navegador. O código é validado em `/api/ai-access` e não fica salvo no JavaScript. A sessão usa cookie assinado `__Host-olhan-ai`, HttpOnly, Secure e SameSite=Strict. A opção Manter conectado dura até 30 dias; desmarcada, o cookie dura a sessão do navegador. Desconectar remove o cookie; trocar o código no servidor invalida todas as sessões existentes. Cookies não entram no backup. Sessões exigem HTTPS. O token legado de sessionStorage é aceito temporariamente e removido ao reconectar. Sem as duas variáveis obrigatórias, `/api/ai` responde `AI_NOT_CONFIGURED` e não chama o provedor. Não copiar credenciais de outro projeto.

A proteção por código é específica da IA. A autenticação de usuários e a sincronização dos cadastros clínicos continuam pendentes. Dados e áudios enviados à IA são processados pela Groq. O servidor não registra texto, áudio ou chave nos logs. O limite em memória de requisições é apenas uma proteção adicional, sem substituir autenticação e quotas do provedor.

## Contratos da equipe

`team_service` e `team_ip` são modelos versionados de `public.contract_templates`. A API retorna `template_key`, permitindo distinguir os modelos. O corpo integral dos documentos enviados fica no banco, sem incorporar os anexos com CPF/endereço ao repositório. Novas versões preservam as anteriores.

Contratos da equipe têm edição própria, identificação da profissional, cópia do modelo escolhido, assinatura no aplicativo e PDF. Não são migrados nem duplicados usando o modelo do paciente. Os dados da titular e a versão ficam preservados no documento emitido. A remuneração descrita no contrato não altera a regra financeira cadastrada. Trechos como `(definir política)` exigem revisão antes de assinar.

## Validação

`npm ci` e `npm test` executam os testes de agenda, BI, cuidado, propostas do assistente, integração de formulários e contratos do SDK Groq com respostas simuladas. A chamada real de IA só pode ser validada depois da configuração autorizada das credenciais.

Os cadastros clínicos e os contratos emitidos continuam locais ao navegador. Somente os modelos online estão persistidos no servidor. Exportar backup JSON continua incluindo os dados desta versão.

## Cloudflare R2 — conexão privada preparada

`/api/storage` (GET) verifica a conexão por `HeadBucket`, sem ler nem listar arquivos. Usa `R2_ENDPOINT` (origem S3 sem caminho do bucket), `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY`, exclusivamente no servidor. Os aliases `R2_ACESS_KEY_ID` / `R2_SECRET_ACESS_KEY` também são aceitos para preservar os segredos cadastrados na Vercel. O tipo Secret/Sensitive não permite renomear uma variável sem informar novamente seu valor. Nunca puxar ou imprimir os valores para corrigir o nome.

Configurações → Vídeos privados permite verificar a conexão. O status retorna apenas booleanos e um código de situação, sem credenciais, nomes de objetos ou mensagens do provedor. A sonda tem limite de oito segundos, uma tentativa e cache por processo (cinco minutos em sucesso; um minuto em falha), com compartilhamento de requisições simultâneas.

**Envio, leitura e links assinados de vídeos NÃO foram habilitados.** A sessão compartilhada de IA não é usada como autorização para arquivos clínicos. Primeiro é necessário criar autenticação individual da equipe e vincular arquivos/pacientes a permissões verificadas no servidor. Depois integrar upload direto (para evitar o limite de corpo da Vercel), CORS da origem exata, metadados persistidos e reprodução privada. Manter acesso público e r2.dev desativados. O portal demonstrativo e os anexos locais permanecem como antes. Esta entrega prepara e verifica a infraestrutura, sem declarar concluída a integração de vídeos.
# Acesso de administradora

O acesso individual usa Better Auth 1.7.12 no servidor Vercel e tabelas `olhan_auth_*` no Neon. A identidade gerenciada antiga em `neon_auth` é preservada. A migração aditiva está em `migrations/20261024-admin-auth.sql`; aplique primeiro em uma branch isolada e depois em produção. RLS bloqueia acesso público às tabelas de identidade.

Configure em produção `BETTER_AUTH_URL` (origem HTTPS sem barra final), `BETTER_AUTH_SECRET` (segredo aleatório de pelo menos 32 caracteres), `OLHAN_ADMIN_EMAIL`, `DATABASE_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `SMTP_FROM`. Senhas e chaves ficam exclusivamente em variáveis sensíveis do servidor. O Gmail exige senha de app e verificação em duas etapas.

Na tela de acesso, “Primeiro acesso ou esqueci minha senha” envia um link de uso único por 30 minutos ao e-mail cadastrado. Somente o e-mail de administradora reservado pode iniciar a primeira conta; cadastro público está bloqueado. Ela escolhe a senha (mínimo 12 caracteres). Todo novo login com senha exige o link de confirmação por e-mail (10 minutos), sem dispositivo confiável. O link abre uma tela de confirmação; se o e-mail abrir em outro navegador, o código pode ser digitado no navegador original. Links usam fragmentos para não enviar os códigos aos logs HTTP. Nenhuma senha é enviada por e-mail.

Configurações → Conta e senha permite trocar a senha e sair. Redefinir a senha invalida as sessões anteriores e não autentica automaticamente. A sessão dura até 8 horas e usa cookie HttpOnly, Secure em produção e SameSite. Todas as APIs existentes exigem sessão individual; a autorização compartilhada de IA continua sendo uma configuração adicional e não substitui a identidade.

`npm run build` publica somente os arquivos estáticos permitidos. O HTML do aplicativo é entregue por `api/app.js` após checar a sessão no banco. `/` e `/index.html` encaminham para essa função. Não publique `index.html` diretamente nem exponha o diretório de fontes como saída estática.

Os dados clínicos continuam neste navegador; esta entrega não faz sincronização nem concede acesso de familiares/equipe. O R2 permanece sem envio/leitura de arquivos clínicos até haver autorização por paciente no servidor. Faça backup antes de mudar de dispositivo.

Validação: `npm test`. Para testar Postgres em banco isolado, aplique a migração e execute `AUTH_TEST_DATABASE_URL=... node --test tests/auth-postgres.test.mjs`. O teste usa apenas e-mail fictício e entrega de mensagens em memória; nunca use esse teste em produção. Em um preview com banco isolado, `OLHAN_AUTH_SELF_TEST=1` executa essa validação durante o build sem enviar e-mails reais.
