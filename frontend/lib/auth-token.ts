let tokenProvider: (() => Promise<string | undefined>) | null = null;

export function registerAccessTokenProvider(
  provider: (() => Promise<string | undefined>) | null,
) {
  tokenProvider = provider;
}

export async function authorizationHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (tokenProvider) {
    const token = await tokenProvider();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }
  const tenantId = process.env.NEXT_PUBLIC_DEV_TENANT_ID;
  const subjectId = process.env.NEXT_PUBLIC_DEV_SUBJECT_ID;
  if (tenantId) headers["X-Tenant-ID"] = tenantId;
  if (subjectId) headers["X-Subject-ID"] = subjectId;
  return headers;
}
