const API_BASE = (import.meta as any).env?.VITE_API_URL || "/api";

export function getStoredToken(): string | null {
  return localStorage.getItem("evaluai_access_token");
}

export async function apiRequest<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem("evaluai_access_token");
    localStorage.removeItem("evaluai_user");
    window.dispatchEvent(new CustomEvent("evaluai:unauthorized"));
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    throw new Error(data?.detail || data?.message || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function apiDownload(path: string, filename: string): Promise<void> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (res.status === 401) {
    localStorage.removeItem("evaluai_access_token");
    localStorage.removeItem("evaluai_user");
    window.dispatchEvent(new CustomEvent("evaluai:unauthorized"));
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
