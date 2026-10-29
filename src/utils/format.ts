export const fmtPct = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)}%` : '--';

export const fmtKb = (kb: number | null | undefined): string => {
  if (typeof kb !== 'number' || !Number.isFinite(kb)) return '--';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = kb;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(2)} ${units[i]}`;
};
