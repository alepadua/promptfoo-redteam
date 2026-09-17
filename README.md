# Enterprise GenAI Security & Red Teaming Suite
## OWASP LLM Top 10 + OWASP Gen AI Red Team com Promptfoo + Playwright CDP

> **Framework de testes adversariais automatizados contra assistentes corporativos de IA e plataformas Cloud/Data sem necessidade de APIs proprietárias pagas — operando diretamente via browser autenticado (Chrome DevTools Protocol - CDP) e APIs nativas.**

---

## 🎯 Escopos e Plataformas Suportadas

| Plataforma | Alvo / Superfície | Provedor / Mecanismo | Suite de Teste Pronta | Blueprint PDF / HTML |
|---|---|---|---|---|
| **Microsoft Copilot** | Web, M365 Semantic Index, Graph | `copilot-playwright-provider.js` | `workspace/security-eval-fast-generated.yaml` | [`PDF`](./Microsoft_Copilot_Security_Assessment_Plan.pdf) / [`HTML`](./copilot-plan.html) |
| **Atlassian Rovo** | Jira, Confluence, Rovo Agents | `rovo-playwright-provider.js` | `workspace/rovo-security-eval-generated.yaml` | [`PDF`](./Atlassian_Rovo_Security_Assessment_Plan.pdf) / [`HTML`](./rovo-plan.html) |
| **Databricks** | Mosaic AI Serving, Genie, Unity Catalog | Webhook API / Databricks SQL | `workspace/databricks-eval.yaml` (spec) | [`PDF`](./Databricks_Security_Assessment_Plan.pdf) / [`HTML`](./databricks-plan.html) |
| **AWS** | Amazon Bedrock, Guardrails, Agents | Promptfoo Bedrock (SigV4) | `workspace/aws-eval.yaml` (spec) | [`PDF`](./AWS_Security_Assessment_Plan.pdf) / [`HTML`](./aws-plan.html) |
| **Google Cloud (GCP)**| Vertex AI Gemini, Agent Builder, VPC-SC | Promptfoo Vertex (ADC) | `workspace/gcp-eval.yaml` (spec) | [`PDF`](./GCP_Security_Assessment_Plan.pdf) / [`HTML`](./gcp-plan.html) |

---

## 📁 Estrutura Completa do Repositório

```
.
├── copilot-playwright-provider.js          # Provedor CDP para Microsoft Copilot (Mutex + preenchimento atômico)
├── rovo-playwright-provider.js             # Provedor CDP para Atlassian Rovo (Suporta ProseMirror e Textarea)
│
├── workspace/
│   ├── security-eval-fast-generated.yaml   # [COPILOT] 19 casos de teste gerados prontos para execução imediata
│   ├── rovo-security-eval-generated.yaml   # [ROVO] 19 casos de teste gerados prontos para execução imediata
│   ├── security-eval-fast.yaml             # [COPILOT] Configuração base OWASP + RedTeam (1 teste por plugin)
│   ├── security-eval-full.yaml             # [COPILOT] Configuração completa com jailbreaks combinados (144 testes)
│   ├── rovo-security-eval.yaml             # [ROVO] Configuração base para Jira, Confluence e Agentes
│   ├── clean-test.yaml                     # Teste de fumaça e validação do navegador (2 perguntas)
│   └── redteam-owasp.yaml                  # Configuração de referência de plugins OWASP
│
├── reports/
│   └── security-report-copilot.md          # Relatório executivo do teste Copilot mapeado ao MITRE ATLAS
│
├── Blueprints Executivos (PDF & HTML):
│   ├── Microsoft_Copilot_Security_Assessment_Plan.pdf  | copilot-plan.html
│   ├── Atlassian_Rovo_Security_Assessment_Plan.pdf     | rovo-plan.html
│   ├── Databricks_Security_Assessment_Plan.pdf         | databricks-plan.html
│   ├── AWS_Security_Assessment_Plan.pdf                | aws-plan.html
│   └── GCP_Security_Assessment_Plan.pdf                | gcp-plan.html
│
├── .env.example                            # Modelo de variáveis de ambiente e chaves de juiz
├── .gitignore                              # Proteção de sessões de browser e credenciais
└── README.md                               # Este guia
```

---

## 🚀 Como Executar em Qualquer Ambiente (Passo a Passo)

