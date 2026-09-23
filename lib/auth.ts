import {env} from 'cloudflare:workers';

/**
 * Confere a senha de acesso enviada pelo navegador (cabeçalho X-Access-Password)
 * contra o segredo ACCESS_PASSWORD configurado no Worker (`wrangler secret put
 * ACCESS_PASSWORD`). Sem o segredo configurado, nega por padrão — evita que o
 * site fique aberto por esquecimento.
 */
export function checkAccess(req: Request): boolean {
 const e = env as unknown as { ACCESS_PASSWORD?: string };
 if (!e.ACCESS_PASSWORD) return false;
 return req.headers.get('x-access-password') === e.ACCESS_PASSWORD;
}

export function unauthorized(): Response {
 return Response.json({ error: 'Senha de acesso inválida ou não informada.' }, { status: 401 });
}
