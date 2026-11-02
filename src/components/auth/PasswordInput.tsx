import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { ComponentProps } from 'react'

import { TextInput } from '#/components/crm/ui'

/** Password field with a show/hide toggle. */
export default function PasswordInput(
  props: Omit<ComponentProps<'input'>, 'type'>,
) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <TextInput
        {...props}
        type={visible ? 'text' : 'password'}
        className="h-11 pr-11"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-(--ink-3) hover:bg-(--sage) hover:text-(--ink)"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}
