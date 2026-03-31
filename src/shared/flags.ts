const defaultFlags = {
  eventBusV1: true,
  rolloutAutomation: true,
  canaryDeployments: true,
  auditEvents: true,
} as const;

type FlagName = keyof typeof defaultFlags | string;
type ParsedFlags = Record<string, boolean>;

function parseFeatureFlags(rawValue?: string) {
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, Boolean(value)]));
  } catch {
    return rawValue
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .reduce<ParsedFlags>((flags, entry) => {
        const [rawKey, rawState] = entry.split('=').map((value) => value.trim());
        if (!rawKey) {
          return flags;
        }

        flags[rawKey] = rawState === undefined ? true : rawState.toLowerCase() !== 'false';
        return flags;
      }, {});
  }
}

export function getFeatureFlags() {
  return {
    ...defaultFlags,
    ...parseFeatureFlags(process.env.FEATURE_FLAGS),
  };
}

export function isFeatureEnabled(flag: FlagName) {
  const flags = getFeatureFlags();
  return Boolean(flags[flag as keyof typeof flags]);
}
