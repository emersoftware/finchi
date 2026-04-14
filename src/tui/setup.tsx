import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { Db } from "../db/index";
import { getDb } from "../db/index";
import { getEnvPath } from "../config";
import { accounts } from "../db/schema";
import { LOGO_LINES } from "./logo";
import {
  type ActiveProviderConfig,
  type Bank,
  getActiveProviderConfig,
  insertAccount,
  insertMovements,
  loadBankList,
  saveModelConfig,
  scrapeBank,
  tryCategorize,
  writeEnvCredentials,
  PROVIDERS,
  resolveStartupState,
} from "../flows/setup";

export type SetupMode = "full" | "bank" | "model";
type SaveMode = "env" | "memory";

export type Step =
  | "loading"
  | "existingAccountAction"
  | "missingAccountAction"
  | "bank"
  | "accountName"
  | "rut"
  | "password"
  | "saveMode"
  | "importing"
  | "retry"
  | "categorizePrompt"
  | "missingProviderAction"
  | "existingProviderAction"
  | "provider"
  | "model"
  | "customModel"
  | "apiKey"
  | "categorizing"
  | "summary"
  | "done";

interface SetupAppProps {
  mode: SetupMode;
  onComplete: (result: SetupResult) => void;
  db?: Db;
  options?: SetupRunOptions;
}

export interface SetupResult {
  action: "exit" | "dashboard";
}

export interface SetupRunOptions {
  db?: Db;
  envPath?: string | null;
  loadBanks?: () => Promise<Bank[]>;
  activeProviderConfig?: ActiveProviderConfig | null;
  scrapeBank?: (bankId: string, rut: string, password: string) => Promise<{ movements: any[] } | null>;
  tryCategorize?: (db: Db) => Promise<{ count: number; warnings: string[] }>;
  writeEnvCredentials?: (envPath: string, bankId: string, rut: string, password: string) => void;
  saveModelConfig?: (envPath: string, provider: typeof PROVIDERS[number], model: string, apiKey: string) => void;
}

export function resolveInitialSetupStep(
  mode: SetupMode,
  hasAccounts: boolean,
  hasProvider: boolean,
): Step {
  if (mode === "model") return hasProvider ? "existingProviderAction" : "provider";
  if (mode === "bank") return "bank";

  const startupState = resolveStartupState(hasAccounts, hasProvider);
  if (startupState === "dashboard") return "existingAccountAction";
  if (startupState === "missingProvider") return "missingProviderAction";
  if (startupState === "missingAccount") return "missingAccountAction";
  return "bank";
}

export function resolvePostImportStep(
  mode: SetupMode,
  importedCount: number,
  hasProvider: boolean,
): Step {
  if (importedCount === 0) {
    if (mode === "bank") return "summary";
    return hasProvider ? "summary" : "missingProviderAction";
  }

  if (mode === "bank") return "summary";
  return hasProvider ? "categorizePrompt" : "missingProviderAction";
}

function normalizeRutInput(value: string): string {
  return value.replace(/[^0-9kK-]/g, "").toUpperCase();
}

function formatRutPreview(value: string): string {
  const normalized = normalizeRutInput(value);
  if (!normalized) return "12.345.678-9";

  const [bodyPart, verifierPart = ""] = normalized.split("-");
  const body = bodyPart.replace(/\D/g, "");
  const verifier = verifierPart.replace(/[^0-9K]/g, "").slice(0, 1);

  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return verifier ? `${withDots}-${verifier}` : withDots;
}

