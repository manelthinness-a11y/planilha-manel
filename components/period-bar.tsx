"use client";
import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { ptBR } from 'date-fns/locale';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { type PeriodFilter, periodLabel, currentMonthFilter } from '@/lib/period-filter';

function parseDate(s: string): Date { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function formatDate(d: Date): string { return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); }

export function PeriodBar({ filter, onChange }: { filter: PeriodFilter; onChange: (f: PeriodFilter) => void }) {
 const [open, setOpen] = useState(false);
 const anchorMonth = filter.mode === 'day' ? parseDate(filter.date) : filter.mode === 'month' ? new Date(filter.year, filter.month - 1, 1) : new Date();
 const [viewMonth, setViewMonth] = useState(anchorMonth);
 const isCurrent = filter.mode === 'month' && (() => { const now = currentMonthFilter() as { year: number; month: number }; return filter.year === now.year && filter.month === now.month; })();

 return <div className="period-bar">
  <Popover open={open} onOpenChange={v => { setOpen(v); if (v) setViewMonth(anchorMonth); }}>
   <PopoverTrigger asChild>
    <button type="button" className="period-trigger"><CalendarDays size={16} />{periodLabel(filter)}</button>
   </PopoverTrigger>
   <PopoverContent align="start" className="period-popover">
    <Calendar
     mode="single"
     locale={ptBR}
     month={viewMonth}
     onMonthChange={setViewMonth}
     selected={filter.mode === 'day' ? parseDate(filter.date) : undefined}
     onSelect={(d: Date | undefined) => { if (!d) return; onChange({ mode: 'day', date: formatDate(d) }); setOpen(false); }}
    />
    <div className="period-actions">
     <button type="button" className="secondary" onClick={() => { onChange({ mode: 'month', year: viewMonth.getFullYear(), month: viewMonth.getMonth() + 1 }); setOpen(false); }}>Mês inteiro</button>
     <button type="button" className="text-button" onClick={() => { onChange({ mode: 'all' }); setOpen(false); }}>Todos os períodos</button>
    </div>
   </PopoverContent>
  </Popover>
  {!isCurrent && filter.mode !== 'all' && <button type="button" className="period-reset text-button" onClick={() => onChange(currentMonthFilter())}>Voltar pro mês atual</button>}
 </div>;
}
