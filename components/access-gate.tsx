"use client";
import { useEffect, useState } from 'react';
import { getStoredPassword, setStoredPassword, verifyPassword } from '@/lib/api-client';

export function AccessGate({ children }: { children: React.ReactNode }) {
 const [checking, setChecking] = useState(true);
 const [ready, setReady] = useState(false);
 const [value, setValue] = useState('');
 const [error, setError] = useState('');
 const [busy, setBusy] = useState(false);

 useEffect(() => {
  const stored = getStoredPassword();
  if (!stored) { setChecking(false); return; }
  verifyPassword(stored).then(ok => {
   if (ok) setReady(true);
   else setStoredPassword('');
   setChecking(false);
  });
 }, []);

 async function submit(e: any) {
  e.preventDefault();
  setBusy(true); setError('');
  const ok = await verifyPassword(value);
  setBusy(false);
  if (ok) { setStoredPassword(value); setReady(true); }
  else setError('Senha incorreta.');
 }

 if (checking) return null;
 if (ready) return <>{children}</>;
 return <div className="access-gate">
  <form onSubmit={submit}>
   <div className="manel-wordmark"><small>PLANILHA</small><b>Manel<span className="manel-period">.</span></b></div>
   <p>Digite a senha de acesso para continuar.</p>
   <input type="password" autoFocus autoComplete="current-password" value={value} onChange={(e: any) => setValue(e.target.value)} placeholder="Senha"/>
   {error && <p role="alert">{error}</p>}
   <button type="submit" className="primary" disabled={busy || !value}>{busy ? 'Verificando…' : 'Entrar'}</button>
  </form>
 </div>;
}
