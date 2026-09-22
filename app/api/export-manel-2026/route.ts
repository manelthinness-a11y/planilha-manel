import {database} from '@/lib/store';

// Rota temporária só pra exportar os registros reais em JSON, pra montar um
// protótipo de layout fora do sistema. Pode ser apagada depois de usar
// (arquivo inteiro + a pasta app/api/export-manel-2026).
const SECRET = 'manel2026exporta';

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get('chave') !== SECRET) {
    return new Response('Não encontrado', { status: 404 });
  }
  const all = await database().prepare('SELECT * FROM records').all();
  const rows = all.results.map((r: any) => ({
    id: r.id,
    kind: r.kind,
    revision: r.revision,
    data: JSON.parse(r.data as string),
  }));
  return Response.json(rows, { headers: { 'Cache-Control': 'no-store' } });
}
