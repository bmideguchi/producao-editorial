import { createElement, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { colorLabel } from './format'
import type { StageColor, StageListItem } from './types'

export const ink = '#0f172a'
export const mutedColor = '#64748b'
export const line = '#e2e8f0'
export const paper = '#ffffff'
export const canvas = '#f4f6f8'
export const brand = '#2563eb'

export const surfaceStyle = Platform.OS === 'web'
  ? { boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.08)' }
  : undefined

export const dotClass: Record<StageColor, string> = {
  gray: 'bg-wait',
  blue: 'bg-brand',
  yellow: 'bg-warn',
  green: 'bg-ok',
}

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView className="min-w-0 flex-1 bg-canvas" contentContainerClassName="grow px-6 py-6" keyboardShouldPersistTaps="handled">
      <View className="w-full min-w-0 max-w-none gap-4">{children}</View>
    </ScrollView>
  )
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <View className="w-full flex-row items-center justify-between gap-4">
      <View className="min-w-0 flex-1">
        <Title>{title}</Title>
      </View>
      {children}
    </View>
  )
}

export function FormColumn({ children }: { children: ReactNode }) {
  return <View className="w-full max-w-5xl gap-4">{children}</View>
}

export function Title({ children }: { children: string }) {
  return (
    <Text
      className="font-display text-2xl font-bold tracking-tight text-ink"
      style={Platform.OS === 'web' ? { fontFamily: 'Space Grotesk, Inter, "Segoe UI", sans-serif' } : undefined}
    >
      {children}
    </Text>
  )
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text className="text-sm leading-5 text-muted">{children}</Text>
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text className="text-sm font-medium text-ink">{children}</Text>
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text className="text-base font-semibold tracking-tight text-ink">{children}</Text>
}

export function TableHeaderText({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <Text className={`text-sm font-medium text-muted ${className}`}>{children}</Text>
}

export function BodyText({
  children,
  className = '',
  numberOfLines,
}: {
  children: ReactNode
  className?: string
  numberOfLines?: number
}) {
  return <Text numberOfLines={numberOfLines} className={`text-sm text-ink ${className}`}>{children}</Text>
}

export function Empty({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return (
    <View className={`items-center justify-center px-4 ${compact ? 'py-6' : 'py-10'}`}>
      <Text className="text-center text-sm text-muted">{children}</Text>
    </View>
  )
}

export function Field({
  label,
  value,
  onChangeText,
  onBlur,
  secureTextEntry,
  placeholder,
}: {
  label: string
  value: string
  onChangeText: (value: string) => void
  onBlur?: () => void
  secureTextEntry?: boolean
  placeholder?: string
}) {
  return (
    <View className="gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        secureTextEntry={secureTextEntry}
        placeholder={placeholder}
        placeholderTextColor={mutedColor}
        autoCapitalize="none"
        className="rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink"
      />
    </View>
  )
}

export function SelectField({
  label,
  value,
  options,
  onValueChange,
  disabled,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onValueChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <View className="gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      {Platform.OS === 'web' ? (
        createElement(
          'select',
          {
            'aria-label': label,
            value,
            disabled,
            onChange: (event: { currentTarget: { value: string } }) => onValueChange(event.currentTarget.value),
            style: {
              width: '100%',
              height: 44,
              boxSizing: 'border-box',
              border: `1px solid ${line}`,
              borderRadius: 10,
              padding: '0 12px',
              background: disabled ? canvas : paper,
              color: ink,
              fontSize: 14,
              fontFamily: 'inherit',
            },
          },
          options.map((option) => createElement('option', { key: option.value, value: option.value }, option.label)),
        )
      ) : (
        <View className="gap-2">
          {options.map((option) => (
            <Button
              key={option.value}
              label={option.label}
              tone={option.value === value ? 'primary' : 'quiet'}
              disabled={disabled}
              onPress={() => onValueChange(option.value)}
            />
          ))}
        </View>
      )}
    </View>
  )
}

export function DateField({
  value,
  onChange,
  onBlur,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
}) {
  if (Platform.OS === 'web') {
    return createElement('input', {
      type: 'date',
      value,
      disabled,
      'aria-label': 'Data',
      onChange: (event: { currentTarget: { value: string } }) => onChange(event.currentTarget.value),
      onBlur,
      style: {
        width: '100%',
        height: 44,
        boxSizing: 'border-box',
        border: `1px solid ${line}`,
        borderRadius: 10,
        padding: '0 12px',
        background: disabled ? canvas : paper,
        color: ink,
        fontSize: 14,
        fontFamily: 'inherit',
      },
    })
  }
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      onBlur={onBlur}
      editable={!disabled}
      placeholder="AAAA-MM-DD"
      placeholderTextColor={mutedColor}
      autoCapitalize="none"
      className="h-11 rounded-lg border border-line bg-paper px-3 text-sm text-ink"
    />
  )
}

