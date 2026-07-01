const startupStartedAt = Date.now();
const loggedOnce = new Set<string>();

type StartupDetails = Record<string, unknown>;

type StartupLogOptions = {
  once?: boolean;
};

export function logStartupStep(
  step: string,
  details?: StartupDetails,
  options: StartupLogOptions = {},
): void {
  if (!__DEV__) return;

  const once = options.once ?? true;
  const key = details == null ? step : `${step}:${JSON.stringify(details)}`;
  if (once && loggedOnce.has(key)) return;
  loggedOnce.add(key);

  const elapsedMs = Date.now() - startupStartedAt;
  const label = `[startup +${elapsedMs}ms] ${step}`;
  if (details) {
    console.log(label, details);
  } else {
    console.log(label);
  }
}
