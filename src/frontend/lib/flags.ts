const defaultFlags = {
  newDashboard: true,
  launchLandingPage: true,
  docsCallout: true,
} as const;

type FlagName = keyof typeof defaultFlags | string;

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
      .reduce<Record<string, boolean>>((flags, entry) => {
        const [rawKey, rawState] = entry.split('=').map((value) => value.trim());

        if (!rawKey) {
          return flags;
        }

        flags[rawKey] = rawState === undefined ? true : rawState.toLowerCase() !== 'false';
        return flags;
      }, {});
  }
}

const featureFlags = {
  ...defaultFlags,
  ...parseFeatureFlags(import.meta.env.VITE_FEATURE_FLAGS),
};

export function isEnabled(flag: FlagName) {
  return Boolean(featureFlags[flag as keyof typeof featureFlags]);
}

export function getFeatureFlags() {
  return featureFlags;
}
