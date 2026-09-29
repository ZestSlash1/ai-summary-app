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

/** 401 when signed out, 403 when signed in but not allow-listed. */
export function bonsaiDenied(session: { githubUserId?: string } | null | undefined): Response {
  const signedIn = Boolean(session?.githubUserId);
  return Response.json(
    { error: signedIn ? 'Your account is not allowed to use Bonsai.' : 'Sign in to use Bonsai.' },
    { status: signedIn ? 403 : 401 },
  );
}
