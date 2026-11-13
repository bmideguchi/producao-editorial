import { useEffect, useRef, useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import { api } from '../api'
import { formatAllocationDays, parseAllocationDays, scaleAllocationDays } from '../format'
import type { ScopeLine, ServiceRecord } from '../types'
import { BodyText, Button, Card, Empty, FieldLabel, Muted, SectionLabel, SelectField, TrashButton, mutedColor } from '../ui'

type Row = { key: string; serviceId: string; quantity: string; days: string }

export type ScopeDraft = { serviceId: string; quantity: number; allocationDays: number }

function daysInput(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

function rowsFrom(scope: ScopeLine[]): Row[] {
  return scope.map((line) => ({
    key: line.serviceId,
    serviceId: line.serviceId,
    quantity: String(line.quantity),
    days: daysInput(line.allocationDays),
  }))
}

function lineTotal(row: Row): number | null {
  const days = parseAllocationDays(row.days)
  const quantity = Number(row.quantity)
  if (days === null || !Number.isInteger(quantity) || quantity < 1) return null
  return scaleAllocationDays(days, quantity)
}

export function ScopeEditor({
  scope,
  admin,
  onChange,
}: {
  scope: ScopeLine[]
  admin: boolean
  onChange?: (lines: ScopeDraft[]) => void
}) {
  const [services, setServices] = useState<ServiceRecord[]>([])
  const [rows, setRows] = useState<Row[]>(rowsFrom(scope))
  const [daysError, setDaysError] = useState('')
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const scopeKey = scope.map((line) => `${line.serviceId}:${line.quantity}:${line.allocationDays}`).join('|')

  useEffect(() => {
    if (!admin) return
    api.services().then((result) => setServices(result.services)).catch(() => setServices([]))
  }, [admin])

  useEffect(() => {
    setRows(rowsFrom(scope))
  }, [scopeKey])

  function publish(next: Row[]): void {
    setRows(next)
    const lines: ScopeDraft[] = []
    for (const row of next) {
      if (!row.serviceId) continue
      const quantity = Number(row.quantity)
      const allocationDays = parseAllocationDays(row.days)
      if (!Number.isInteger(quantity) || quantity < 1 || allocationDays === null) {
        if (allocationDays === null) setDaysError('Informe um tempo maior que zero, com até duas casas decimais.')
        return
      }
      lines.push({ serviceId: row.serviceId, quantity, allocationDays })
    }
    setDaysError('')
    onChange?.(lines)
  }

  if (!admin) {
    return (
      <Card>
        <SectionLabel>Escopo</SectionLabel>
        {scope.length === 0 ? <Empty compact>Nenhum serviço neste projeto.</Empty> : null}
        {scope.map((line) => (
          <BodyText key={line.serviceId}>
            {line.serviceName} × {line.quantity} · {formatAllocationDays(line.allocationDays)} · total {formatAllocationDays(scaleAllocationDays(line.allocationDays, line.quantity))}
          </BodyText>
        ))}
      </Card>
    )
  }

  return (
    <Card>
      <SectionLabel>Escopo</SectionLabel>
      {daysError ? <Text className="text-sm text-danger">{daysError}</Text> : null}
      {rows.map((row) => {
        const taken = new Set(rows.filter((item) => item.key !== row.key).map((item) => item.serviceId))
        const options = [
          { value: '', label: 'Escolher serviço' },
          ...services
            .filter((service) => service.id === row.serviceId || !taken.has(service.id))
            .map((service) => ({ value: service.id, label: service.name })),
        ]
        const total = lineTotal(row)
        return (
          <View key={row.key} className="flex-row items-end gap-2">
            <View className="min-w-0 flex-1">
              <SelectField
                label="Serviço"
                value={row.serviceId}
                options={options}
                onValueChange={(serviceId) => {
                  const chosen = services.find((service) => service.id === serviceId)
                  publish(rows.map((item) => item.key === row.key
                    ? { ...item, serviceId, days: chosen ? daysInput(chosen.allocationDays) : '' }
                    : item))
                }}
              />
            </View>
            <View className="w-28 gap-1.5">
              <FieldLabel>Duração</FieldLabel>
              <TextInput
                value={row.days}
                onChangeText={(days) => setRows((current) => current.map((item) => item.key === row.key ? { ...item, days } : item))}
                onBlur={() => publish(rowsRef.current)}
                placeholder="0,5"
                placeholderTextColor={mutedColor}
                autoCapitalize="none"
                accessibilityLabel="Duração"
                className="h-11 rounded-lg border border-line bg-paper px-3 text-sm text-ink"
              />
            </View>
            <View className="w-28 gap-1.5">
              <FieldLabel>Quantidade</FieldLabel>
              <TextInput
                value={row.quantity}
                onChangeText={(quantity) => setRows((current) => current.map((item) => item.key === row.key ? { ...item, quantity } : item))}
                onBlur={() => publish(rowsRef.current)}
                keyboardType="number-pad"
                className="h-11 rounded-lg border border-line bg-paper px-3 text-sm text-ink"
              />
            </View>
            <View className="h-11 min-w-16 justify-center">
              <Muted>{total === null ? '' : formatAllocationDays(total)}</Muted>
            </View>
            <View className="h-11 w-11 items-center justify-center">
              <TrashButton label="Remover serviço" onPress={() => publish(rows.filter((item) => item.key !== row.key))} />
            </View>
          </View>
        )
      })}
      <Button
        label="Adicionar serviço"
        tone="quiet"
        onPress={() => setRows((current) => [...current, { key: `new-${Date.now()}`, serviceId: '', quantity: '1', days: '' }])}
      />
    </Card>
  )
}
