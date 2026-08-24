import type React from 'react'
import { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { normalizeColor } from '~renderer/lib/terminal-theme'

import { Input } from '../ui/input'
import { SettingsRow } from './settings-form-layout'

type ColorFieldProps = {
  label: string
  description: string
  value: string
  fallback: string
  onChange: (value: string) => void
}

type NumberFieldProps = {
  label: string
  description: string
  value: number
  defaultValue?: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  suffix?: string
}

export function ColorField({
  label,
  description,
  value,
  fallback,
  onChange
}: ColorFieldProps): React.JSX.Element {
  const normalized = normalizeColor(value, fallback)

  return (
    <SettingsRow
      label={label}
      description={description}
      control={
        <div className="flex items-center gap-2">
          <Input
            type="color"
            value={normalized}
            onChange={(e) => onChange(e.target.value)}
            variant="color"
            size="sm"
            className="w-10"
          />
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={fallback}
            className="w-32 text-xs"
          />
        </div>
      }
    />
  )
}

export function NumberField({
  label,
  description,
  value,
  defaultValue,
  min,
  max,
  step = 1,
  onChange,
  suffix
}: NumberFieldProps): React.JSX.Element {
  const [draft, setDraft] = useState(Number.isFinite(value) ? String(value) : '')
  const [prevValue, setPrevValue] = useState(value)

  // Sync draft when the external value changes (e.g. from another source)
  if (value !== prevValue) {
    setPrevValue(value)
    setDraft(Number.isFinite(value) ? String(value) : '')
  }

  const commit = (): void => {
    const trimmed = draft.trim()
    if (trimmed === '') {
      // Empty input — reset to current value rather than committing 0
      setDraft(Number.isFinite(value) ? String(value) : '')
      return
    }
    const next = Number(trimmed)
    if (Number.isFinite(next)) {
      const clamped = Math.min(max, Math.max(min, next))
      onChange(clamped)
      setDraft(String(clamped))
    } else {
      // Reset to current value if input is invalid
      setDraft(Number.isFinite(value) ? String(value) : '')
    }
  }

  return (
    <SettingsRow
      label={label}
      description={
        <>
          {description}
          {defaultValue !== undefined ? (
            <span className="text-muted-foreground/70 ml-1">
              {translate('auto.components.settings.SettingsFormControls.b661b034ec', '· Default:')}{' '}
              {defaultValue}
            </span>
          ) : null}
        </>
      }
      control={
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={min}
            max={max}
            step={step}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commit()
              }
            }}
            className="number-input-clean w-24 tabular-nums"
          />
          {suffix ? <span className="text-muted-foreground shrink-0 text-xs">{suffix}</span> : null}
        </div>
      }
    />
  )
}
