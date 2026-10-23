import { useEffect, useState } from 'react'

export const browserClock = () => performance.now()

/** The local clock, re-read on a timer. It only drives countdowns, which tolerate a quarter second of staleness. */
export function useNow(clock: () => number, intervalMs = 250): number {
  const [now, setNow] = useState(() => clock())
  useEffect(() => {
    const timer = setInterval(() => setNow(clock()), intervalMs)
    return () => clearInterval(timer)
  }, [clock, intervalMs])
  return now
}
