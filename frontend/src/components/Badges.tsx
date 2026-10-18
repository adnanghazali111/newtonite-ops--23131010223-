const statusStyles: Record<string, string> = {
  Open: 'bg-[#e7f8bc] text-[#42641e] ring-[#d3ed96]',
  InProgress: 'bg-[#fff0be] text-[#8a651c] ring-[#f4e0a0]',
  AwaitingApproval: 'bg-[#e9e1ff] text-[#695293] ring-[#d9cdf6]',
  Resolved: 'bg-[#dff5e7] text-[#397755] ring-[#c6e9d2]',
  Closed: 'bg-[#edf0ed] text-[#758078] ring-[#e0e5e0]',
};

const statusLabels: Record<string, string> = {
  Open: 'Open',
  InProgress: 'In progress',
  AwaitingApproval: 'Awaiting approval',
  Resolved: 'Resolved',
  Closed: 'Closed',
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex whitespace-nowrap items-center rounded-full px-2.5 py-1 text-[10px] font-extrabold ring-1 ring-inset ${statusStyles[status] || statusStyles.Closed}`}>{statusLabels[status] || status}</span>;
}

const priorityStyles: Record<string, string> = {
  Low: 'bg-[#f0f1ed] text-[#6f7a73]',
  Medium: 'bg-[#eef4df] text-[#6c8246]',
  High: 'bg-[#fff0d2] text-[#a36d25]',
  Critical: 'bg-[#ffe0d9] text-[#bd5548]',
};

export function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-extrabold ${priorityStyles[priority] || priorityStyles.Low}`}><i className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{priority}</span>;
}

const typeStyles: Record<string, { icon: string; color: string }> = {
  Task: { icon: '✓', color: 'bg-[#eef4df] text-[#6f8f45]' },
  Incident: { icon: '!', color: 'bg-[#ffe3dc] text-[#c66355]' },
  Request: { icon: '→', color: 'bg-[#e7f0ff] text-[#5878a5]' },
  Change: { icon: '↗', color: 'bg-[#eee9ff] text-[#7562a6]' },
};

export function TypeBadge({ type }: { type: string }) {
  const config = typeStyles[type] || typeStyles.Task;
  return <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#718078]"><i className={`grid h-5 w-5 place-items-center rounded-md text-[10px] font-black ${config.color}`}>{config.icon}</i>{type}</span>;
}