export function TrashButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      className={`h-9 w-9 items-center justify-center rounded-lg ${disabled ? 'opacity-50' : ''}`}
    >
      <TrashIcon />
    </Pressable>
  )
}

function TrashIcon() {
  if (Platform.OS === 'web') {
    return createElement(
      'svg',
      { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: '#dc2626', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      createElement('path', { d: 'M4 7h16' }),
      createElement('path', { d: 'M9 7V5h6v2' }),
      createElement('path', { d: 'M7 7l1 13h8l1-13' }),
    )
  }
  return <Text className="text-lg text-danger">⌫</Text>
}

export function Button({
  label,
  onPress,
  disabled,
  tone = 'primary',
  size = 'md',
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  tone?: 'primary' | 'quiet' | 'danger'
  size?: 'sm' | 'md'
}) {
  const toneClass = tone === 'quiet'
    ? 'border border-line bg-paper'
    : tone === 'danger'
      ? 'bg-danger'
      : 'bg-brand'
  const sizeClass = size === 'sm' ? 'rounded-lg px-2.5 py-1.5' : 'rounded-lg px-3.5 py-2'
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`shrink-0 cursor-pointer flex-row items-center justify-center self-start ${sizeClass} ${toneClass} ${disabled ? 'opacity-50' : ''}`}
    >
      <Text className={`${size === 'sm' ? 'text-xs' : 'text-sm'} font-semibold ${tone === 'quiet' ? 'text-ink' : 'text-white'}`}>{label}</Text>
    </Pressable>
  )
}

export function Banner({ message }: { message: string }) {
  return (
    <View className="rounded-xl bg-danger-bg p-3">
      <Text className="text-danger">{message}</Text>
    </View>
  )
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={surfaceStyle} className="gap-3 rounded-xl border border-line bg-paper p-4">{children}</View>
}

export function Panel({ children }: { children: ReactNode }) {
  return <View style={surfaceStyle} className="gap-3 rounded-xl border border-line bg-paper p-4">{children}</View>
}

export function TableScroll({ children, onScroll }: { children: ReactNode; onScroll?: () => void }) {
  if (Platform.OS === 'web') {
    return createElement('div', {
      style: { width: '100%', maxWidth: '100%', overflowX: 'auto' },
      onScroll,
    }, children)
  }
  return <ScrollView horizontal className="w-full" onScroll={onScroll} scrollEventThrottle={16}>{children}</ScrollView>
}

export function TableShell({ children, minWidth = 0 }: { children: ReactNode; minWidth?: number }) {
  return (
    <View
      style={[
        surfaceStyle,
        Platform.OS === 'web'
          ? { width: 'max-content', minWidth: minWidth > 0 ? `max(100%, ${minWidth}px)` : '100%' }
          : minWidth > 0 ? { minWidth } : undefined,
      ]}
      className="overflow-hidden rounded-xl border border-line bg-paper"
    >
      {children}
    </View>
  )
}

export function CardGrid({ children }: { children: ReactNode }) {
  if (Platform.OS === 'web') {
    return createElement('div', {
      style: {
        display: 'grid',
        width: '100%',
        gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      },
    }, children)
  }
  return <View className="gap-4">{children}</View>
}

export function GridCell({ children }: { children: ReactNode }) {
  if (Platform.OS === 'web') {
    return createElement('div', { style: { minWidth: 0, display: 'flex', flexDirection: 'column' } }, children)
  }
  return <View className="w-full">{children}</View>
}

export function Loading() {
  return (
    <View className="min-h-screen flex-1 items-center justify-center bg-canvas">
      <ActivityIndicator color={brand} />
    </View>
  )
}

export function Dots({ stages }: { stages: StageListItem[] }) {
  const missing = stages.filter((stage) => stage.unassigned)
  return (
    <View className="gap-1.5">
      <View className="flex-row flex-wrap gap-2">
        {stages.map((stage) => (
          <View
            key={stage.id}
            accessibilityLabel={`${stage.name}: ${colorLabel(stage.color)}`}
            className={`h-3.5 w-3.5 rounded-full border-2 border-paper ${dotClass[stage.color]}`}
          />
        ))}
      </View>
      {missing.map((stage) => (
        <Text key={stage.id} className="text-[13px] text-danger">
          {stage.name}: sem alocação
        </Text>
      ))}
    </View>
  )
}

export function Confirm({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-ink/50 p-5">
        <View style={surfaceStyle} className="w-full max-w-md gap-4 rounded-xl border border-line bg-paper p-5">
          <Text className="font-display text-lg font-semibold tracking-tight text-ink">{title}</Text>
          <Muted>{message}</Muted>
          <View className="flex-row justify-end gap-2">
            <Button label="Cancelar" tone="quiet" onPress={onCancel} />
            <Button label={confirmLabel} onPress={onConfirm} />
          </View>
        </View>
      </View>
    </Modal>
  )
}

export function LinkText({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <Text className="text-sm font-semibold text-brand">{label}</Text>
    </Pressable>
  )
}
