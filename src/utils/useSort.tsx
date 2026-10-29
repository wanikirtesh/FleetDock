import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export type SortDir = 'asc' | 'desc';
export interface SortEntry<K extends string> { key: K; dir: SortDir }
type SortValue = string | number | boolean | null | undefined;

/**
 * Click a header to sort asc -> desc -> off. Shift+click adds the column as an extra
 * sort level (or cycles it if already part of the sort), so rows can be sorted by several columns.
 */
export function useSort<T, K extends string>(
  rows: T[],
  accessors: Record<K, (row: T) => SortValue>,
  initial?: SortEntry<K> | SortEntry<K>[]
) {
  const [sort, setSort] = useState<SortEntry<K>[]>(initial ? (Array.isArray(initial) ? initial : [initial]) : []);

  const toggle = (key: K, additive = false) =>
    setSort((cur) => {
      const existing = cur.find((s) => s.key === key);
      const next: SortEntry<K> | null = !existing
        ? { key, dir: 'asc' }
        : existing.dir === 'asc'
          ? { key, dir: 'desc' }
          : null;
      if (!additive) return next ? [next] : [];
      if (!existing) return [...cur, next!];
      return next ? cur.map((s) => (s.key === key ? next : s)) : cur.filter((s) => s.key !== key);
    });

  const sorted = useMemo(() => {
    if (sort.length === 0) return rows;
    return [...rows].sort((a, b) => {
      for (const { key, dir } of sort) {
        const get = accessors[key];
        const va = get(a);
        const vb = get(b);
        const factor = dir === 'asc' ? 1 : -1;
        // empty values always sink to the bottom
        const ea = va === null || va === undefined || va === '';
        const eb = vb === null || vb === undefined || vb === '';
        if (ea || eb) {
          if (ea === eb) continue;
          return ea ? 1 : -1;
        }
        const diff =
          typeof va === 'number' && typeof vb === 'number'
            ? (va - vb) * factor
            : String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' }) * factor;
        if (diff !== 0) return diff;
      }
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  return { sorted, sort, toggle };
}

interface SortThProps<K extends string> {
  label: React.ReactNode;
  sortKey: K;
  sort: SortEntry<K>[];
  onToggle: (key: K, additive?: boolean) => void;
  className?: string;
  align?: 'left' | 'right';
}

export function SortTh<K extends string>({ label, sortKey, sort, onToggle, className = '', align = 'left' }: SortThProps<K>) {
  const index = sort.findIndex((s) => s.key === sortKey);
  const entry = index >= 0 ? sort[index] : null;
  const Icon = !entry ? ArrowUpDown : entry.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      className={`${className} cursor-pointer select-none hover:text-slate-200`}
      aria-sort={entry ? (entry.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      title="Click to sort · Shift+click to add as another sort column"
      onClick={(e) => onToggle(sortKey, e.shiftKey)}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end w-full' : ''}`}>
        {label}
        <Icon className={`w-3 h-3 ${entry ? 'text-emerald-400' : 'opacity-40'}`} />
        {entry && sort.length > 1 && <span className="text-[9px] text-emerald-400 font-bold">{index + 1}</span>}
      </span>
    </th>
  );
}
