import type { Role, StageColor } from './types'

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

export function roleLabel(role: Role): string {
  return role === 'admin' ? 'Administrador' : 'Operador'
}

export function colorLabel(color: StageColor): string {
  if (color === 'green') return 'concluída'
  if (color === 'yellow') return 'parcialmente concluída'
  if (color === 'blue') return 'em andamento'
  return 'aguardando'
}

export function formatAllocationDays(value: number): string {
  const text = value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  return value === 1 ? `${text} dia` : `${text} dias`
}

export function scaleAllocationDays(days: number, quantity: number): number {
  return Math.round(days * quantity * 100) / 100
}

export function parseAllocationDays(value: string): number | null {
  const trimmed = value.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const days = Number(trimmed)
  return days > 0 ? days : null
}

export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}
