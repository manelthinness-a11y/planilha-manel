import {env} from 'cloudflare:workers';

/**
 * Confere a senha de acesso enviada pelo navegador (cabeçalho X-Access-Password)
 * contra o segredo ACCESS_PASSWORD configurado no Worker (`wrangler secret put
 * ACCESS_PASSWORD`). Sem o segredo configurado, nega por padrão — evita que o
 * site fique aberto por esquecimento.
 */
export function checkAccess(req: Request): boolean {
 const e = env as unknown as { ACCESS_PASSWORD?: string };
 const header = req.headers.get('x-access-password');
 const match = !!e.ACCESS_PASSWORD && header === e.ACCESS_PASSWORD;
 // DEBUG TEMPORÁRIO — remover depois de descobrir o bug do bot.
 console.log('[debug-auth]', JSON.stringify({
  path: new URL(req.url).pathname,
  envSet: !!e.ACCESS_PASSWORD,
  envLen: e.ACCESS_PASSWORD ? e.ACCESS_PASSWORD.length : 0,
  headerPresent: header !== null,
  headerLen: header ? header.length : 0,
  match,
 }));
 if (!e.ACCESS_PASSWORD) return false;
 return header === e.ACCESS_PASSWORD;
}

export function unauthorized(): Response {
 return Response.json({ error: 'Senha de acesso inválida ou não informada.' }, { status: 401 });
}