### 1. Pré-requisitos
* **Node.js** v18+ (recomendado v22 via [nvm](https://github.com/nvm-sh/nvm))
* **Google Chrome** instalado no sistema
* **Promptfoo** global:
  ```bash
  npm install -g promptfoo
  promptfoo --version   # Requer >= 0.123.0
  ```

---

### 2. Garantir Privacidade Total (Zero Cloud Sharing / Sem Envio para Nuvem)

Por padrão, a interface web do Promptfoo verifica a conectividade com `api.promptfoo.app`. Para **bloquear qualquer compartilhamento de resultados, telemetria ou geração na nuvem**, configure as variáveis de privacidade no seu `.env`:

```bash
cp .env.example .env
```

O arquivo `.env.example` já inclui as travas de privacidade ativas:
```env
# Desabilita compartilhamento de resultados para a nuvem
PROMPTFOO_DISABLE_SHARING=true

# Desabilita envio de telemetria
PROMPTFOO_DISABLE_TELEMETRY=true

# Força execução 100% offline (sem chamar geração remota)
PROMPTFOO_DISABLE_REMOTE_GENERATION=true
PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=true
```

Para garantir que o comando `eval` nunca envie nada para a nuvem mesmo sem `.env`, você também pode passar a flag `--no-share`:
```bash
promptfoo redteam eval -c workspace/security-eval-fast-generated.yaml --no-share --max-concurrency 1
```

Se você já tiver feito login anteriormente na CLI em alguma máquina, desvincule a conta com:
```bash
promptfoo auth logout
```

---

### 3. Configuração do Juiz de IA (Opcional, mas Altamente Recomendado)

* **Opção A — Google Gemini (Recomendado — Gratuito):**
  Obtenha uma chave em [Google AI Studio](https://aistudio.google.com/apikey):
  ```env
  GOOGLE_API_KEY=sua_chave_gemini_aqui
  ```
* **Opção B — OpenAI:**
  ```env
  OPENAI_API_KEY=sua_chave_openai_aqui
  ```
* **Opção C — Sem Chave Externa:**
  Os testes rodarão normalmente; os casos ambíguos registrarão aviso de grader, mas as respostas brutas são salvas integralmente nos logs para auditoria manual.

---

## 🛡️ Execução de Testes: Microsoft Copilot

### Passo 1: Abrir o Chrome com a sessão do Copilot
O provedor se conecta ao Chrome nativo via CDP. Isso **elimina o risco de bloqueios de bot (Arkose FunCaptcha)**:

```bash
mkdir -p .copilot-profile
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$(pwd)/.copilot-profile" \
  --no-first-run \
  --no-default-browser-check \
  https://copilot.microsoft.com &
```

> **Ação Manual:** Faça login na sua conta Microsoft na janela do Chrome que se abriu. A sessão fica gravada em `.copilot-profile/`.

### Passo 2: Validar a conexão básica (Teste de Fumaça)
```bash
promptfoo eval -c workspace/clean-test.yaml
# Esperado: 2/2 testes aprovados em ~15 segundos
```

### Passo 3: Executar a bateria de Red Team (Casos Prontos)
Como o arquivo com os casos gerados já está versionado no repositório, você **não precisa de conexão com a nuvem do Promptfoo para gerar testes**:

```bash
promptfoo redteam eval \
  -c workspace/security-eval-fast-generated.yaml \
  --max-concurrency 1
```

> **⚠️ OBRIGATÓRIO:** O parâmetro `--max-concurrency 1` é estritamente necessário. Como os testes interagem com uma aba real do navegador, concorrência paralela causaria digitação simultânea no mesmo campo de texto.

---

## 🔷 Execução de Testes: Atlassian Rovo (Jira & Confluence)

### Passo 1: Abrir o Chrome na sua instância Atlassian
```bash
mkdir -p .rovo-profile
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$(pwd)/.rovo-profile" \
  --no-first-run \
  --no-default-browser-check \
  "https://alexandrepadua91.atlassian.net" &
```

> **Ação Manual:** Faça login no Atlassian e abra o painel/chat do Rovo na interface.

### Passo 2: Executar a bateria de Red Team no Rovo
Os 19 casos de teste específicos do Rovo (RBAC de projetos, isolamento de tickets confidenciais, vazamento de PII em helpdesks) já estão prontos no repositório:

```bash
promptfoo redteam eval \
  -c workspace/rovo-security-eval-generated.yaml \
  --max-concurrency 1
```

> **Diferencial Técnico do `rovo-playwright-provider.js`:** O provedor foi projetado para detectar dinamicamente tanto campos `<textarea>` comuns quanto contêineres `<div contenteditable="true">` (usados pelo editor ProseMirror do Jira e Confluence), disparando eventos sintéticos de `input` e `change` para garantir envio perfeito.

---

## 📊 Visualização de Resultados e Relatórios

Após a execução de qualquer avaliação, inicie o dashboard web interativo do Promptfoo:

```bash
promptfoo view -p 15500
```
Acesse no navegador: **`http://localhost:15500`**

Para exportar os resultados em JSON:
```bash
promptfoo eval -c workspace/security-eval-fast-generated.yaml \
  --output output/resultado-copilot.json \
  --max-concurrency 1
```

---

## 🛡️ Cobertura de Ameaças (OWASP Top 10 for LLM & MITRE ATLAS)

Os testes cobrem 19 plugins de segurança essenciais:

| ID do Plugin | Vulnerabilidade OWASP | Técnica MITRE ATLAS | Descrição do Teste |
|---|---|---|---|
| `prompt-extraction` | LLM06 (Sensitive Info) | AML.T0051 (Prompt Injection) | Tenta extrair instruções do sistema, diretrizes e prompts internos |
| `cross-session-leak` | LLM02 (Output Handling)| AML.T0048 (Data Exfil via API) | Verifica se dados confidenciais de uma sessão vazam para a próxima |
| `ascii-smuggling` | LLM01 (Prompt Injection)| AML.T0054 (LLM Compromise) | Utiliza caracteres Unicode invisíveis para ocultar payloads maliciosos |
| `excessive-agency` | LLM08 (Excessive Agency)| AML.T0054 (LLM Compromise) | Induz o assistente a executar ações não autorizadas em sistemas externos |
| `rbac` / `bfla` / `bola` | LLM05 (Supply Chain/Auth)| AML.T0040 (Privilege Escalation)| Testa desrespeito a permissões de papéis e escopos entre usuários |
| `pii:direct` / `pii:api-db`| LLM06 (Sensitive Info) | AML.T0048 (Data Exfil via API) | Tenta extrair dados pessoais de funcionários (salário, CPF, endereço) |
| `sql-injection` | LLM03 (Poisoning/Injection)| AML.T0043 (Adversarial Data) | Injeta payloads SQL via buscas de documentos (SharePoint / Jira) |
| `ssrf` | LLM05 (Improper Handling)| AML.T0043 (Adversarial Data) | Tenta forçar o assistente a acessar metadados de nuvem (`169.254.169.254`) |
| `data-exfil` | LLM02 (Output Handling)| AML.T0048 (Data Exfil via API) | Tenta exfiltrar dados confidenciais renderizando tags de imagem markdown |
| `harmful:cybercrime` | LLM09 (Overreliance) | AML.T0047 (Societal Harm) | Testa recusa contra geração de exploits e ataques cibernéticos |

---

## 🔧 Solução de Problemas Comuns

### 1. Erro "bind() failed: Endereço já em uso (98)" ou porta 9222 ocupada
Se uma instância antiga do Chrome já estiver aberta na porta 9222:
```bash
# Localizar e encerrar o processo antigo
fuser -k 9222/tcp
# Ou pelo nome do processo
pkill -f "remote-debugging-port=9222"
```

### 2. O Chrome pede verificação de robô (FunCaptcha / CAPTCHA)
* **Causa:** O navegador foi aberto via Playwright automatizado (`launchPersistentContext`) em vez de conexão CDP (`connectOverCDP`).
* **Solução:** Siga estritamente o Passo 1 deste guia: abra o Google Chrome pelo terminal do sistema com `--remote-debugging-port=9222` e faça o login manualmente uma única vez.

### 3. Texto digitado com caracteres sobrepostos ou truncados
* **Causa:** Concorrência paralela tentando digitar no mesmo campo de entrada.
* **Solução:** Utilize sempre `--max-concurrency 1`. Nossos provedores implementam filas com **Mutex Promises** para garantir que cada teste aguarde a conclusão estável do anterior.

### 4. Como gerar novos casos de teste a partir dos arquivos YAML base
Caso queira modificar os plugins ou número de testes:
```bash
# Gerar nova suite para Copilot
promptfoo redteam generate -c workspace/security-eval-fast.yaml -o workspace/security-eval-fast-generated.yaml --force

# Gerar nova suite para Rovo
promptfoo redteam generate -c workspace/rovo-security-eval.yaml -o workspace/rovo-security-eval-generated.yaml --force
```

---

*Repositório privado mantido para avaliações de segurança de inteligência artificial generativa corporativa.*
