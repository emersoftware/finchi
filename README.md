# Finchi

Tracker de finanzas personales por CLI para bancos chilenos. Importa transacciones vía scrapers bancarios, las categoriza con fuzzy matching y fallback a LLM, y expone tanto una TUI interactiva como un CLI scriptable diseñado para funcionar bien con agentes de código.

---

## Requisitos

- [Bun](https://bun.sh) ≥ 1.0 — único requisito de runtime

```bash
curl -fsSL https://bun.sh/install | bash
```

---

## Instalación

```bash
npm install -g finchi
# o: bun install -g finchi
# o: pnpm install -g finchi
```

Bun debe estar instalado en el sistema independientemente del package manager que uses para instalar.

---

## Dónde viven los datos

Todo lo persistente vive en `~/.finchi/`:

| Archivo | Propósito |
|---|---|
| `~/.finchi/finchi.db` | Base de datos SQLite (se crea automáticamente en el primer uso) |
| `~/.finchi/.env` | API keys y credenciales bancarias |

Puedes sobrescribir la ruta de la base de datos con `FINCHI_DB_PATH=<ruta>`.

---

## Inicio rápido

```bash
# 1. Setup interactivo — configura el proveedor LLM y primera cuenta bancaria
finchi setup

# 2. Importar transacciones
finchi sync --month 2026-03

# 3. Categorizar transacciones importadas
finchi categorize

# 4. Revisar categorías sugeridas
finchi review

# 5. Abrir dashboard
finchi dashboard
```

Correr `finchi` sin argumentos abre el dashboard si el setup está completo, o el wizard de setup si no lo está.

---

## Configuración

### Proveedor LLM

Finchi usa un LLM para categorizar transacciones que no puede emparejar por fuzzy search.

```bash
# Interactivo
finchi setup provider

# Scriptable
finchi providers set --provider anthropic --model claude-sonnet-4-20250514 --api-key sk-ant-...
finchi providers set --provider openai    --model gpt-4.1-mini              --api-key sk-...
finchi providers set --provider google   --model gemini-2.5-flash-preview-05-20 --api-key AI...

# Ver proveedor activo
finchi providers get --json

# Limpiar config de proveedor
finchi providers clear
```

Proveedores soportados: `anthropic`, `openai`, `google`, `openrouter`, `minimax`.

### Cuentas bancarias

```bash
# Ver bancos disponibles
finchi accounts banks --json

# Agregar cuenta (guarda credenciales en ~/.finchi/.env)
finchi accounts add --bank bci --name "Cuenta BCI" --rut 12345678-9 --password secret

# Agregar sin persistir credenciales (solo en memoria, se pierden al salir)
finchi accounts add --bank bci --name "Cuenta BCI" --rut 12345678-9 --password secret --save memory

# Listar cuentas configuradas
finchi accounts list --json

# Editar alias
finchi accounts edit --id 1 --name "BCI Personal"

# Eliminar
finchi accounts remove --id 1
```

---

## Referencia de comandos

### sync

Importa transacciones desde el banco.

```bash
finchi sync                          # todas las cuentas, ventana por defecto
finchi sync --month 2026-03
finchi sync --from 2026-03-01 --to 2026-03-31
finchi sync --1m | --3m | --6m | --12m
finchi sync --account-id 1 --json
finchi sync --bank bci --json
```

La inserción es idempotente — re-sincronizar el mismo período nunca crea duplicados (clave SHA256 de fecha + descripción + monto).

### txns

Leer y editar transacciones.

```bash
# Listar (acepta todos los filtros de abajo)
finchi txns list --json
finchi txns list --month 2026-03 --group Comida --json
finchi txns list --type expense --status confirmed --json

# Ver una transacción
finchi txns get --id 42 --json

# Editar
finchi txns edit --id 42 --category-id 3 --json
finchi txns edit --id 42 --category "Supermercado" --label "compra semanal" --json
finchi txns edit --id 42 --status confirmed --json

# Edición masiva
finchi txns bulk-edit --month 2026-03 --set-category "Transporte" --json
finchi txns bulk-edit --ids 1,2,3 --set-status confirmed --json
```

**Filtros disponibles en `txns list` y `txns bulk-edit`:**

| Flag | Ejemplo |
|---|---|
| `--from` | `--from 2026-03-01` |
| `--to` | `--to 2026-03-31` |
| `--month` | `--month 2026-03` |
| `--category` | `--category Supermercado` |
| `--category-id` | `--category-id 3` (repetible) |
| `--group` | `--group Comida` (repetible) |
| `--account` | `--account "BCI Personal"` |
| `--account-id` | `--account-id 1` (repetible) |
| `--source` | `--source web` (repetible) |
| `--type` | `--type expense` o `--type income` |
| `--status` | `--status confirmed` |
| `--search` | `--search uber` |

### dashboard

```bash
finchi dashboard                     # abre TUI interactiva
finchi dashboard summary --json      # resumen legible por máquina
finchi dashboard summary --month 2026-03 --json
finchi dashboard summary --group Comida --json
```

El output de `summary` incluye totales por grupo, desglose ingresos vs gastos, y balance neto. Acepta los mismos filtros que `txns list`.

### review

Las transacciones pasan por `uncategorized → pending_review → confirmed`. Solo las `confirmed` alimentan el corpus de fuzzy matching.

```bash
finchi review                        # abre TUI interactiva
finchi review list --json            # listar transacciones pending_review
finchi review confirm --id 42 --json
finchi review bulk-confirm --ids 1,2,3 --json
finchi review bulk-confirm --all --json
```

### categories

```bash
finchi categories groups --json
finchi categories list --json
finchi categories list --group Comida --json
finchi categories get --id 3 --json
finchi categories add --name "Delivery" --group "Comida" --emoji 🛵
finchi categories edit --id 3 --name "Delivery" --exclude-from-summary false
```

### config

```bash
finchi config show --json            # muestra config activa (redacta secretos)
```

---

## Guía para agentes LLM

El CLI de Finchi está diseñado como superficie de API de primera clase para agentes de código. Todo comando de lectura y escritura soporta `--json`.

### Formato de output JSON

Éxito:
```json
{ "success": true, "data": { ... } }
```

Error (exit code 1):
```json
{ "success": false, "error": "error_code", "message": "Descripción legible" }
```

### Flujo típico de un agente

```bash
# 1. Verificar qué está configurado
finchi config show --json
finchi accounts list --json
finchi providers get --json

# 2. Sincronizar transacciones recientes
finchi sync --month 2026-03 --json

# 3. Categorizar transacciones sin categoría
finchi categorize

# 4. Ver qué necesita revisión
finchi review list --json

# 5. Confirmar todas las sugerencias
finchi review bulk-confirm --all --json

# 6. Obtener resumen de gastos
finchi dashboard summary --month 2026-03 --json

# 7. Inspeccionar categorías específicas
finchi txns list --group Comida --month 2026-03 --json
```

### Setup scriptable (sin prompts interactivos)

```bash
finchi providers set --provider anthropic --model claude-sonnet-4-20250514 --api-key $ANTHROPIC_API_KEY --json
finchi accounts add --bank bci --name "BCI" --rut $BCI_RUT --password $BCI_PASS --json
```

### Hechos clave del modelo de datos

- Los montos son enteros CLP. Gastos son negativos, ingresos son positivos.
- Las fechas en la base de datos son `YYYY-MM-DD`.
- Flujo de estado de transacciones: `uncategorized → pending_review → confirmed`
- Solo las transacciones `confirmed` se usan para el fuzzy matching de futuras transacciones.
- Las categorías tienen un campo `group` (ej. "Comida", "Transporte") para agrupar en resúmenes.
- Las categorías con `excludeFromSummary: true` se omiten del `dashboard summary`.

---

## Variables de entorno

| Variable | Default | Propósito |
|---|---|---|
| `FINCHI_DB_PATH` | `~/.finchi/finchi.db` | Sobreescribir ruta de la base de datos |
| `FINCHI_CONFIDENCE_THRESHOLD` | `0.8` | Confianza mínima para aplicar categoría LLM automáticamente |
| `FINCHI_SIMILARITY_THRESHOLD` | `0.85` | Similitud mínima para fuzzy match |
| `LLM_PROVIDER` | `anthropic` | Proveedor LLM activo |
| `LLM_MODEL` | default del proveedor | Nombre del modelo |
| `LLM_BASE_URL` | default del proveedor | Base URL (para OpenRouter / endpoints custom) |
| `ANTHROPIC_API_KEY` | — | API key de Anthropic |
| `OPENAI_API_KEY` | — | API key de OpenAI / OpenRouter |
| `GOOGLE_API_KEY` | — | API key de Google Gemini |
| `<BANCO>_RUT` | — | RUT bancario, ej. `BCI_RUT` |
| `<BANCO>_PASS` | — | Clave bancaria, ej. `BCI_PASS` |

Las variables se cargan desde `~/.finchi/.env` primero, luego desde `.env` en el directorio de trabajo actual (local sobreescribe global).

---

## Desarrollo local

```bash
git clone https://github.com/emersoftware/finchi
cd finchi
bun install
bun run src/cli.ts --help

# Correr tests
bun test

# Tests específicos
bun test tests/agent-cli.test.ts
bun test tests/dashboard.test.ts
```

Un `.env` local en la raíz del proyecto sobreescribe `~/.finchi/.env` durante el desarrollo.
