/**
 * revenueCat — the ONLY module that talks to the RevenueCat SDK.
 *
 * It isolates `react-native-purchases` behind a small, calm API so the rest of
 * the app (ProProvider, PaywallSheet) never imports the SDK directly. Every call
 * is defensive: a missing key, an unsupported platform, a native module that is
 * not linked, or a user cancel all resolve to a safe value instead of crashing.
 *
 * Trust boundary (this phase): RevenueCat CustomerInfo is the on-device source of
 * truth for `isPro`. There is NO Supabase write and NO webhook yet — the
 * household `pro_entitlements` row is a later phase. This module never touches
 * Supabase, never emits analytics, and never contains an external payment link.
 *
 * Identity: we configure/log in with the Supabase `user.id` as the RevenueCat
 * appUserID, so entitlement follows the signed-in account and does not leak
 * between accounts on a shared device (sign-out calls logOut).
 */
import { Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

import { getRevenueCatApiKey, getRevenueCatOfferingId, type RevenueCatPlatform } from '@/lib/proConfig';

/**
 * Opaque re-export of the raw offering type so ProProvider can hold one in a ref
 * WITHOUT importing the RevenueCat SDK itself (the SDK import stays only here).
 */
export type RcOffering = PurchasesOffering;

/** A small, SDK-free view of a purchasable package for the UI layer. */
export type ProPackageView = {
  /** RevenueCat package identifier (used to look the raw package back up). */
  id: string;
  /** PACKAGE_TYPE as a plain string, e.g. 'MONTHLY' | 'ANNUAL'. */
  packageType: string;
  /** The store-localized price string (e.g. from the store) — never hardcoded. */
  priceString: string;
  /** The store product title. */
  title: string;
};

/** A calm, coarse error shape — never the raw provider message. */
export type NormalizedRcError = { code: string; message: string; cancelled: boolean };

/** Discriminated result for purchase / restore. */
export type RcPurchaseOutcome =
  | { ok: true; customerInfo: CustomerInfo }
  | { ok: false; error: NormalizedRcError };

/** The platform we can configure RevenueCat for, or null (web / unsupported). */
function currentPlatform(): RevenueCatPlatform | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return null;
}

// Tracks whether Purchases.configure has run this session (it may run only once).
let configuredApiKey: string | null = null;

/** Whether RevenueCat has been configured this app session. */
export function isRevenueCatConfigured(): boolean {
  return configuredApiKey !== null;
}

/**
 * Configure RevenueCat once per session with the signed-in user's id as the
 * appUserID; on a later identity change, log in instead. Returns false (never
 * throws) when there is no platform key or the native call fails, so callers can
 * degrade to a calm "not configured" state.
 */
export async function configureRevenueCat(params: { userId: string }): Promise<boolean> {
  const platform = currentPlatform();
  if (!platform) return false;
  const apiKey = getRevenueCatApiKey(platform);
  if (!apiKey) return false;

  try {
    if (configuredApiKey === null) {
      Purchases.configure({ apiKey, appUserID: params.userId });
      configuredApiKey = apiKey;
    } else {
      // Already configured this session — make sure we are the right identity.
      await Purchases.logIn(params.userId);
    }
    return true;
  } catch {
    return false;
  }
}

/** Log the RevenueCat user out (revert to anonymous) on sign-out. Never throws. */
export async function logOutRevenueCat(): Promise<void> {
  if (configuredApiKey === null) return;
  try {
    await Purchases.logOut();
  } catch {
    // Calm: sign-out should never surface a subscription error.
  }
}

/** The current CustomerInfo, or null if unavailable. Never throws. */
export async function getRevenueCatCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    return null;
  }
}

/**
 * The configured offering (by EXPO_PUBLIC_REVENUECAT_OFFERING_ID, falling back to
 * `current`), or null. Never throws.
 */
export async function getRevenueCatOffering(): Promise<PurchasesOffering | null> {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.all[getRevenueCatOfferingId()] ?? offerings.current ?? null;
  } catch {
    return null;
  }
}

/** Map a raw offering into SDK-free package views for the UI. */
export function toProPackageViews(offering: PurchasesOffering | null): ProPackageView[] {
  if (!offering) return [];
  return offering.availablePackages.map((pkg) => ({
    id: pkg.identifier,
    packageType: String(pkg.packageType),
    priceString: pkg.product.priceString,
    title: pkg.product.title,
  }));
}

/** Find a raw package (needed to purchase) by its identifier within an offering. */
export function findRawPackage(
  offering: PurchasesOffering | null,
  packageId: string,
): PurchasesPackage | null {
  if (!offering) return null;
  return offering.availablePackages.find((pkg) => pkg.identifier === packageId) ?? null;
}

/** Whether a CustomerInfo has the given entitlement active right now. */
export function hasActiveRevenueCatEntitlement(
  customerInfo: CustomerInfo | null,
  entitlementId: string,
): boolean {
  if (!customerInfo) return false;
  return customerInfo.entitlements.active[entitlementId] != null;
}

/** Purchase a package. A user cancel is a calm outcome, not a scary error. */
export async function purchaseRevenueCatPackage(pkg: PurchasesPackage): Promise<RcPurchaseOutcome> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { ok: true, customerInfo };
  } catch (error) {
    return { ok: false, error: normalizeRevenueCatError(error) };
  }
}

/** Restore prior purchases from the store account. Never throws. */
export async function restoreRevenueCatPurchases(): Promise<RcPurchaseOutcome> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    return { ok: true, customerInfo };
  } catch (error) {
    return { ok: false, error: normalizeRevenueCatError(error) };
  }
}

/**
 * Convert any thrown RevenueCat error into a coarse { code, message, cancelled }.
 * We NEVER surface the raw provider message (it can be verbose / sensitive) — the
 * UI shows a calm generic line, and analytics only ever sees the coarse `code`.
 */
export function normalizeRevenueCatError(error: unknown): NormalizedRcError {
  const e = error as { code?: string | number; userCancelled?: boolean | null } | null;
  const cancelled = e?.userCancelled === true;
  if (cancelled) {
    return { code: 'cancelled', message: 'Purchase cancelled.', cancelled: true };
  }
  const code = e?.code != null ? String(e.code) : 'unknown';
  return { code, message: 'Something went wrong. Please try again.', cancelled: false };
}
