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

export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}
