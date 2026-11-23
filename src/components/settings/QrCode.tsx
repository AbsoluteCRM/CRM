import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Download } from 'lucide-react'

import { btnClass } from '#/components/crm/ui'

const OPTIONS = {
  margin: 2,
  errorCorrectionLevel: 'M' as const,
  color: { dark: '#11301f', light: '#ffffff' },
}

/** A QR code for `value`, with PNG and SVG downloads for print. */
export default function QrCode({
  value,
  fileName,
  size = 176,
}: {
  value: string
  fileName: string
  size?: number
}) {
  const [png, setPng] = useState<string | null>(null)
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!value) return
    void Promise.all([
      QRCode.toDataURL(value, { ...OPTIONS, width: 1024 }),
      QRCode.toString(value, { ...OPTIONS, type: 'svg' }),
    ]).then(([dataUrl, svgText]) => {
      if (cancelled) return
      setPng(dataUrl)
      setSvg(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`)
    })
    return () => {
      cancelled = true
    }
  }, [value])

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="flex items-center justify-center rounded-2xl border border-(--line) bg-white p-2"
        style={{ width: size + 16, height: size + 16 }}
      >
        {png ? (
          <img
            src={png}
            width={size}
            height={size}
            alt={`QR code that opens ${value}`}
          />
        ) : (
          <span className="text-xs text-(--ink-3)">Generating…</span>
        )}
      </div>
      <div className="flex gap-2">
        <a
          href={png ?? undefined}
          download={`${fileName}.png`}
          aria-disabled={!png}
          className={btnClass('outline', 'sm')}
        >
          <Download className="size-3.5" /> PNG
        </a>
        <a
          href={svg ?? undefined}
          download={`${fileName}.svg`}
          aria-disabled={!svg}
          className={btnClass('outline', 'sm')}
        >
          <Download className="size-3.5" /> SVG
        </a>
      </div>
    </div>
  )
}
