import type { Session } from '@supabase/supabase-js';

export type PortalPreference = 'tournament' | 'ladder' | 'both';

export const MENS_LADDER_PORTAL_LABEL = 'Men\u2019s Ladder Portal';
export const TOURNAMENT_PORTAL_LABEL = 'Roton Point Tournament Portal';

export function getPortalPreferenceFromSession(session: Session | null): PortalPreference {
  return getPortalPreferenceFromMetadata(session?.user.user_metadata);
}

export function getPortalPreferenceFromMetadata(
  metadata: Record<string, unknown> | undefined,
): PortalPreference {
  const portalPreference = metadata?.portal_preference;

  if (portalPreference === 'tournament' || portalPreference === 'both') {
    return portalPreference;
  }

  return 'ladder';
}

export function getDefaultRouteForPortal(portalPreference: PortalPreference) {
  return portalPreference === 'tournament' ? '/tournaments' : '/dashboard';
}

export function hasApprovedLadderAccess({
  hasLadderRanking,
  profileStatus,
  role,
}: {
  hasLadderRanking: boolean;
  profileStatus: 'pending' | 'approved';
  role: 'player' | 'admin';
}) {
  return role === 'admin' || (profileStatus === 'approved' && hasLadderRanking);
}
