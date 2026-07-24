import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { DayBlob, loadCalendarRange } from "../services/calendar";

export interface CalendarDay {
  date: string;
  inCurrentMonth: boolean;
  blobs: DayBlob[];
}

export function useCalendarMonth(initialMonth: Date = new Date()) {
  const [monthAnchor, setMonthAnchor] = useState(initialMonth);
  const [blobsByDate, setBlobsByDate] = useState<Map<string, DayBlob[]>>(new Map());
  const [loading, setLoading] = useState(true);

  const gridDates = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(monthAnchor), { weekStartsOn: 1 });
    const gridEnd = endOfWeek(endOfMonth(monthAnchor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [monthAnchor]);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const startDate = format(gridDates[0], "yyyy-MM-dd");
      const endDate = format(gridDates[gridDates.length - 1], "yyyy-MM-dd");
      setBlobsByDate(await loadCalendarRange(startDate, endDate));
    } finally {
      setLoading(false);
    }
  }, [gridDates]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const days: CalendarDay[] = gridDates.map((date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return {
      date: dateStr,
      inCurrentMonth: date.getMonth() === monthAnchor.getMonth(),
      blobs: blobsByDate.get(dateStr) ?? [],
    };
  });

  return {
    days,
    loading,
    monthLabel: format(monthAnchor, "MMMM yyyy"),
    goToPreviousMonth: () => setMonthAnchor((m) => subMonths(m, 1)),
    goToNextMonth: () => setMonthAnchor((m) => addMonths(m, 1)),
    refetch,
  };
}
