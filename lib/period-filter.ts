/**
 * Filtro de período usado só para decidir o que aparece nas LISTAS de operações
 * (arbitragens, movimentações, entradas de alavancagem/ODD5, créditos recebidos).
 * Nunca deve ser aplicado antes de summary()/leverageNet()/odd5Balance() — esses
 * cálculos de saldo sempre usam o histórico completo, sem filtro.
 */
export type PeriodFilter =
 | { mode: 'all' }
 | { mode: 'month'; year: number; month: number } // month: 1-12
 | { mode: 'day'; date: string }; // date: 'YYYY-MM-DD'

export function currentMonthFilter(): PeriodFilter {
 const now = new Date();
 return { mode: 'month', year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Registros sem data (ex.: entradas antigas de ODD5, antes desse campo existir) sempre aparecem. */
export function inPeriod(dateStr: string | undefined | null, filter: PeriodFilter): boolean {
 if (filter.mode === 'all') return true;
 if (!dateStr) return true;
 if (filter.mode === 'day') return dateStr === filter.date;
 const [y, m] = dateStr.split('-').map(Number);
 return y === filter.year && m === filter.month;
}

const MONTH_NAMES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

export function periodLabel(filter: PeriodFilter): string {
 if (filter.mode === 'all') return 'Todos os períodos';
 if (filter.mode === 'day') {
  const [y, m, d] = filter.date.split('-');
  return `${d}/${m}/${y}`;
 }
 return `${MONTH_NAMES[filter.month - 1]} de ${filter.year}`;
}

export function isCurrentMonth(filter: PeriodFilter): boolean {
 const now = currentMonthFilter();
 return filter.mode === 'month' && filter.year === (now as any).year && filter.month === (now as any).month;
}
