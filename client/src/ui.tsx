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

export const dotClass: Record<StageColor, string> = {
  gray: 'bg-wait',
  blue: 'bg-brand',
  yellow: 'bg-warn',
  green: 'bg-ok',
}

export function Screen({ children, wide = false, fill = false }: { children: ReactNode; wide?: boolean; fill?: boolean }) {
  const width = fill ? 'max-w-none' : wide ? 'max-w-6xl' : 'max-w-3xl'
  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="grow px-6 py-6" keyboardShouldPersistTaps="handled">
      <View className={`w-full gap-4 self-center ${width}`}>{children}</View>
    </ScrollView>
  )
}

export function Title({ children }: { children: string }) {
  return <Text className="text-3xl font-bold text-ink">{children}</Text>
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text className="text-[15px] leading-6 text-muted">{children}</Text>
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
      <Text className="text-sm font-semibold text-ink">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        secureTextEntry={secureTextEntry}
        placeholder={placeholder}
        placeholderTextColor="#5E6A78"
        autoCapitalize="none"
        className="rounded-xl border border-line bg-paper px-3 py-2.5 text-base text-ink"
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
      <Text className="text-sm font-semibold text-ink">{label}</Text>
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
              boxSizing: 'border-box',
              border: '1px solid #e4d9cb',
              borderRadius: 12,
              padding: '10px 12px',
              background: disabled ? '#f3eee6' : '#fffcf8',
              color: '#1c2430',
              fontSize: 16,
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
        boxSizing: 'border-box',
        border: '1px solid #e4d9cb',
        borderRadius: 8,
        padding: '8px 10px',
        background: disabled ? '#f3eee6' : '#fffcf8',
        color: '#1c2430',
        fontSize: 15,
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
      placeholderTextColor="#5E6A78"
      autoCapitalize="none"
      className="rounded-lg border border-line bg-paper px-3 py-2 text-ink"
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
      { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: '#9b3a3a', strokeWidth: 2, 'aria-hidden': true },
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
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  tone?: 'primary' | 'quiet' | 'danger'
}) {
  const toneClass = tone === 'quiet'
    ? 'border border-line bg-transparent'
    : tone === 'danger'
      ? 'bg-danger'
      : 'bg-brand'
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`items-center rounded-xl px-3.5 py-2.5 ${toneClass} ${disabled ? 'opacity-50' : ''}`}
    >
      <Text className={`font-bold ${tone === 'quiet' ? 'text-ink' : 'text-white'}`}>{label}</Text>
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
  return <View className="gap-2.5 rounded-2xl border border-line bg-paper p-4">{children}</View>
}

export function Loading() {
  return (
    <View className="min-h-screen flex-1 items-center justify-center bg-canvas">
      <ActivityIndicator color="#1D4E89" />
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
            className={`h-4 w-4 rounded-full ${dotClass[stage.color]}`}
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
      <View className="flex-1 items-center justify-center bg-ink/45 p-5">
        <View className="w-full max-w-md gap-3 rounded-2xl bg-paper p-5">
          <Text className="text-lg font-bold text-ink">{title}</Text>
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
      <Text className="font-bold text-brand">{label}</Text>
    </Pressable>
  )
}
