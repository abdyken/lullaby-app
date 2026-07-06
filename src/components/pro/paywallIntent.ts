/**
 * paywallIntent — a tiny pending-intent handoff for opening the shared paywall
 * from OUTSIDE the tabs ProProvider tree.
 *
 * /settings is a ROOT route (sibling of "(tabs)"), so SettingsProCard cannot
 * reach the Pro context there. Instead it records an intent here and routes
 * back into the tabs tree; the shared paywall host consumes the intent on the
 * route change and opens the one shared paywall sheet. This keeps a single
 * paywall instance and a single buy/recover surface in the tabs tree — this
 * module itself never touches entitlement, the store SDK, or any payment state
 * (a smoke check pins that).
 *
 * The intent expires after a short TTL so a request that was never consumed
 * (e.g. navigation interrupted) can't surprise-open the paywall much later.
 */
const INTENT_TTL_MS = 8000;

let requestedAt: number | null = null;

/** Record that the next return into the tabs tree should open the paywall. */
export function requestPaywall(): void {
  requestedAt = Date.now();
}

/**
 * Consume the pending intent. Returns true at most once per request, and only
 * while the request is fresh.
 */
export function consumePaywallRequest(): boolean {
  const at = requestedAt;
  requestedAt = null;
  return at != null && Date.now() - at <= INTENT_TTL_MS;
}
