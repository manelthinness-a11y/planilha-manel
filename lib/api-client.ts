const KEY = 'manel_access_password';

export function getStoredPassword(): string {
 try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}

export function setStoredPassword(value: string): void {
 try {
  if (value) localStorage.setItem(KEY, value);
  else localStorage.removeItem(KEY);
 } catch { /* localStorage indisponível (modo privado etc.) — segue sem persistir */ }
}

/** Confere a senha direto no servidor, sem guardar nada — usado pela tela de acesso. */
export async function verifyPassword(password: string): Promise<boolean> {
 try {
  const r = await fetch('/api/records', { headers: { 'X-Access-Password': password }, cache: 'no-store' });
  return r.ok;
 } catch { return false; }
}

/**
 * Substituto do fetch() para chamadas à própria API: anexa a senha salva e,
 * se o servidor responder 401 (senha errada ou trocada em outro lugar),
 * limpa a senha local e recarrega a página para pedir a senha de novo.
 */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
 const headers = new Headers(init.headers || {});
 headers.set('X-Access-Password', getStoredPassword());
 const r = await fetch(url, { ...init, headers });
 if (r.status === 401) {
  setStoredPassword('');
  if (typeof window !== 'undefined') window.location.reload();
 }
 return r;
}
