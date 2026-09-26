// Frontend feature flag registry
// on/off switch for features that is read while the app is running. Features can stay
// in the codebase but stay hidden until we decide to turn it on (instead of commenting it out).
export type FeatureFlagDefinition = {
    // What the flag controls and what has to happen/needs to be done before the feature can be turned on
    description: string;
    // environment variable that overrides the default values (should start with EXPO_PUBLIC_).
    envVar: string;
    // default value used in a release build if nothing overrides it
    prodDefault: boolean;
    // default value used in dev build if nothing overrides it
    devDefault: boolean;
};


// Frontend feature flags, variable should also be added to the Environment section of README.md
export const FEATURE_FLAGS = {
    recommendationsTab: {
        description:
            "Compare tab on the product screen. Off until recommendations tab is ready",
        envVar: "EXPO_PUBLIC_FEATURE_RECOMMENDATIONS_TAB",
        prodDefault: false,
        devDefault: false,
    },
    loginCaptcha: {
        description:
            "hCaptcha challenge on the login screen. Off in dev because captcha will not work on local host",
        envVar: "EXPO_PUBLIC_CAPTCHA_ENABLED",
        prodDefault: true,
        devDefault: false,
    },
} as const satisfies Record<string, FeatureFlagDefinition>;

export type FeatureFlagName = keyof typeof FEATURE_FLAGS;

// Literal env reads, one per flag. Do not turn this into a loop: babel-preset-expo
// only rewrites process.env.EXPO_PUBLIC_* when the key is a string literal, so a
// dynamic lookup comes back undefined in a release build.
const ENV_VALUES: Record<FeatureFlagName, string | undefined> = {
    recommendationsTab: process.env.EXPO_PUBLIC_FEATURE_RECOMMENDATIONS_TAB,
    loginCaptcha: process.env.EXPO_PUBLIC_CAPTCHA_ENABLED,
};

// fall back to NODE_ENV if __DEV__ is not defined
function buildIsDevelopment(): boolean {
    if (typeof __DEV__ !== "undefined") return __DEV__;
    return process.env.NODE_ENV !== "production";
}

// allow multiple spellings for true/false, yes/no, on/off
function parseBoolean(raw: string | undefined): boolean | undefined {
    if (raw === undefined || raw === null) return undefined;
    const value = String(raw).trim().toLowerCase();
    if (value === "true" || value === "1" || value === "yes" || value === "on") return true;
    if (value === "false" || value === "0" || value === "no" || value === "off") return false;
    return undefined;
}

const overrides = new Map<FeatureFlagName, boolean>();
const listeners = new Set<() => void>();

function notify(): void {
    listeners.forEach((listener) => listener());
}

// use default values if nothing overrides them
export function getFeatureFlagDefault(name: FeatureFlagName): boolean {
    const definition = FEATURE_FLAGS[name];
    return buildIsDevelopment() ? definition.devDefault : definition.prodDefault;
}

export function isFeatureEnabled(name: FeatureFlagName): boolean {
    const override = overrides.get(name);
    if (override !== undefined) return override;

    const fromEnv = parseBoolean(ENV_VALUES[name]);
    if (fromEnv !== undefined) return fromEnv;

    return getFeatureFlagDefault(name);
}

// get every feature flag and its current value
export function getResolvedFeatureFlags(): Record<FeatureFlagName, boolean> {
    const resolved = {} as Record<FeatureFlagName, boolean>;
    (Object.keys(FEATURE_FLAGS) as FeatureFlagName[]).forEach((name) => {
        resolved[name] = isFeatureEnabled(name);
    });
    return resolved;
}

// turn flag on/off during session
export function setFeatureFlagOverride(name: FeatureFlagName, value: boolean): void {
    if (overrides.get(name) === value) return;
    overrides.set(name, value);
    notify();
}

// turn overrides off
export function clearFeatureFlagOverrides(name?: FeatureFlagName): void {
    if (name === undefined) {
        if (overrides.size === 0) return;
        overrides.clear();
    } else if (!overrides.delete(name)) {
        return;
    }
    notify();
}

// get config flags remotely from remote server, ignore unknown configs
export function applyRemoteFeatureFlags(values: Partial<Record<string, boolean>>): void {
    let changed = false;
    (Object.keys(FEATURE_FLAGS) as FeatureFlagName[]).forEach((name) => {
        const value = values[name];
        if (typeof value !== "boolean") return;
        if (overrides.get(name) === value) return;
        overrides.set(name, value);
        changed = true;
    });
    if (changed) notify();
}

// add functions to listeners which will run whenever anything changes
export function subscribeToFeatureFlags(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}