/**
 * The draft-content release gate. REASSURE_CONTENT.status (content/kb.ts) is
 * the clinician sign-off flag; until it flips to 'approved', the placeholder
 * clinical KB blocks (what's-normal / what-helps / when-to-call) must stay out
 * of public builds. Dev builds keep them visible so QA and clinician review
 * can see the real surface.
 *
 * Deliberately NOT gated: triage escalation ("call your pediatrician") and the
 * non-medical guides — pointing a parent at a real professional is always the
 * safe direction and must never be hidden.
 *
 * PURE LEAF: no react/react-native imports; callers pass __DEV__ in.
 */

import { REASSURE_CONTENT } from '../content/kb';

export function clinicalContentVisible(isDevBuild: boolean): boolean {
  return REASSURE_CONTENT.status === 'approved' || isDevBuild;
}
