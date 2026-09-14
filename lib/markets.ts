export const marketOptions = [
  'Criar aposta',
  'Resultado final',
  'Total de gols',
  'Total de gols — 1º tempo',
  'Total de gols — 2º tempo',
  'Escanteios — Casa / Empate / Fora',
  'Total de escanteios',
  'Total de escanteios — 1º tempo',
  'Total de escanteios — 2º tempo',
  'Ambas marcam',
];

export function selectionOptions(market: string): string[] {
  if (market === 'Resultado final' || market === 'Escanteios — Casa / Empate / Fora') return ['Casa', 'Empate', 'Fora'];
  if (market === 'Ambas marcam') return ['Sim', 'Não'];
  if (market.startsWith('Total de gols') || market.startsWith('Total de escanteios')) {
    const corners = market.startsWith('Total de escanteios');
    const unit = corners ? 'escanteios' : 'gols';
    return Array.from({length: corners ? 42 : 18}, (_, i) => ((i + 1) / 2).toLocaleString('pt-BR'))
      .flatMap(line => [`Mais de ${line} ${unit}`, `Menos de ${line} ${unit}`]);
  }
  return [];
}

export type CombinationLeg = {market: string; selection: string};
export function combinationLabel(legs: CombinationLeg[]): string {
  return legs.map(leg => `${leg.market}: ${leg.selection}`).join(' + ');
}
