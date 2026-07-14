// components/utils/exportTimelineToExcel.ts
import * as XLSX from 'xlsx';

// Импортируем нужные функции из основного файла
// или вынесите их в отдельный utils файл
const parseDate = (s: string | null): Date | null => 
  s ? new Date(s + (s.length === 10 ? 'T00:00:00' : '')) : null;

const fmtDate = (s: string | null) => {
  if (!s) return '—';
  const d = parseDate(s);
  return d ? d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
};

const sortOrd = (l: any[]) => [...l].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ru'));

const isRunning = (s: any) => s.status === 'active' || s.status === 'on_hold';

const TODAY = new Date();

function getActualEnd(s: any): Date | null {
  if (s.completed_at) return parseDate(s.completed_at);
  if (s.status === 'active' || s.status === 'on_hold') return TODAY;
  return null;
}

const daysB = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

const effStatus = (s: any): string => 
  s.is_overdue && s.status !== 'completed' && s.status !== 'skipped' ? 'overdue' : s.status;

const STATUS_CFG: Record<string, { label: string }> = {
  planned: { label: 'Запланирован' },
  active: { label: 'В работе' },
  completed: { label: 'Завершён' },
  on_hold: { label: 'На паузе' },
  skipped: { label: 'Пропущен' },
  overdue: { label: 'Просрочен' },
};

export default function exportTimelineToExcel(
  stages: any[],
  responsibles: Record<string, any>,
  projectId: string
) {
  const rows = sortOrd(stages)
    .filter((s) => s.planned_start || s.started_at)
    .map((s) => {
      const resp = s.responsible_id ? responsibles[s.responsible_id] : null;

      const ps = parseDate(s.planned_start);
      const pe = parseDate(s.planned_end);
      const fs = s.started_at ? parseDate(s.started_at) : null;
      const fe = getActualEnd(s);

      const planDays = ps && pe ? daysB(ps, pe) + 1 : null;
      const factDays = fs && fe ? daysB(fs, fe) + 1 : null;
      const delta =
        planDays != null && factDays != null ? factDays - planDays : null;

      return {
        '№': s.order,
        'Этап': s.name,
        'Статус': STATUS_CFG[effStatus(s)]?.label || effStatus(s),
        'Ответственный': resp?.full_name ?? '—',
        'Роль': resp?.role ?? '—',
        'Плановое начало': fmtDate(s.planned_start),
        'Плановое окончание': fmtDate(s.planned_end),
        'Фактический старт': s.started_at
          ? fmtDate(s.started_at.slice(0, 10))
          : '—',
        'Фактическое окончание': s.completed_at
          ? fmtDate(s.completed_at.slice(0, 10))
          : isRunning(s)
            ? 'н.в.'
            : '—',
        'Плановая длительность, дн.': planDays ?? '—',
        'Фактическая длительность, дн.': factDays ?? '—',
        'Отклонение, дн.': delta ?? '—',
        'Описание': s.description ?? '',
        'Критерии приёмки': s.completion_criteria?.join('\n') ?? '',
      };
    });

  const ws = XLSX.utils.json_to_sheet(rows);

  ws['!cols'] = [
    { wch: 6 },
    { wch: 30 },
    { wch: 18 },
    { wch: 24 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 60 },
    { wch: 45 },
  ];

  const meta = XLSX.utils.aoa_to_sheet([
    ['Проект', projectId],
    ['Дата экспорта', new Date().toLocaleString('ru-RU')],
    ['Всего этапов', rows.length],
    ['Примечание', 'н.в. = настоящее время'],
  ]);

  meta['!cols'] = [{ wch: 22 }, { wch: 40 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, meta, 'Сводка');
  XLSX.utils.book_append_sheet(wb, ws, 'Хронология');

  XLSX.writeFile(wb, `project-${projectId}-timeline.xlsx`);
}