import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ApiError, api } from '../api'
import type { WorkCalendar } from '../types'
import { Banner, BodyText, Button, DateField, Empty, FormColumn, Loading, Muted, PageHeader, Panel, Screen, SectionLabel, TrashButton } from '../ui'

const datePattern = /^\d{4}-\d{2}-\d{2}$/

const weekdays = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
]

function formatHoliday(iso: string): string {
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

export function CalendarScreen() {
  const [calendar, setCalendar] = useState<WorkCalendar | null>(null)
  const [holiday, setHoliday] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.calendar()
      .then((result) => setCalendar(result.calendar))
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : 'Não foi possível carregar o calendário.'))
  }, [])

  function update(next: WorkCalendar): void {
    setCalendar(next)
    setSaved(false)
  }

  function toggleWeekday(day: number): void {
    if (!calendar) return
    const closed = calendar.closedWeekdays.includes(day)
    update({
      ...calendar,
      closedWeekdays: closed
        ? calendar.closedWeekdays.filter((item) => item !== day)
        : [...calendar.closedWeekdays, day].sort((a, b) => a - b),
    })
  }

  function addHoliday(): void {
    if (!calendar || !datePattern.test(holiday)) return
    if (calendar.holidays.includes(holiday)) {
      setHoliday('')
      return
    }
    update({ ...calendar, holidays: [...calendar.holidays, holiday].sort() })
    setHoliday('')
  }

  function removeHoliday(day: string): void {
    if (!calendar) return
    update({ ...calendar, holidays: calendar.holidays.filter((item) => item !== day) })
  }

  async function save(): Promise<void> {
    if (!calendar) return
    setPending(true)
    setError('')
    try {
      const result = await api.saveCalendar(calendar)
      setCalendar(result.calendar)
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível salvar o calendário.')
    } finally {
      setPending(false)
    }
  }

  if (!calendar && !error) return <Loading />

  return (
    <Screen>
      <PageHeader title="Calendário" />
      <FormColumn>
      <Muted>Um calendário para a equipe. A duração das tarefas conta só os dias de expediente.</Muted>
      {error ? <Banner message={error} /> : null}
      {calendar ? (
        <Panel>
          <SectionLabel>Dias sem expediente</SectionLabel>
          <View className="gap-2">
            {weekdays.map((day) => {
              const checked = calendar.closedWeekdays.includes(day.value)
              return (
                <Pressable key={day.value} onPress={() => toggleWeekday(day.value)} className="flex-row items-center gap-3">
                  <View className={`h-5 w-5 items-center justify-center rounded border ${checked ? 'border-brand bg-brand' : 'border-line bg-paper'}`}>
                    {checked ? <Text className="text-xs font-bold text-white">✓</Text> : null}
                  </View>
                  <BodyText>{day.label}</BodyText>
                </Pressable>
              )
            })}
          </View>
          <SectionLabel>Feriados</SectionLabel>
          {calendar.holidays.length === 0 ? <Empty compact>Nenhum feriado.</Empty> : null}
          {calendar.holidays.map((day) => (
            <View key={day} className="flex-row items-center justify-between">
              <BodyText>{formatHoliday(day)}</BodyText>
              <TrashButton label={`Remover ${formatHoliday(day)}`} onPress={() => removeHoliday(day)} />
            </View>
          ))}
          <View className="flex-row items-center gap-2">
            <View className="min-w-0 flex-1">
              <DateField value={holiday} onChange={setHoliday} />
            </View>
            <Button label="Adicionar" tone="quiet" disabled={!datePattern.test(holiday)} onPress={addHoliday} />
          </View>
          <Button label={pending ? 'Salvando...' : 'Salvar'} disabled={pending} onPress={() => void save()} />
          {saved ? <Muted>Calendário salvo.</Muted> : null}
        </Panel>
      ) : null}
      </FormColumn>
    </Screen>
  )
}
