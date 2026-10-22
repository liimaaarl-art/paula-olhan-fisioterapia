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
