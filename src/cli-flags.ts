export type FlagValue = string | boolean | string[];
export type Flags = Record<string, FlagValue>;

export function hasFlag(flags: Flags, key: string): boolean {
  return flags[key] === true;
}

export function getFlagString(flags: Flags, key: string): string | undefined {
  const value = flags[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[value.length - 1];
  return undefined;
}

export function getFlagStrings(flags: Flags, key: string): string[] {
  const value = flags[key];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value;
  return [];
}

export function appendFlagValue(flags: Flags, key: string, value: string | boolean): void {
  const current = flags[key];
  if (current === undefined) {
    flags[key] = value;
    return;
  }

  if (value === true) {
    flags[key] = true;
    return;
  }

  if (typeof current === "string") {
    flags[key] = [current, value];
    return;
  }

  if (Array.isArray(current)) {
    flags[key] = [...current, value];
    return;
  }

  flags[key] = value;
}
