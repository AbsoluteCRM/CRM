import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, MapPin, Search } from 'lucide-react'

import { TextInput } from '#/components/crm/ui'
import { cn } from '#/lib/utils'
import { fromGeoapify } from './address'
import type { AddressParts, GeoapifyResult } from './address'

type Fetcher = (
  text: string,
  signal: AbortSignal,
) => Promise<Array<GeoapifyResult>>

const fetchGeoapify =
  (apiKey: string, countries: Array<string>): Fetcher =>
  async (text, signal) => {
    const params = new URLSearchParams({
      text,
      apiKey,
      format: 'json',
      limit: '5',
      lang: 'en',
    })
    if (countries.length)
      params.set('filter', `countrycode:${countries.join(',')}`)
    const res = await fetch(
      `https://api.geoapify.com/v1/geocode/autocomplete?${params}`,
      { signal },
    )
    if (!res.ok) throw new Error(`Geoapify ${res.status}`)
    const body = (await res.json()) as { results?: Array<GeoapifyResult> }
    return body.results ?? []
  }

const MIN_CHARS = 3
const DEBOUNCE_MS = 300

/** Address search box. Renders nothing without an API key or `fetcher`. */
export default function AddressAutocomplete({
  onSelect,
  countries = ['ca', 'us'],
  apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined,
  fetcher,
}: {
  onSelect: (address: AddressParts) => void
  countries?: Array<string>
  apiKey?: string
  /** Replaces the Geoapify call in stories. */
  fetcher?: Fetcher
}) {
  const id = useId()
  const listId = `${id}-list`
  const [text, setText] = useState('')
  const [results, setResults] = useState<Array<GeoapifyResult>>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  // The query the results answer, so "No matches" waits for a reply.
  const [answered, setAnswered] = useState('')
  const lookup = useRef<Fetcher | null>(null)
  lookup.current = fetcher ?? (apiKey ? fetchGeoapify(apiKey, countries) : null)

  useEffect(() => {
    const query = text.trim()
    if (!lookup.current || query.length < MIN_CHARS) {
      setResults([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      lookup
        .current?.(query, controller.signal)
        .then((r) => {
          setResults(r)
          setActive(-1)
          setFailed(false)
          setAnswered(query)
        })
        .catch((e: unknown) => {
          if ((e as Error).name !== 'AbortError') {
            setResults([])
            setFailed(true)
            setAnswered(query)
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [text])

  if (!lookup.current) return null

  const choose = (r: GeoapifyResult) => {
    onSelect(fromGeoapify(r))
    setText(r.formatted ?? r.address_line1 ?? '')
    setOpen(false)
    setResults([])
  }

  const query = text.trim()
  const showList =
    open &&
    query.length >= MIN_CHARS &&
    (results.length > 0 || loading || answered === query)
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp' && results.length) {
      e.preventDefault()
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1))
    } else if (e.key === 'Enter' && showList && results[active]) {
      e.preventDefault()
      choose(results[active])
    } else if (e.key === 'Escape' && showList) {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        Find your address
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-(--ink-3)" />
        <TextInput
          id={id}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && active >= 0 ? `${listId}-${active}` : undefined
          }
          autoComplete="off"
          placeholder="Start typing, e.g. 120 Crowfoot Way"
          className="pl-9"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {loading && (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-(--ink-3)" />
        )}
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Address suggestions"
          className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-(--line) bg-(--paper) shadow-lg"
        >
          {results.map((r, i) => (
            <li
              key={r.place_id ?? `${r.formatted}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, so the pick lands before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault()
                choose(r)
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-start gap-2.5 px-3 py-2.5 text-sm',
                i === active && 'bg-(--cream)',
              )}
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-(--ink-3)" />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-(--ink)">
                  {r.address_line1}
                </span>
                <span className="block truncate text-xs text-(--ink-3)">
                  {r.address_line2}
                </span>
              </span>
            </li>
          ))}
          {loading && results.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-(--ink-3)">Searching…</li>
          )}
          {!loading && results.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-(--ink-3)">
              {failed
                ? 'Suggestions aren’t available. Type your address below.'
                : 'No matches. Check the spelling or type it below.'}
            </li>
          )}
          <li
            aria-hidden
            className="border-t border-(--line) px-3 py-1.5 text-right text-[11px] text-(--ink-3)"
          >
            Powered by Geoapify
          </li>
        </ul>
      )}
    </div>
  )
}
