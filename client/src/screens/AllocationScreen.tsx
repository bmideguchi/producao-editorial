import { useEffect, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { ApiError, api } from '../api'
import { todayIso } from '../format'
import type { AllocationEntry, AllocationReport } from '../types'
import { Banner, Button, Loading, Screen, Title } from '../ui'

function currentMonth(): string {
  return todayIso().slice(0, 7)
}

function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1))
  return date.toISOString().slice(0, 7)
}

function monthLabel(month: string): string {
  const label = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const WEEKDAY = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const

function weekdayLetter(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return WEEKDAY[new Date(Date.UTC(year, month - 1, date)).getUTCDay()]
}

function cellClass(count: number, closed: boolean): string {
  if (count >= 3) return 'bg-danger'
  if (count === 2) return 'bg-warn'
  if (count === 1) return 'bg-ok'
  return closed ? 'bg-off' : 'bg-idle'
}

type Tip = {
  left: number
  top: number
  lines: string[]
}

function placeTip(rect: { left: number; top: number; bottom: number }, lines: string[]): Tip {
  const width = 360
  const estimated = 20 + lines.length * 22
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
  let top = rect.bottom + 8
  if (top + estimated > window.innerHeight - 8) top = Math.max(8, rect.top - estimated - 8)
  return { left, top, lines }
}

function TaskBalloon({ tip }: { tip: Tip }) {
  useEffect(() => {
    if (typeof document === 'undefined') return
    const node = document.createElement('div')
    node.setAttribute('role', 'tooltip')
    node.style.position = 'fixed'
    node.style.left = `${tip.left}px`
    node.style.top = `${tip.top}px`
    node.style.zIndex = '1000'
    node.style.width = 'max-content'
    node.style.maxWidth = '360px'
    node.style.background = '#fffcf8'
    node.style.color = '#1c2430'
    node.style.border = '1px solid #e4d9cb'
    node.style.borderRadius = '12px'
    node.style.padding = '10px 12px'
    node.style.boxShadow = '0 10px 28px rgba(28, 36, 48, 0.16)'
    node.style.fontSize = '13px'
    node.style.lineHeight = '1.45'
    node.style.pointerEvents = 'none'
    tip.lines.forEach((line, index) => {
      const row = document.createElement('div')
      row.textContent = line
      if (index > 0) row.style.marginTop = '4px'
      node.appendChild(row)
    })
    document.body.appendChild(node)
    return () => node.remove()
  }, [tip])
  return null
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <View className={`h-4 w-4 rounded ${swatch}`} />
      <Text className="text-sm text-ink">{label}</Text>
    </View>
  )
}

function taskLines(entries: AllocationEntry[]): string[] {
  return entries.map((entry) => `${entry.project} — ${entry.task}`)
}

function DayCell({
  count,
  closed,
  label,
  lines,
  onShow,
  onHide,
}: {
  count: number
  closed: boolean
  label: string
  lines: string[]
  onShow: (rect: { left: number; top: number; bottom: number }, lines: string[]) => void
  onHide: () => void
}) {
  return (
    <View
      accessibilityLabel={label}
      className={`h-9 w-8 border-l border-line ${cellClass(count, closed)}`}
      onMouseEnter={(event) => {
        if (lines.length === 0) return
        const x = event.nativeEvent.clientX
        const y = event.nativeEvent.clientY
        onShow({ left: x, top: y, bottom: y + 14 }, lines)
      }}
      onMouseLeave={onHide}
    />
  )
}

export function AllocationScreen() {
  const [month, setMonth] = useState(currentMonth)
  const [report, setReport] = useState<AllocationReport | null>(null)
  const [error, setError] = useState('')
  const [tip, setTip] = useState<Tip | null>(null)

  useEffect(() => {
    let cancelled = false
    setError('')
    setTip(null)
    api.allocation(month)
      .then((result) => {
        if (!cancelled) setReport(result)
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : 'Não foi possível carregar a alocação.')
      })
    return () => {
      cancelled = true
    }
  }, [month])

  const visible = report?.month === month ? report : null
  if (!visible && !error) return <Loading />

  return (
    <Screen wide>
      <Title>Alocação</Title>
      <View className="flex-row flex-wrap items-center gap-2">
        <Button label="Mês anterior" tone="quiet" onPress={() => setMonth((current) => shiftMonth(current, -1))} />
        <Text className="min-w-40 text-center text-lg font-semibold text-ink">{monthLabel(month)}</Text>
        <Button label="Próximo mês" tone="quiet" onPress={() => setMonth((current) => shiftMonth(current, 1))} />
      </View>
      <View className="flex-row flex-wrap gap-4">
        <Legend swatch="bg-idle" label="cinza claro desalocado" />
        <Legend swatch="bg-off" label="cinza escuro sem expediente" />
        <Legend swatch="bg-ok" label="verde 1 tarefa" />
        <Legend swatch="bg-warn" label="amarelo 2 tarefas" />
        <Legend swatch="bg-danger" label="vermelho 3 ou mais" />
      </View>
      {error ? <Banner message={error} /> : null}
      {tip ? <TaskBalloon tip={tip} /> : null}
      {visible ? (
        <ScrollView horizontal onScroll={() => setTip(null)} scrollEventThrottle={16}>
          <View className="overflow-hidden rounded-2xl border border-line bg-paper">
            <View className="flex-row border-b border-line bg-canvas">
              <Text className="w-44 shrink-0 justify-center px-3 py-2 text-sm font-semibold text-muted">Pessoa</Text>
              {visible.days.map((day, index) => {
                const closed = visible.closed?.[index] ?? false
                const letter = weekdayLetter(day)
                return (
                  <View
                    key={day}
                    accessibilityLabel={`${Number(day.slice(8))} ${letter}${closed ? ' sem expediente' : ''}`}
                    className={`w-8 items-center py-1 ${closed ? 'bg-off' : ''}`}
                  >
                    <Text className={`text-xs font-semibold ${closed ? 'text-paper' : 'text-ink'}`}>{Number(day.slice(8))}</Text>
                    <Text className={`text-[10px] font-semibold ${closed ? 'text-paper' : 'text-muted'}`}>{letter}</Text>
                  </View>
                )
              })}
            </View>
            {visible.people.map((person) => (
              <View key={person.id} className="flex-row border-b border-line">
                <Text className="w-44 shrink-0 px-3 py-2 text-sm font-semibold text-ink" numberOfLines={1}>
                  {person.name}
                </Text>
                {person.counts.map((count, index) => {
                  const day = visible.days[index]
                  const closed = visible.closed?.[index] ?? false
                  const lines = taskLines(person.tasks?.[index] ?? [])
                  const label = lines.length ? `${person.name} ${day} ${count}. ${lines.join('. ')}` : `${person.name} ${day} ${count}`
                  return (
                    <DayCell
                      key={day}
                      count={count}
                      closed={closed}
                      label={label}
                      lines={lines}
                      onShow={(rect, shown) => setTip(placeTip(rect, shown))}
                      onHide={() => setTip(null)}
                    />
                  )
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}
    </Screen>
  )
}