function SelectList({
  title,
  help,
  options,
  selectedIndex,
}: {
  title: string;
  help: string;
  options: { label: string; hint?: string }[];
  selectedIndex: number;
}) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="cyan">{title}</Text>
      <Box marginTop={1} flexDirection="column">
        {options.map((option, index) => {
          const active = index === selectedIndex;
          return (
            <Text key={`${option.label}-${index}`} color={active ? "green" : undefined}>
              {active ? "›" : " "} {option.label}{option.hint ? `  ${option.hint}` : ""}
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{help}</Text>
      </Box>
    </Box>
  );
}

function InputScreen({
  title,
  value,
  help,
  placeholder,
  hidden,
  error,
}: {
  title: string;
  value: string;
  help: string;
  placeholder?: string;
  hidden?: boolean;
  error?: string | null;
}) {
  const displayValue = hidden ? "•".repeat(value.length) : value;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="cyan">{title}</Text>
      <Box marginTop={1}>
        <Text>
          <Text color="green">› </Text>
          {displayValue}
          <Text color="green">█</Text>
        </Text>
      </Box>
      {!displayValue && placeholder ? (
        <Box marginTop={1}>
          <Text dimColor>Ejemplo: {placeholder}</Text>
        </Box>
      ) : null}
      {error ? (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text dimColor>{help}</Text>
      </Box>
    </Box>
  );
}

function PasswordInputScreen({
  value,
  error,
}: {
  value: string;
  error?: string | null;
}) {
  const masked = value.length > 0 ? "•".repeat(value.length) : "";

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="cyan">Ingresa tu clave de internet</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color="green">› </Text>
          {masked}
          <Text color="green">█</Text>
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {!masked ? <Text dimColor>Ejemplo: ••••••••</Text> : null}
        <Text dimColor>La clave se oculta en pantalla.</Text>
        <Text dimColor>Enter para continuar.</Text>
      </Box>
      {error ? (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function RutInputScreen({
  value,
  error,
}: {
  value: string;
  error?: string | null;
}) {
  const normalized = normalizeRutInput(value);
  const preview = formatRutPreview(value);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="cyan">Ingresa tu RUT</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color="green">› </Text>
          {normalized}
          <Text color="green">█</Text>
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {!normalized ? <Text dimColor>Ejemplo: 12345678-9</Text> : null}
        <Text dimColor>Vista previa: {preview}</Text>
        <Text dimColor>Solo numeros, guion y K. Enter para continuar.</Text>
      </Box>
      {error ? (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

export function SetupApp({ mode, onComplete, db: providedDb, options }: SetupAppProps) {
  const { exit } = useApp();
  const db = useMemo<Db>(() => providedDb ?? getDb(), [providedDb]);

  const [step, setStep] = useState<Step>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [banks, setBanks] = useState<Bank[]>([]);
  const [existingAccounts, setExistingAccounts] = useState<{ id: number; name: string; bankId: string }[]>([]);
  const [bankIndex, setBankIndex] = useState(0);
  const [existingAccountActionIndex, setExistingAccountActionIndex] = useState(0);
  const [rut, setRut] = useState("");
  const [password, setPassword] = useState("");
  const [accountInputName, setAccountInputName] = useState("");
  const [saveModeIndex, setSaveModeIndex] = useState(0);
  const [retryIndex, setRetryIndex] = useState(0);
  const [categorizeIndex, setCategorizeIndex] = useState(0);
  const [existingProviderActionIndex, setExistingProviderActionIndex] = useState(0);
  const [providerIndex, setProviderIndex] = useState(0);
  const [modelIndex, setModelIndex] = useState(0);
  const [customModel, setCustomModel] = useState("");
  const [apiKey, setApiKey] = useState("");

  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const [categorizedCount, setCategorizedCount] = useState(0);
  const [status, setStatus] = useState("Cargando setup...");
  const [activeProviderConfig] = useState(() => options?.activeProviderConfig ?? getActiveProviderConfig());

  const provider = PROVIDERS[providerIndex] ?? PROVIDERS[0];
  const modelOptions = useMemo(
    () => [
      ...provider.models.map((model) => ({ value: model, label: model })),
      { value: "__custom__", label: "Otro modelo..." },
    ],
    [provider],
  );

  useEffect(() => {
    let mounted = true;
    const loadBanks = options?.loadBanks ?? loadBankList;
    loadBanks().then((loadedBanks) => {
      if (!mounted) return;
      setBanks(loadedBanks);
      const currentAccounts = db.select().from(accounts).all();
      setExistingAccounts(currentAccounts);
      setStep(resolveInitialSetupStep(mode, currentAccounts.length > 0, !!activeProviderConfig));
    }).catch((err) => {
      if (!mounted) return;
      setError(err instanceof Error ? err.message : String(err));
      setStep("done");
    });
    return () => { mounted = false; };
  }, [activeProviderConfig, db, mode]);

  function complete(result: SetupResult) {
    onComplete(result);
    exit();
  }

  async function runImport(shouldRetry = false) {
    if (!selectedBank) return;
    setBusy(true);
    setError(null);
    setStatus(shouldRetry ? "Reintentando conexion..." : "Conectando al banco e importando transacciones...");
    setStep("importing");

    try {
      if (saveModeIndex === 0 && options?.envPath !== null) {
        const envPath = options?.envPath ?? getEnvPath();
        const persistCredentials = options?.writeEnvCredentials ?? writeEnvCredentials;
        persistCredentials(envPath, selectedBank.id, rut, password);
      }

      let nextAccountId = accountId;
      if (nextAccountId === null) {
        nextAccountId = await insertAccount(db, selectedBank.id, accountInputName.trim());
        setAccountId(nextAccountId);
        setAccountName(accountInputName.trim());
      }

      const scrapeBankFn = options?.scrapeBank ?? scrapeBank;
      const scrapeResult = await scrapeBankFn(selectedBank.id, rut, password);
      if (!scrapeResult) {
        setStatus("No se pudo conectar al banco");
        setStep("retry");
        return;
      }

      const imported = await insertMovements(db, nextAccountId, scrapeResult.movements);
      setImportedCount(imported);
      setStatus(imported === 0 ? "No se encontraron transacciones nuevas." : `${imported} transacciones importadas`);
      setStep(resolvePostImportStep(mode, imported, !!activeProviderConfig));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Error al importar transacciones");
      setStep("retry");
    } finally {
      setBusy(false);
    }
  }

  async function runCategorization() {
    setBusy(true);
    setError(null);
    setStatus("Categorizando transacciones...");
    setStep("categorizing");

    try {
      const tryCategorizeFn = options?.tryCategorize ?? tryCategorize;
      const result = await tryCategorizeFn(db);
      setCategorizedCount(result.count);
      setWarnings(result.warnings);
      setStatus(`${result.count} transacciones categorizadas`);
      setStep("summary");
    } catch (err) {
      setWarnings([]);
      setError(err instanceof Error ? err.message : "Error al categorizar");
      setStep("summary");
    } finally {
      setBusy(false);
    }
  }

  function commitModelSetup() {
    const chosen = modelOptions[modelIndex];
    const model = chosen?.value === "__custom__" ? customModel.trim() : chosen?.value ?? "";
    if (!model) {
      setError("El modelo es obligatorio");
      setStep(chosen?.value === "__custom__" ? "customModel" : "model");
      return;
    }
    if (!apiKey.trim()) {
      setError("La API key es obligatoria");
      setStep("apiKey");
      return;
    }

    if (options?.envPath !== null) {
      const envPath = options?.envPath ?? getEnvPath();
      const persistModelConfig = options?.saveModelConfig ?? saveModelConfig;
      persistModelConfig(envPath, provider, model, apiKey);
    }
    if (mode === "model") {
      setStatus("Configuracion guardada.");
      setStep("summary");
      return;
    }
    runCategorization();
  }

  useInput((input, key) => {
    if (busy) {
      if (input === "q") {
        complete({ action: "exit" });
      }
      return;
    }

    if (key.escape || input === "q") {
      complete({ action: "exit" });
      return;
    }

    if (step === "existingAccountAction") {
      if (key.upArrow) setExistingAccountActionIndex((current) => Math.max(0, current - 1));
      if (key.downArrow) setExistingAccountActionIndex((current) => Math.min(1, current + 1));
      if (key.return) {
        if (existingAccountActionIndex === 0) {
          complete({ action: "dashboard" });
        } else {
          setStep("bank");
        }
      }
      return;
    }

    if (step === "missingAccountAction") {
      if (key.upArrow) setExistingAccountActionIndex((current) => Math.max(0, current - 1));
      if (key.downArrow) setExistingAccountActionIndex((current) => Math.min(1, current + 1));
      if (key.return) {
        if (existingAccountActionIndex === 0) {
          setStep("bank");
        } else {
          complete({ action: "exit" });
        }
      }
      return;
    }

    if (step === "bank") {
      if (key.upArrow) setBankIndex((current) => Math.max(0, current - 1));
      if (key.downArrow) setBankIndex((current) => Math.min(banks.length - 1, current + 1));
      if (key.return) {
        const bank = banks[bankIndex];
        if (!bank) return;
        setSelectedBank(bank);
        setAccountInputName("");
        setStep("accountName");
        setError(null);
      }
      return;
    }

    if (step === "accountName") {
      if (key.return) {
        if (!accountInputName.trim()) {
          setError("El nombre de la cuenta es obligatorio");
          return;
        }
        setError(null);
        setStep("rut");
        return;
      }
      if (key.backspace || key.delete) {
        setAccountInputName((current) => current.slice(0, -1));
        return;
      }
      if (!key.ctrl && !key.meta && input) {
        setAccountInputName((current) => current + input);
      }
      return;
    }

    if (step === "rut") {
      if (key.return) {
        if (!normalizeRutInput(rut).trim()) {
          setError("El RUT es obligatorio");
          return;
        }
        setRut((current) => normalizeRutInput(current));
        setError(null);
        setStep("password");
        return;
      }
      if (key.backspace || key.delete) {
        setRut((current) => current.slice(0, -1));
        return;
      }
      if (!key.ctrl && !key.meta && input) {
        setRut((current) => normalizeRutInput(current + input));
      }
      return;
    }

    if (step === "password") {
      if (key.return) {
        if (!password.length) {
          setError("La clave es obligatoria");
          return;
        }
        setError(null);
        setStep("saveMode");
        return;
      }
      if (key.backspace || key.delete) {
        setPassword((current) => current.slice(0, -1));
        return;
      }
      if (!key.ctrl && !key.meta && input) {
        setPassword((current) => current + input);
      }
      return;
    }

    if (step === "saveMode") {
      if (key.upArrow) setSaveModeIndex((current) => Math.max(0, current - 1));
      if (key.downArrow) setSaveModeIndex((current) => Math.min(1, current + 1));
      if (key.return) {
        runImport();
      }
      return;
    }

    if (step === "retry") {
      if (key.leftArrow || key.upArrow) setRetryIndex(0);
      if (key.rightArrow || key.downArrow) setRetryIndex(1);
      if (key.return) {
      if (retryIndex === 0) {
          runImport(true);
        } else {
          setStatus("Cuenta guardada. Ejecuta 'finchi sync' cuando estes listo.");
          setStep("summary");
        }
      }
      return;
    }

    if (step === "categorizePrompt") {
      if (key.leftArrow || key.upArrow) setCategorizeIndex(0);
      if (key.rightArrow || key.downArrow) setCategorizeIndex(1);
      if (key.return) {
        if (categorizeIndex === 0) {
          setStep(activeProviderConfig ? "existingProviderAction" : "provider");
        } else {
          setStep("summary");
        }
      }
      return;
    }

    if (step === "missingProviderAction") {
      if (key.upArrow) setExistingProviderActionIndex((current) => Math.max(0, current - 1));
      if (key.downArrow) setExistingProviderActionIndex((current) => Math.min(1, current + 1));
      if (key.return) {
        if (existingProviderActionIndex === 0) {
          setStep("provider");
        } else {
          complete({ action: "dashboard" });
        }
      }
      return;
    }

    if (step === "existingProviderAction") {
      if (key.upArrow) setExistingProviderActionIndex((current) => Math.max(0, current - 1));
      if (key.downArrow) setExistingProviderActionIndex((current) => Math.min(1, current + 1));
      if (key.return) {
        if (existingProviderActionIndex === 0) {
          if (mode === "model") {
            setStatus("Usando configuracion actual.");
            setStep("summary");
          } else {
            runCategorization();
          }
        } else {
          setStep("provider");
        }
      }
      return;
    }

    if (step === "provider") {
      if (key.upArrow) setProviderIndex((current) => Math.max(0, current - 1));
      if (key.downArrow) setProviderIndex((current) => Math.min(PROVIDERS.length - 1, current + 1));
      if (key.return) {
        setModelIndex(0);
        setCustomModel("");
        setError(null);
        setStep("model");
      }
      return;
    }

    if (step === "model") {
      if (key.upArrow) setModelIndex((current) => Math.max(0, current - 1));
      if (key.downArrow) setModelIndex((current) => Math.min(modelOptions.length - 1, current + 1));
      if (key.return) {
        if (modelOptions[modelIndex]?.value === "__custom__") {
          setStep("customModel");
        } else {
          setStep("apiKey");
        }
      }
      return;
    }

    if (step === "customModel") {
      if (key.return) {
        if (!customModel.trim()) {
          setError("El modelo es obligatorio");
          return;
        }
        setError(null);
        setStep("apiKey");
        return;
      }
      if (key.backspace || key.delete) {
        setCustomModel((current) => current.slice(0, -1));
        return;
      }
      if (!key.ctrl && !key.meta && input) {
        setCustomModel((current) => current + input);
      }
      return;
    }

    if (step === "apiKey") {
      if (key.return) {
        commitModelSetup();
        return;
      }
      if (key.backspace || key.delete) {
        setApiKey((current) => current.slice(0, -1));
        return;
      }
      if (!key.ctrl && !key.meta && input) {
        setApiKey((current) => current + input);
      }
      return;
    }

    if (step === "summary" || step === "done") {
      if (input === "d" && mode !== "model" && (importedCount > 0 || existingAccounts.length > 0)) {
        complete({ action: "dashboard" });
        return;
      }
      if (key.return) {
        complete({ action: "exit" });
      }
    }
  });

  const saveModes = [
    { label: "Guardar en .env", hint: "Persistente" },
    { label: "Solo esta vez", hint: "No guardar credenciales" },
  ];

  const yesNoOptions = [
    { label: "Si" },
    { label: "No" },
  ];

  const usingExistingProviderOnly =
    mode === "model" &&
    step === "summary" &&
    status === "Usando configuracion actual." &&
    !!activeProviderConfig;

  const summaryLines: string[] = [];
  if (selectedBank) summaryLines.push(`Banco: ${selectedBank.name}`);
  if (accountName) summaryLines.push(`Cuenta creada: ${accountName}`);
  if (mode !== "model") summaryLines.push(`Importadas: ${importedCount}`);
  if (categorizedCount > 0) summaryLines.push(`Categorizadas: ${categorizedCount}`);
  if (usingExistingProviderOnly && activeProviderConfig) {
    summaryLines.push(`Provider actual: ${activeProviderConfig.provider.name}`);
    summaryLines.push(`Modelo actual: ${activeProviderConfig.model}`);
  }
  if (mode === "model" && !usingExistingProviderOnly) summaryLines.push(`Proveedor: ${provider.name}`);
  if (mode === "model" && !usingExistingProviderOnly) {
    const chosen = modelOptions[modelIndex];
    summaryLines.push(`Modelo: ${chosen?.value === "__custom__" ? customModel.trim() : chosen?.value}`);
  }
  if (status) summaryLines.push(`Estado: ${status}`);

  return (
    <Box flexDirection="column" padding={1}>
      {LOGO_LINES.map((line, index) => (
        <Text key={index}>{line}</Text>
      ))}

      <Box marginTop={1}>
        <Text bold>
          {mode === "full" ? "Configuracion inicial" : mode === "bank" ? "Agregar banco" : "Configurar proveedor de IA"}
        </Text>
      </Box>

      {step === "loading" && <Text dimColor>Cargando opciones...</Text>}

      {step === "existingAccountAction" && (
        <Box flexDirection="column" marginTop={1}>
          <SelectList
            title="Ya tienes cuentas configuradas"
            help="Usa ↑/↓ y Enter."
            options={[
              { label: "Continuar con mis cuentas", hint: "Abrir dashboard" },
              { label: "Agregar otra cuenta", hint: "Nuevo banco o nueva cuenta" },
            ]}
            selectedIndex={existingAccountActionIndex}
          />
          <Box marginTop={1} flexDirection="column">
            {existingAccounts.map((account) => (
              <Text key={account.id} dimColor>• {account.name}</Text>
            ))}
          </Box>
        </Box>
      )}

      {step === "missingAccountAction" && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">Ya tienes model/provider configurado, pero no hay ninguna cuenta conectada.</Text>
          <Text dimColor>Sin una cuenta, el dashboard no tiene nada util que mostrar.</Text>
          <SelectList
            title="Necesitas agregar una cuenta para seguir"
            help="Usa ↑/↓ y Enter."
            options={[
              { label: "Agregar cuenta ahora", hint: "Continuar onboarding" },
              { label: "Salir", hint: "Cerrar finchi" },
            ]}
            selectedIndex={existingAccountActionIndex}
          />
        </Box>
      )}

      {step === "bank" && (
        <SelectList
          title="Selecciona tu banco"
          help="Usa ↑/↓ y Enter. q para salir."
          options={banks.map((bank) => ({ label: bank.name }))}
          selectedIndex={bankIndex}
        />
      )}

      {step === "accountName" && (
        <InputScreen
          title="Nombre para esta cuenta"
          value={accountInputName}
          placeholder={selectedBank ? `${selectedBank.name} personal` : "Cuenta corriente personal"}
          help="Este nombre se usa para distinguir cuentas del mismo banco."
          error={error}
        />
      )}

      {step === "rut" && (
        <RutInputScreen value={rut} error={error} />
      )}

      {step === "password" && (
        <PasswordInputScreen value={password} error={error} />
      )}

      {step === "saveMode" && (
        <SelectList
          title="Como quieres guardar las credenciales"
          help="Usa ↑/↓ y Enter."
          options={saveModes}
          selectedIndex={saveModeIndex}
        />
      )}

      {step === "importing" && (
        <Box marginTop={1}>
          <Text color="yellow">{busy ? "Procesando..." : "Listo"}</Text>
          <Text> {status}</Text>
        </Box>
      )}

      {step === "retry" && (
        <>
          <Box marginTop={1}>
            <Text color="red">{status}</Text>
          </Box>
          <SelectList
            title="Quieres intentar de nuevo?"
            help="Usa ←/→ o ↑/↓ y Enter."
            options={yesNoOptions}
            selectedIndex={retryIndex}
          />
        </>
      )}

      {step === "categorizePrompt" && (
        <SelectList
          title={`Quieres categorizar las ${importedCount} transacciones con IA?`}
          help="Usa ←/→ o ↑/↓ y Enter."
          options={yesNoOptions}
          selectedIndex={categorizeIndex}
        />
      )}

      {step === "missingProviderAction" && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">Aun no tienes model/provider configurado.</Text>
          <Text dimColor>Puedes configurarlo ahora para categorizar con IA o saltarlo y entrar directo al dashboard.</Text>
          <SelectList
            title="Quieres configurarlo ahora?"
            help="Usa ↑/↓ y Enter."
            options={[
              { label: "Configurar provider", hint: "Elegir provider, modelo y API key" },
              { label: "Saltar por ahora", hint: "Abrir dashboard sin IA" },
            ]}
            selectedIndex={existingProviderActionIndex}
          />
        </Box>
      )}

      {step === "existingProviderAction" && activeProviderConfig && (
        <Box flexDirection="column" marginTop={1}>
          <SelectList
            title="Ya tienes un provider configurado"
            help="Usa ↑/↓ y Enter."
            options={[
              { label: `Usar ${activeProviderConfig.provider.name}`, hint: activeProviderConfig.model },
              { label: "Configurar otro provider", hint: "Mantiene las keys existentes" },
            ]}
            selectedIndex={existingProviderActionIndex}
          />
        </Box>
      )}

      {step === "provider" && (
        <SelectList
          title="Selecciona el proveedor"
          help="Usa ↑/↓ y Enter."
          options={PROVIDERS.map((item) => ({ label: item.name }))}
          selectedIndex={providerIndex}
        />
      )}

      {step === "model" && (
        <SelectList
          title="Selecciona el modelo"
          help="Usa ↑/↓ y Enter."
          options={modelOptions.map((item) => ({ label: item.label }))}
          selectedIndex={modelIndex}
        />
      )}

      {step === "customModel" && (
        <InputScreen
          title="Escribe el nombre del modelo"
          value={customModel}
          placeholder={provider.id === "openrouter" ? "qwen/qwen3-235b-a22b" : "mi-modelo-custom"}
          help="Enter para continuar."
          error={error}
        />
      )}

      {step === "apiKey" && (
        <InputScreen
          title={`Ingresa tu API key de ${provider.name}`}
          value={apiKey}
          hidden
          help="La key se guarda en .env. Enter para confirmar."
          error={error}
        />
      )}

      {step === "categorizing" && (
        <Box marginTop={1}>
          <Text color="yellow">{busy ? "Procesando..." : "Listo"}</Text>
          <Text> {status}</Text>
        </Box>
      )}

      {(step === "summary" || step === "done") && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="green">Resumen</Text>
          {summaryLines.map((line) => (
            <Text key={line}>{line}</Text>
          ))}
          {warnings.map((warning) => (
            <Text key={warning} color="yellow">{warning}</Text>
          ))}
          {error ? <Text color="red">{error}</Text> : null}
          {mode !== "model" && importedCount > 0 ? (
            <Box marginTop={1}>
              <Text dimColor>Enter para salir. Presiona d para abrir el dashboard.</Text>
            </Box>
          ) : (
            <Box marginTop={1}>
              <Text dimColor>Enter para salir.</Text>
            </Box>
          )}
        </Box>
      )}

    </Box>
  );
}

export async function runSetupInk(mode: SetupMode, options?: SetupRunOptions): Promise<SetupResult> {
  const { render } = await import("ink");
  let result: SetupResult = { action: "exit" };
  const { waitUntilExit } = render(
    <SetupApp
      mode={mode}
      db={options?.db}
      options={options}
      onComplete={(nextResult) => {
        result = nextResult;
      }}
    />,
  );
  await waitUntilExit();
  return result;
}
