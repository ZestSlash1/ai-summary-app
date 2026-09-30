/**
 * Bonsai runs on the owner's own PC behind a public tunnel, so only allow-listed
 * GitHub users may use it. Fails closed: with no ARO_ALLOWED_GITHUB_IDS set, nobody can.
 * IDs are numeric GitHub user ids (the OAuth providerAccountId), comma separated.
 */
export function canUseBonsai(
  session: { githubUserId?: string } | null | undefined,
  allowList: string | undefined = process.env.ARO_ALLOWED_GITHUB_IDS,
): boolean {
  const id = session?.githubUserId;
  if (!id) return false;
  const allowed = (allowList ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(String(id));
}

/**
 * Paid models bill the owner's AI Gateway credits or OmniRoute providers, so they follow the
 * same allow list as Bonsai. Everyone else may use a model only when the live catalog lists it
 * as free: the flag never comes from the client, and an id the catalog does not list counts as
 * paid, so an unknown id is not a way around the check. Null means the model may run.
 */
export async function paidModelDenied(
  session: { githubUserId?: string } | null | undefined,
  modelId: string,
  loadCatalog: () => Promise<{ id: string; free: boolean }[]>,
  allowList: string | undefined = process.env.ARO_ALLOWED_GITHUB_IDS,
): Promise<Response | null> {
  if (canUseBonsai(session, allowList)) return null;
  let free: boolean;
  try {
    free = (await loadCatalog()).some((m) => m.id === modelId && m.free);
  } catch {
    // Fails closed: with the catalog down there is no way to tell a free model from a paid one.
    return Response.json(
      { error: 'Could not check whether this model is free. Try again in a moment.' },
      { status: 503 },
    );
  }
  if (free) return null;
  const signedIn = Boolean(session?.githubUserId);
  return Response.json(
    {
      error: signedIn
        ? 'Your account is not allowed to use paid models. Pick one marked Free.'
        : 'Sign in with an allowed GitHub account to use paid models, or pick one marked Free.',
    },
    { status: signedIn ? 403 : 401 },
  );
}

/** 401 when signed out, 403 when signed in but not allow-listed. `what` names the feature in the message. */
export function bonsaiDenied(
  session: { githubUserId?: string } | null | undefined,
  what = 'Bonsai',
): Response {
  const signedIn = Boolean(session?.githubUserId);
  return Response.json(
    { error: signedIn ? `Your account is not allowed to use ${what}.` : `Sign in to use ${what}.` },
    { status: signedIn ? 403 : 401 },
  );
}
