export async function apiFetch<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return r.json() as Promise<T>;
  } catch {
    return null;
  }
}
