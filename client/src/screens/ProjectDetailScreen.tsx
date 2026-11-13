import { useEffect, useRef, useState } from 'react'
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native'
import { ApiError, api } from '../api'
import { colorLabel, formatDate, roleLabel } from '../format'
import { go } from '../nav'
import { useSession } from '../session'
import type { ClientRecord, ProjectDetail, StageColor, StageDetail, Subtask, SupplierRecord, WorkCalendar } from '../types'
import { ScopeEditor } from './ScopeEditor'
import { IconPencil } from '../icons'
import { Banner, BodyText, Button, Card, Confirm, DateField, Empty, Field, FieldLabel, Loading, Muted, Panel, Screen, SectionLabel, TableHeaderText, Title, TrashButton, dotClass, mutedColor, surfaceStyle } from '../ui'

const datePattern = /^\d{4}-\d{2}-\d{2}$/

type ProfessionalKind = 'user' | 'supplier'

type ProfessionalOption = {
  id: string
  name: string
  kind: ProfessionalKind
}

type DraftTask = {
  key: string
  name: string
  userId: string
  kind: ProfessionalKind | null
  personName: string
  startDate: string
  duration: string
  open: boolean
}

type AllocationInput = {
  userId?: string
  supplierId?: string
  startDate: string
  durationDays: number
}

function qualifies(color: StageColor): boolean {
  return color === 'blue' || color === 'yellow' || color === 'green'
}

function defaultStageId(stages: readonly StageDetail[]): string | null {
  const qualifying = stages.filter((stage) => qualifies(stage.color))
  if (qualifying.length > 0) return qualifying[qualifying.length - 1].id
  return stages[0]?.id ?? null
}

const SCOPE_PANEL = { kind: 'scope' } as const

type PanelSelection = typeof SCOPE_PANEL | { kind: 'stage'; id: string }

function defaultSelection(stages: readonly StageDetail[]): PanelSelection {
  const id = defaultStageId(stages)
  return id ? { kind: 'stage', id } : SCOPE_PANEL
}

function connectorStyle(index: number, count: number): { top: number; left: number | '50%'; right: number | '50%' } | null {
  if (count < 2) return null
  return {
    top: 11,
    left: index === 0 ? '50%' : 0,
    right: index === count - 1 ? '50%' : 0,
  }
}

function wholeDays(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  const days = Number(value.trim())
  return days > 0 ? days : null
}

function durationLabel(days: number): string {
  return days === 1 ? '1 dia' : `${days} dias`
}

type PredecessorOption = { id: string; label: string }

function predecessorOptions(stages: readonly StageDetail[], stage: StageDetail, taskId: string): PredecessorOption[] {
  const index = stages.findIndex((item) => item.id === stage.id)
  const previous = index > 0 ? stages[index - 1] : undefined
  const current = stage.subtasks
    .filter((task) => task.id !== taskId)
    .map((task) => ({ id: task.id, label: task.name }))
  const prior = (previous?.subtasks ?? []).map((task) => ({
    id: task.id,
    label: `${previous?.name ?? 'Etapa anterior'} — ${task.name}`,
  }))
  return [...current, ...prior]
}

function isoAddDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function daySpan(start: string, end: string): number {
  const [startYear, startMonth, startDay] = start.split('-').map(Number)
  const [endYear, endMonth, endDay] = end.split('-').map(Number)
  return Math.round((Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(startYear, startMonth - 1, startDay)) / 86_400_000)
}

function shortDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  return `${day}/${month}`
}

const weekendCalendar: WorkCalendar = { closedWeekdays: [0, 6], holidays: [] }

function saoPauloToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function isNonWorking(iso: string, calendar: WorkCalendar): boolean {
  const [year, month, day] = iso.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return calendar.closedWeekdays.includes(weekday) || calendar.holidays.includes(iso)
}

function tempoOf(task: Subtask): string {
  return task.durationDays > 0 ? String(task.durationDays) : ''
}

function taskBarColor(task: Subtask, stage: StageDetail, today: string): string {
  if (task.done) return '#1f7a4d'
  if (task.startDate && task.startDate > today) return '#b7b1a8'
  const siblingDone = stage.subtasks.some((other) => other.id !== task.id && other.done)
  return siblingDone ? '#c48a12' : '#1d4e89'
}

function todayScrollOffset(days: readonly string[], today: string): number {
  if (days.length === 0) return 0
  const index = days.indexOf(today)
  if (index >= 0) return index * GANTT_DAY_W
  if (today < days[0]) return 0
  return (days.length - 1) * GANTT_DAY_W
}

function profissionalLabel(name: string, assignee: { active: boolean; deleted: boolean; kind?: ProfessionalKind } | null): string {
  if (assignee?.deleted) return assignee.kind === 'supplier' ? 'Fornecedor excluído' : 'Usuário excluído'
  if (!name) return ''
  const inactive = assignee && assignee.kind !== 'supplier' && !assignee.active ? ' (inativo)' : ''
  const suffix = assignee?.kind === 'supplier' ? ' (fornecedor)' : ''
  return `${name}${inactive}${suffix}`
}

function allocationFrom(id: string, kind: ProfessionalKind | null, startDate: string, duration: string): AllocationInput | null {
  const durationDays = wholeDays(duration)
  if (!id || !kind || !datePattern.test(startDate) || durationDays === null) return null
  if (kind === 'supplier') return { supplierId: id, startDate, durationDays }
  return { userId: id, startDate, durationDays }
}

function allocationPersonId(allocation: AllocationInput): string {
  return allocation.supplierId ?? allocation.userId ?? ''
}

function DescriptionField({
  value,
  onCommit,
}: {
  value: string
  onCommit: (value: string) => Promise<boolean>
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <View className="gap-1.5">
      <FieldLabel>Descrição</FieldLabel>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={() => {
          const next = draft.trim()
          if (next === value) {
            setDraft(value)
            return
          }
          void onCommit(next).then((saved) => {
            if (!saved) setDraft(value)
          })
        }}
        multiline
        numberOfLines={6}
        textAlignVertical="top"
        maxLength={4000}
        placeholder="Descrição geral do projeto"
        placeholderTextColor={mutedColor}
        className="min-h-32 rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink"
      />
    </View>
  )
}

function CatalogField({
  label,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  emptyMessage,
  selectedId,
  options,
  onCommit,
}: {
  label: string
  placeholder: string
  searchPlaceholder: string
  emptyLabel: string
  emptyMessage: string
  selectedId: string | null
  options: readonly { id: string; name: string }[]
  onCommit: (id: string | null) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = options.find((option) => option.id === selectedId)
  const needle = query.trim().toLocaleLowerCase('pt-BR')
  const filtered = options.filter((option) => option.name.toLocaleLowerCase('pt-BR').includes(needle))

  function choose(next: string | null): void {
    setOpen(false)
    setQuery('')
    if (next === selectedId) return
    void onCommit(next)
  }

  return (
    <View className="gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <Pressable onPress={() => setOpen((current) => !current)} className="rounded-xl border border-line bg-paper px-3 py-2.5">
        <Text className={selected ? 'text-sm text-ink' : 'text-sm text-muted'}>{selected?.name || placeholder}</Text>
      </Pressable>
      {open ? (
        <View className="gap-2 rounded-xl border border-line bg-canvas p-2">
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder}
            placeholderTextColor={mutedColor}
            autoCapitalize="none"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
          />
          <Pressable onPress={() => choose(null)} className="rounded-lg px-2 py-2">
            <Text className="text-sm text-muted">{emptyLabel}</Text>
          </Pressable>
          {filtered.map((option) => (
            <Pressable key={option.id} onPress={() => choose(option.id)} className="rounded-lg px-2 py-2">
              <Text className={option.id === selectedId ? 'text-sm font-bold text-brand' : 'text-sm text-ink'}>{option.name}</Text>
            </Pressable>
          ))}
          {filtered.length === 0 ? <Muted>{emptyMessage}</Muted> : null}
        </View>
      ) : null}
    </View>
  )
}

export function ProjectDetailScreen({ id }: { id: string }) {
  const { user } = useSession()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [selection, setSelection] = useState<PanelSelection | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [team, setTeam] = useState<ProfessionalOption[]>([])
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([])
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [confirm, setConfirm] = useState<{
    title: string
    message: string
    confirmLabel: string
    run: () => Promise<{ project: ProjectDetail } | void>
    onCancel?: () => void
  } | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archivePassword, setArchivePassword] = useState('')
  const [archiveError, setArchiveError] = useState('')
  const [archivePending, setArchivePending] = useState(false)
  const [calendar, setCalendar] = useState<WorkCalendar>(weekendCalendar)
  const [clients, setClients] = useState<ClientRecord[]>([])
  const professionals = [...team, ...suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name, kind: 'supplier' as const }))]
  const { width } = useWindowDimensions()
  const runSeq = useRef(0)

  function adopt(next: ProjectDetail): void {
    setProject(next)
    setSelection((current) => {
      if (current?.kind === 'scope') return current
      if (current?.kind === 'stage' && next.stages.some((stage) => stage.id === current.id)) return current
      return defaultSelection(next.stages)
    })
  }

  useEffect(() => {
    api.project(id)
      .then((result) => adopt(result.project))
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : 'Projeto não encontrado.'))
  }, [id])

  useEffect(() => {
    if (user?.role !== 'admin') return
    api.users()
      .then((result) => setTeam(result.users
        .filter((person) => person.role === 'operator' && person.active)
        .map((person) => ({ id: person.id, name: person.name, kind: 'user' as const }))))
      .catch(() => setTeam([]))
  }, [user?.role])

  useEffect(() => {
    api.calendar()
      .then((result) => setCalendar(result.calendar))
      .catch(() => setCalendar(weekendCalendar))
  }, [])

  useEffect(() => {
    if (user?.role !== 'admin') return
    api.clients()
      .then((result) => setClients(result.clients))
      .catch(() => setClients([]))
    api.suppliers()
      .then((result) => setSuppliers(result.suppliers))
      .catch(() => setSuppliers([]))
  }, [user?.role])

  async function run(action: () => Promise<{ project: ProjectDetail } | void>): Promise<ProjectDetail | null> {
    const seq = ++runSeq.current
    setPending(true)
    setError('')
    try {
      const result = await action()
      if (seq !== runSeq.current) return result && 'project' in result ? result.project : project
      if (result && 'project' in result) {
        adopt(result.project)
        return result.project
      }
      return project
    } catch (caught) {
      if (seq === runSeq.current) {
        setError(caught instanceof ApiError ? caught.message : 'Não foi possível concluir a ação.')
      }
      return null
    } finally {
      if (seq === runSeq.current) setPending(false)
    }
  }

  if (!project && !error) return <Loading />
  if (!project) {
    return (
      <Screen>
        <Title>Projeto</Title>
        <Banner message={error || 'Projeto não encontrado.'} />
      </Screen>
    )
  }

  const admin = user?.role === 'admin'
  const panel = selection ?? defaultSelection(project.stages)
  const scopeSelected = panel.kind === 'scope'
  const selected = panel.kind === 'stage' ? project.stages.find((stage) => stage.id === panel.id) : undefined
  const stopCount = project.stages.length + 1
  const stackedScope = Platform.OS !== 'web' || width < 800

  async function saveName(): Promise<void> {
    const next = await run(() => api.updateProject(project!.id, { name: nameDraft }))
    if (next) setEditingName(false)
  }

  async function saveDescription(description: string): Promise<boolean> {
    const next = await run(() => api.updateProject(project!.id, { description }))
    return Boolean(next)
  }

  async function saveClient(clientId: string | null): Promise<boolean> {
    const next = await run(() => api.updateProject(project!.id, { clientId }))
    return Boolean(next)
  }

  async function saveSupplier(supplierId: string | null): Promise<boolean> {
    const next = await run(() => api.updateProject(project!.id, { supplierId }))
    return Boolean(next)
  }

  async function submitArchive(): Promise<void> {
    setArchivePending(true)
    setArchiveError('')
    try {
      await api.archiveProject(project!.id, archivePassword)
      go('/projetos')
    } catch (caught) {
      setArchiveError(caught instanceof ApiError ? caught.message : 'Não foi possível arquivar o projeto.')
    } finally {
      setArchivePending(false)
    }
  }

  return (
    <Screen>
      {editingName ? (
        <View className="gap-3">
          <TextInput
            value={nameDraft}
            onChangeText={setNameDraft}
            autoCapitalize="none"
            className="rounded-lg border border-line bg-paper px-3 py-2.5 font-display text-2xl font-bold tracking-tight text-ink"
            style={Platform.OS === 'web' ? { fontFamily: 'Space Grotesk, Inter, "Segoe UI", sans-serif' } : undefined}
          />
          <View className="flex-row gap-2">
            <Button label={pending ? 'Salvando...' : 'Salvar'} disabled={pending} onPress={() => void saveName()} />
            <Button
              label="Cancelar"
              tone="quiet"
              onPress={() => {
                setEditingName(false)
                setNameDraft(project.name)
              }}
            />
          </View>
        </View>
      ) : (
        <View className="flex-row items-center gap-3">
          <Title>{project.name}</Title>
          {admin ? (
            <Pressable
              accessibilityLabel="Editar nome"
              onPress={() => {
                setNameDraft(project.name)
                setEditingName(true)
              }}
              className="h-9 w-9 items-center justify-center rounded-lg border border-line bg-paper"
              style={surfaceStyle}
            >
              <IconPencil />
            </Pressable>
          ) : null}
        </View>
      )}
      {error ? <Banner message={error} /> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row items-start py-3">
          <Pressable
            accessibilityLabel="Escopo do projeto"
            accessibilityState={{ selected: scopeSelected }}
            onPress={() => setSelection(SCOPE_PANEL)}
            className="w-36 items-center px-1"
          >
            <View className="h-6 w-full items-center justify-center">
              {stopCount > 1 ? <View className="absolute h-0.5 bg-wait" style={connectorStyle(0, stopCount) ?? undefined} /> : null}
              <View className={`z-10 rounded-full border-2 border-ink ${scopeSelected ? 'h-5 w-5 bg-ink' : 'h-3.5 w-3.5 bg-paper'}`} />
            </View>
            <Text className={`mt-2 text-center text-sm ${scopeSelected ? 'font-bold text-brand' : 'text-ink'}`}>Escopo do projeto</Text>
          </Pressable>
          {project.stages.map((stage, index) => {
            const active = stage.id === selected?.id
            const line = connectorStyle(index + 1, stopCount)
            return (
              <Pressable
                key={stage.id}
                accessibilityLabel={`${stage.name}: ${colorLabel(stage.color)}`}
                onPress={() => setSelection({ kind: 'stage', id: stage.id })}
                className="w-36 items-center px-1"
              >
                <View className="h-6 w-full items-center justify-center">
                  {line ? <View className="absolute h-0.5 bg-wait" style={line} /> : null}
                  <View className={`z-10 rounded-full border-2 border-paper ${dotClass[stage.color]} ${active ? 'h-5 w-5' : 'h-3.5 w-3.5'}`} />
                </View>
                <Text className={`mt-2 text-center text-sm ${active ? 'font-bold text-brand' : 'text-ink'}`}>{stage.name}</Text>
                <Text className="text-center text-xs text-muted">{durationLabel(stage.durationDays)}</Text>
                {admin && stage.unassigned ? <Text className="text-center text-xs text-danger">sem alocação</Text> : null}
              </Pressable>
            )
          })}
        </View>
      </ScrollView>
      {scopeSelected ? null : (
        <GanttChart stages={project.stages} selectedStageId={selected?.id ?? null} calendar={calendar} />
      )}
      {scopeSelected ? (
        <View className="gap-4">
          <View className={stackedScope ? 'gap-4' : 'flex-row items-start gap-4'}>
            <View className={stackedScope ? 'z-20' : 'z-20 min-w-0 flex-1'}>
              {admin && !project.archived ? (
                <Card>
                  <DescriptionField value={project.description} onCommit={saveDescription} />
                  <CatalogField
                    label="Cliente"
                    placeholder="Escolher cliente"
                    searchPlaceholder="Buscar cliente"
                    emptyLabel="Sem cliente"
                    emptyMessage="Nenhum cliente encontrado."
                    selectedId={project.clientId}
                    options={clients}
                    onCommit={saveClient}
                  />
                  <CatalogField
                    label="Fornecedor"
                    placeholder="Escolher fornecedor"
                    searchPlaceholder="Buscar fornecedor"
                    emptyLabel="Sem fornecedor"
                    emptyMessage="Nenhum fornecedor encontrado."
                    selectedId={project.supplierId}
                    options={suppliers}
                    onCommit={saveSupplier}
                  />
                </Card>
              ) : (
                <Card>
                  <FieldLabel>Descrição</FieldLabel>
                  <BodyText>{project.description || '—'}</BodyText>
                  <FieldLabel>Cliente</FieldLabel>
                  <BodyText>{project.clientName || '—'}</BodyText>
                  <FieldLabel>Fornecedor</FieldLabel>
                  <BodyText>{project.supplierName || '—'}</BodyText>
                </Card>
              )}
            </View>
            <View className={stackedScope ? '' : 'min-w-0 flex-1'}>
              <ScopeEditor
                scope={project.scope ?? []}
                admin={admin && !project.archived}
                onChange={(lines) => {
                  const same = lines.length === project.scope.length
                    && lines.every((line, index) => line.serviceId === project.scope[index]?.serviceId && line.quantity === project.scope[index]?.quantity && line.allocationDays === project.scope[index]?.allocationDays)
                  if (same) return
                  void run(() => api.updateProject(project.id, { scope: lines }))
                }}
              />
            </View>
          </View>
          {admin && !project.archived ? (
            <View className="flex-row justify-end">
              <Button
                label="Arquivar projeto"
                tone="danger"
                size="sm"
                onPress={() => {
                  setArchivePassword('')
                  setArchiveError('')
                  setArchiveOpen(true)
                }}
              />
            </View>
          ) : null}
        </View>
      ) : selected ? (
        <TaskTable
          projectId={project.id}
          stage={selected}
          stages={project.stages}
          admin={admin}
          userId={user?.id ?? null}
          people={professionals}
          pending={pending}
          onRun={run}
          onConfirm={setConfirm}
        />
      ) : null}
      {user ? <Muted>Você está como {roleLabel(user.role)}.</Muted> : null}
      {confirm ? (
        <Confirm
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onCancel={() => {
            confirm.onCancel?.()
            setConfirm(null)
          }}
          onConfirm={() => {
            const current = confirm
            setConfirm(null)
            void run(current.run)
          }}
        />
      ) : null}
      {archiveOpen ? (
        <Modal transparent animationType="fade" onRequestClose={() => setArchiveOpen(false)}>
          <View className="flex-1 items-center justify-center bg-ink/50 p-5">
            <View style={surfaceStyle} className="w-full max-w-md gap-4 rounded-xl border border-line bg-paper p-5">
              <Text className="text-lg font-semibold tracking-tight text-ink">Arquivar projeto</Text>
              <Muted>Digite sua senha para arquivar. O projeto sai das listas e o histórico permanece.</Muted>
              <Field label="Senha" value={archivePassword} onChangeText={setArchivePassword} secureTextEntry />
              {archiveError ? <Banner message={archiveError} /> : null}
              <View className="flex-row justify-end gap-2">
                <Button
                  label="Cancelar"
                  tone="quiet"
                  onPress={() => {
                    setArchiveOpen(false)
                    setArchivePassword('')
                    setArchiveError('')
                  }}
                />
                <Button
                  label={archivePending ? 'Arquivando...' : 'Arquivar'}
                  tone="danger"
                  disabled={archivePending || archivePassword.length === 0}
                  onPress={() => void submitArchive()}
                />
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </Screen>
  )
}

const GANTT_LABEL_W = 220
const GANTT_DAY_W = 36
const GANTT_ROW_H = 36
const GANTT_HEAD_H = 44

function GanttChart({
  stages,
  selectedStageId,
  calendar,
}: {
  stages: readonly StageDetail[]
  selectedStageId: string | null
  calendar: WorkCalendar
}) {
  const [cardOpen, setCardOpen] = useState(false)
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
  const scrollRef = useRef<ScrollView>(null)
  const today = saoPauloToday()

  useEffect(() => {
    if (!selectedStageId) return
    setClosed((current) => {
      if (!current.has(selectedStageId)) return current
      const next = new Set(current)
      next.delete(selectedStageId)
      return next
    })
  }, [selectedStageId])

  function stageExpanded(stageId: string): boolean {
    if (closed.has(stageId)) return false
    return stageId === selectedStageId || opened.has(stageId)
  }

  function toggleStage(stageId: string): void {
    if (stageExpanded(stageId)) {
      setOpened((current) => {
        if (!current.has(stageId)) return current
        const next = new Set(current)
        next.delete(stageId)
        return next
      })
      setClosed((current) => new Set(current).add(stageId))
      return
    }
    setClosed((current) => {
      if (!current.has(stageId)) return current
      const next = new Set(current)
      next.delete(stageId)
      return next
    })
    setOpened((current) => new Set(current).add(stageId))
  }

  const dated = stages.flatMap((stage) => stage.subtasks).filter(
    (task): task is Subtask & { startDate: string; endDate: string } => Boolean(task.startDate && task.endDate),
  )
  const rows: { key: string; kind: 'stage' | 'empty' | 'task'; label: string; stageId: string; task?: Subtask }[] = []
  for (const stage of stages) {
    rows.push({ key: `stage-${stage.id}`, kind: 'stage', label: stage.name, stageId: stage.id })
    if (!stageExpanded(stage.id)) continue
    if (stage.subtasks.length === 0) {
      rows.push({ key: `empty-${stage.id}`, kind: 'empty', label: 'Nenhuma tarefa.', stageId: stage.id })
    } else {
      for (const task of stage.subtasks) rows.push({ key: task.id, kind: 'task', label: task.name, stageId: stage.id, task })
    }
  }
  let scaleStart = ''
  let days: string[] = []
  if (dated.length > 0) {
    scaleStart = dated.reduce((min, task) => (task.startDate < min ? task.startDate : min), dated[0].startDate)
    let scaleEnd = dated.reduce((max, task) => (task.endDate > max ? task.endDate : max), dated[0].endDate)
    scaleStart = isoAddDays(scaleStart, -1)
    scaleEnd = isoAddDays(scaleEnd, 1)
    const count = daySpan(scaleStart, scaleEnd)
    days = Array.from({ length: count + 1 }, (_, index) => isoAddDays(scaleStart, index))
  }
  const chartWidth = days.length * GANTT_DAY_W
  const chartHeight = GANTT_HEAD_H + rows.length * GANTT_ROW_H
  const scrollX = todayScrollOffset(days, today)
  const todayIndex = days.indexOf(today)
  const taskRowIndex = new Map<string, number>()
  rows.forEach((row, index) => {
    if (row.task) taskRowIndex.set(row.task.id, index)
  })
  const stageByTask = new Map(stages.flatMap((stage) => stage.subtasks.map((task) => [task.id, stage] as const)))
  const links = dated.flatMap((task) => {
    if (!task.predecessorId) return []
    const from = taskRowIndex.get(task.predecessorId)
    const to = taskRowIndex.get(task.id)
    const predecessor = dated.find((item) => item.id === task.predecessorId)
    if (from === undefined || to === undefined || !predecessor) return []
    const x1 = daySpan(scaleStart, predecessor.endDate) * GANTT_DAY_W
    const x2 = daySpan(scaleStart, task.startDate) * GANTT_DAY_W
    if (x2 < x1) return []
    return [{
      key: `${predecessor.id}-${task.id}`,
      x1,
      x2,
      y1: from * GANTT_ROW_H + GANTT_ROW_H / 2,
      y2: to * GANTT_ROW_H + GANTT_ROW_H / 2,
    }]
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ x: scrollX, animated: false })
  }, [scrollX, cardOpen])

  return (
    <Panel>
      <Pressable
        accessibilityLabel="Gantt"
        accessibilityState={{ expanded: cardOpen }}
        onPress={() => setCardOpen((current) => !current)}
        className="flex-row items-center justify-between"
      >
        <SectionLabel>Gantt</SectionLabel>
        <Chevron open={cardOpen} />
      </Pressable>
      <View style={cardOpen ? undefined : { height: 0, overflow: 'hidden' }}>
        <View className="flex-row">
          <View style={{ width: GANTT_LABEL_W }}>
            <View style={{ height: GANTT_HEAD_H }} className="justify-end border-b border-line px-2 pb-1">
              <TableHeaderText>Etapa / tarefa</TableHeaderText>
            </View>
            {rows.map((row) => (
              <Pressable
                key={row.key}
                disabled={row.kind !== 'stage'}
                onPress={() => toggleStage(row.stageId)}
                style={{ height: GANTT_ROW_H }}
                className={`flex-row items-center border-b border-line px-2 ${row.kind === 'stage' ? 'bg-canvas' : ''}`}
              >
                {row.kind === 'stage' ? <Chevron open={stageExpanded(row.stageId)} /> : null}
                <Text
                  numberOfLines={1}
                  className={row.kind === 'stage' ? 'ml-2 flex-1 text-sm font-bold text-ink' : row.kind === 'empty' ? 'pl-3 text-sm text-muted' : 'pl-3 text-sm text-ink'}
                >
                  {row.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {days.length === 0 ? (
            <View className="flex-1 justify-center px-3">
              <Empty compact>Nenhuma tarefa com data.</Empty>
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              horizontal
              showsHorizontalScrollIndicator
              className="min-w-0 flex-1"
              contentOffset={{ x: scrollX, y: 0 }}
            >
              <View style={{ width: chartWidth, height: chartHeight }}>
                {days.map((day, index) => (
                  isNonWorking(day, calendar) ? (
                    <View
                      key={`off-${day}`}
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        left: index * GANTT_DAY_W,
                        top: 0,
                        width: GANTT_DAY_W,
                        height: chartHeight,
                        backgroundColor: 'rgba(94, 106, 120, 0.16)',
                      }}
                    />
                  ) : null
                ))}
                {todayIndex >= 0 ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: todayIndex * GANTT_DAY_W,
                      top: 0,
                      width: GANTT_DAY_W,
                      height: chartHeight,
                      backgroundColor: 'rgba(155, 58, 58, 0.15)',
                    }}
                  />
                ) : null}
                <View style={{ height: GANTT_HEAD_H }} className="flex-row border-b border-line">
                  {days.map((day) => (
                    <View key={day} style={{ width: GANTT_DAY_W }} className="items-center justify-end pb-1">
                      <Text className="text-[10px] text-muted">{shortDate(day)}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ height: rows.length * GANTT_ROW_H, position: 'relative' }}>
                  {rows.map((row) => {
                    const stage = row.task ? stageByTask.get(row.task.id) : undefined
                    return (
                      <View
                        key={row.key}
                        style={{ height: GANTT_ROW_H }}
                        className="justify-center border-b border-line"
                      >
                        {row.task && stage && row.task.startDate && row.task.endDate ? (
                          <View
                            accessibilityLabel={`${row.task.name}: ${formatDate(row.task.startDate)} a ${formatDate(row.task.endDate)}`}
                            style={{
                              marginLeft: daySpan(scaleStart, row.task.startDate) * GANTT_DAY_W,
                              width: Math.max(daySpan(row.task.startDate, row.task.endDate) * GANTT_DAY_W, 8),
                              height: 14,
                              borderRadius: 4,
                              backgroundColor: taskBarColor(row.task, stage, today),
                            }}
                          />
                        ) : null}
                      </View>
                    )
                  })}
                  {links.map((link) => (
                    <DependencyArrow key={link.key} x1={link.x1} y1={link.y1} x2={link.x2} y2={link.y2} />
                  ))}
                </View>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Panel>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <View
      style={{
        width: 8,
        height: 8,
        borderRightWidth: 2,
        borderBottomWidth: 2,
        borderColor: '#1c2430',
        transform: [{ rotate: open ? '45deg' : '-45deg' }],
        marginTop: open ? -3 : 0,
      }}
    />
  )
}

function DependencyArrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const elbow = Math.min(x1 + 12, x2)
  const color = '#1d4e89'
  return (
    <>
      <View pointerEvents="none" style={{ position: 'absolute', left: x1, top: y1 - 1, width: Math.max(elbow - x1, 0), height: 2, backgroundColor: color }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: elbow - 1, top: Math.min(y1, y2), width: 2, height: Math.max(Math.abs(y2 - y1), 2), backgroundColor: color }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: elbow, top: y2 - 1, width: Math.max(x2 - elbow, 0), height: 2, backgroundColor: color }} />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: Math.max(x2 - 6, 0),
          top: y2 - 4,
          width: 0,
          height: 0,
          borderTopWidth: 4,
          borderBottomWidth: 4,
          borderLeftWidth: 6,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderLeftColor: color,
        }}
      />
    </>
  )
}

function TaskTable({
  projectId,
  stage,
  stages,
  admin,
  userId,
  people,
  pending,
  onRun,
  onConfirm,
}: {
  projectId: string
  stage: StageDetail
  stages: StageDetail[]
  admin: boolean
  userId: string | null
  people: ProfessionalOption[]
  pending: boolean
  onRun: (action: () => Promise<{ project: ProjectDetail } | void>) => Promise<ProjectDetail | null>
  onConfirm: (value: {
    title: string
    message: string
    confirmLabel: string
    run: () => Promise<{ project: ProjectDetail } | void>
    onCancel?: () => void
  } | null) => void
}) {
  const [drafts, setDrafts] = useState<DraftTask[]>([])
  const savingDraft = useRef(new Set<string>())

  useEffect(() => {
    setDrafts([])
  }, [stage.id])

  function saveAllocation(task: Subtask, allocation: AllocationInput, personName: string): void {
    const persist = () => api.updateSubtask(projectId, stage.id, task.id, {
      allocation,
      durationDays: allocation.durationDays,
      ...(task.predecessorId ? {} : { startDate: allocation.startDate }),
    })
    const already = stage.operators.some((operator) => operator.id === allocationPersonId(allocation))
    if (stage.color === 'green' && !already) {
      onConfirm({
        title: 'Reabrir etapa',
        message: `Incluir ${personName} deixa a bolinha amarela até essa pessoa concluir.`,
        confirmLabel: 'Incluir',
        run: persist,
      })
      return
    }
    void onRun(persist)
  }

  async function persistDraft(draft: DraftTask): Promise<void> {
    const name = draft.name.trim()
    if (!name || savingDraft.current.has(draft.key)) return
    savingDraft.current.add(draft.key)
    const allocation = allocationFrom(draft.userId, draft.kind, draft.startDate, draft.duration)
    const durationDays = wholeDays(draft.duration)
    const known = new Set(stage.subtasks.map((task) => task.id))
    const create = () => api.createSubtask(projectId, stage.id, { name, ...(durationDays ? { durationDays } : {}) })
    const created = await onRun(create)
    savingDraft.current.delete(draft.key)
    if (!created) return
    setDrafts((current) => current.filter((item) => item.key !== draft.key))
    if (!allocation) return
    const added = created.stages.find((item) => item.id === stage.id)?.subtasks.find((task) => !known.has(task.id))
    if (!added) return
    saveAllocation(added, allocation, draft.personName)
  }

  return (
    <Panel>
      <SectionLabel>Tarefas</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="w-full max-w-full" contentContainerClassName="min-w-full grow">
        <View className="w-full min-w-[1100px] overflow-visible">
          <View className="w-full flex-row items-center border-b border-line px-2 py-2">
            <TableHeaderText className="w-16">Feita</TableHeaderText>
            <TableHeaderText className="min-w-44 flex-1">Tarefa</TableHeaderText>
            <TableHeaderText className="w-44">profissional</TableHeaderText>
            <TableHeaderText className="w-44">início da alocação</TableHeaderText>
            <TableHeaderText className="w-28">Tempo (dias)</TableHeaderText>
            <TableHeaderText className="w-32">Fim</TableHeaderText>
            <TableHeaderText className="w-44">Predecessora</TableHeaderText>
            {admin ? <View className="w-12" /> : null}
          </View>
          {stage.subtasks.length === 0 && drafts.length === 0 ? (
            <View className="px-2 py-3">
              <Empty compact>Nenhuma tarefa.</Empty>
            </View>
          ) : null}
          {stage.subtasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              admin={admin}
              canToggle={admin || (task.assignee?.kind === 'user' && task.assignee.id === userId)}
              people={people}
              pending={pending}
              onToggle={() => void onRun(() => api.updateSubtask(projectId, stage.id, task.id, { done: !task.done }))}
              onRename={(name) => onRun(() => api.updateSubtask(projectId, stage.id, task.id, { name }))}
              onAllocate={(allocation, personName) => saveAllocation(task, allocation, personName)}
              onDuration={(durationDays) => void onRun(() => api.updateSubtask(projectId, stage.id, task.id, { durationDays }))}
              onPredecessor={(predecessorId) => void onRun(() => api.updateSubtask(projectId, stage.id, task.id, {
                predecessorId,
                ...(predecessorId === null ? { startDate: task.startDate } : {}),
              }))}
              options={predecessorOptions(stages, stage, task.id)}
              onDelete={() => void onRun(() => api.deleteSubtask(projectId, stage.id, task.id))}
            />
          ))}
          {drafts.map((draft) => (
            <DraftRow
              key={draft.key}
              draft={draft}
              people={people}
              onChange={(patch) => setDrafts((current) => current.map((item) => item.key === draft.key ? { ...item, ...patch } : item))}
              onBlurName={() => void persistDraft(draft)}
              onRemove={() => setDrafts((current) => current.filter((item) => item.key !== draft.key))}
            />
          ))}
        </View>
      </ScrollView>
      {admin ? (
        <Button
          label="Adicionar tarefa"
          tone="quiet"
          onPress={() => setDrafts((current) => [...current, {
            key: `draft-${Date.now()}`,
            name: '',
            userId: '',
            kind: null,
            personName: '',
            startDate: '',
            duration: '',
            open: false,
          }])}
        />
      ) : null}
    </Panel>
  )
}

function TaskRow({
  task,
  admin,
  canToggle,
  people,
  pending,
  onToggle,
  onRename,
  onAllocate,
  onDuration,
  onPredecessor,
  options,
  onDelete,
}: {
  task: Subtask
  admin: boolean
  canToggle: boolean
  people: ProfessionalOption[]
  pending: boolean
  options: PredecessorOption[]
  onToggle: () => void
  onRename: (name: string) => Promise<ProjectDetail | null>
  onAllocate: (allocation: AllocationInput, personName: string) => void
  onDuration: (durationDays: number) => void
  onPredecessor: (predecessorId: string | null) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(task.name)
  const [userId, setUserId] = useState(task.assignee?.id ?? '')
  const [kind, setKind] = useState<ProfessionalKind | null>(task.assignee?.kind ?? null)
  const [personName, setPersonName] = useState(task.assignee?.name ?? '')
  const [startDate, setStartDate] = useState(task.assignee?.startDate ?? '')
  const [duration, setDuration] = useState(tempoOf(task))
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setName(task.name)
    setUserId(task.assignee?.id ?? '')
    setKind(task.assignee?.kind ?? null)
    setPersonName(task.assignee?.name ?? '')
    setStartDate(task.predecessorId ? (task.startDate ?? '') : (task.assignee?.startDate ?? task.startDate ?? ''))
    setDuration(tempoOf(task))
    setOpen(false)
  }, [task.id, task.name, task.done, task.predecessorId, task.startDate, task.endDate, task.durationDays, task.assignee?.id, task.assignee?.kind, task.assignee?.name, task.assignee?.startDate, task.assignee?.durationDays])

  function commitAllocation(next: { userId?: string; kind?: ProfessionalKind | null; personName?: string; startDate?: string; duration?: string }): void {
    const merged = {
      userId: next.userId ?? userId,
      kind: next.kind === undefined ? kind : next.kind,
      personName: next.personName ?? personName,
      startDate: task.predecessorId ? (task.startDate ?? '') : (next.startDate ?? startDate),
      duration: next.duration ?? duration,
    }
    const allocation = allocationFrom(merged.userId, merged.kind, merged.startDate, merged.duration)
    if (!allocation) return
    const samePerson = task.assignee?.kind === 'supplier'
      ? task.assignee.id === allocation.supplierId
      : task.assignee?.kind === 'user' && task.assignee.id === allocation.userId
    if (
      samePerson
      && task.assignee
      && task.assignee.startDate === allocation.startDate
      && task.assignee.durationDays === allocation.durationDays
    ) return
    onAllocate(allocation, merged.personName)
  }

  const labelAssignee = personName && kind
    ? {
        kind,
        active: task.assignee?.kind === kind && task.assignee.id === userId ? task.assignee.active : true,
        deleted: task.assignee?.kind === kind && task.assignee.id === userId ? task.assignee.deleted : false,
      }
    : null

  const shownStart = (task.predecessorId ? task.startDate : startDate) ?? ''

  return (
    <View className="w-full flex-row items-start border-b border-line px-2 py-3 hover:bg-canvas">
      <View className="w-16 pt-2">
        <DoneBox checked={task.done} disabled={!canToggle || pending} onPress={onToggle} />
      </View>
      <View className="min-w-44 flex-1 pr-2">
        {admin ? (
          <TextInput
            value={name}
            onChangeText={setName}
            onBlur={() => {
              const next = name.trim()
              if (!next || next === task.name) {
                setName(task.name)
                return
              }
              void onRename(next)
            }}
            autoCapitalize="none"
            className="rounded-lg border border-line px-3 py-2 text-ink"
          />
        ) : (
          <Text className="py-2 text-ink">{task.name}</Text>
        )}
      </View>
      <View className="relative z-20 w-44 pr-2">
        {admin ? (
          <>
            <Pressable onPress={() => setOpen((current) => !current)} className="rounded-lg border border-line px-3 py-2">
              <Text className={profissionalLabel(personName, labelAssignee) ? 'text-ink' : 'text-muted'}>
                {profissionalLabel(personName, labelAssignee) || 'Escolher profissional'}
              </Text>
            </Pressable>
            {open ? (
              <PersonMenu
                people={people}
                onSelect={(person) => {
                  setUserId(person.id)
                  setKind(person.kind)
                  setPersonName(person.name)
                  setOpen(false)
                  commitAllocation({ userId: person.id, kind: person.kind, personName: person.name })
                }}
              />
            ) : null}
          </>
        ) : (
          <Text className="py-2 text-ink">{profissionalLabel(personName, task.assignee) || '—'}</Text>
        )}
      </View>
      <View className="w-44 pr-2">
        {admin ? (
          <DateField
            value={shownStart}
            disabled={Boolean(task.predecessorId)}
            onChange={(value) => {
              if (task.predecessorId) return
              setStartDate(value)
              commitAllocation({ startDate: value })
            }}
          />
        ) : (
          <Text className="py-2 text-ink">{shownStart ? formatDate(shownStart) : '—'}</Text>
        )}
      </View>
      <View className="w-28 pr-2">
        {admin ? (
          <TextInput
            value={duration}
            onChangeText={setDuration}
            onBlur={() => {
              const days = wholeDays(duration)
              if (!days) {
                setDuration(tempoOf(task))
                return
              }
              if (days === task.durationDays) return
              const allocation = allocationFrom(userId, kind, task.predecessorId ? (task.startDate ?? '') : startDate, String(days))
              if (allocation) {
                commitAllocation({ duration: String(days) })
                return
              }
              onDuration(days)
            }}
            placeholder="Dias"
            placeholderTextColor={mutedColor}
            autoCapitalize="none"
            className="rounded-lg border border-line px-3 py-2 text-ink"
          />
        ) : (
          <Text className="py-2 text-ink">{duration || '—'}</Text>
        )}
      </View>
      <View className="w-32 pr-2">
        <Text className="py-2 text-ink">{task.endDate ? formatDate(task.endDate) : '—'}</Text>
      </View>
      <View className="relative z-10 w-44 pr-2">
        <PredecessorField
          admin={admin}
          task={task}
          options={options}
          disabled={pending}
          onChange={onPredecessor}
        />
      </View>
      {admin ? (
        <View className="w-12 items-end">
          <TrashButton label="Excluir tarefa" disabled={pending} onPress={onDelete} />
        </View>
      ) : null}
    </View>
  )
}

function DraftRow({
  draft,
  people,
  onChange,
  onBlurName,
  onRemove,
}: {
  draft: DraftTask
  people: ProfessionalOption[]
  onChange: (patch: Partial<DraftTask>) => void
  onBlurName: () => void
  onRemove: () => void
}) {
  return (
    <View className="w-full flex-row items-start border-b border-line px-2 py-3 hover:bg-canvas">
      <View className="w-16 pt-2">
        <DoneBox checked={false} disabled onPress={() => undefined} />
      </View>
      <View className="min-w-44 flex-1 pr-2">
        <TextInput
          value={draft.name}
          onChangeText={(name) => onChange({ name })}
          onBlur={onBlurName}
          placeholder="Nome da tarefa"
          placeholderTextColor={mutedColor}
          autoCapitalize="none"
          className="rounded-lg border border-line px-3 py-2 text-ink"
        />
      </View>
      <View className="relative z-20 w-44 pr-2">
        <Pressable onPress={() => onChange({ open: !draft.open })} className="rounded-lg border border-line px-3 py-2">
          <Text className={draft.personName ? 'text-ink' : 'text-muted'}>
            {draft.personName ? profissionalLabel(draft.personName, draft.kind ? { active: true, deleted: false, kind: draft.kind } : null) : 'Escolher profissional'}
          </Text>
        </Pressable>
        {draft.open ? (
          <PersonMenu
            people={people}
            onSelect={(person) => onChange({ userId: person.id, kind: person.kind, personName: person.name, open: false })}
          />
        ) : null}
      </View>
      <View className="w-44 pr-2">
        <DateField value={draft.startDate} onChange={(startDate) => onChange({ startDate })} />
      </View>
      <View className="w-28 pr-2">
        <TextInput
          value={draft.duration}
          onChangeText={(duration) => onChange({ duration })}
          placeholder="Dias"
          placeholderTextColor={mutedColor}
          autoCapitalize="none"
          className="rounded-lg border border-line px-3 py-2 text-ink"
        />
      </View>
      <View className="w-32 pr-2">
        <Text className="py-2 text-muted">—</Text>
      </View>
      <View className="w-44 pr-2">
        <Text className="py-2 text-muted">Nenhuma</Text>
      </View>
      <View className="w-12 items-end">
        <TrashButton label="Excluir tarefa" onPress={onRemove} />
      </View>
    </View>
  )
}

function PredecessorField({
  admin,
  task,
  options,
  disabled,
  onChange,
}: {
  admin: boolean
  task: Subtask
  options: PredecessorOption[]
  disabled: boolean
  onChange: (predecessorId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const current = options.find((item) => item.id === task.predecessorId)
  const label = current?.label ?? 'Nenhuma'
  if (!admin) return <Text className="py-2 text-ink">{label}</Text>
  return (
    <>
      <Pressable disabled={disabled} onPress={() => setOpen((value) => !value)} className="rounded-lg border border-line px-3 py-2">
        <Text className={current ? 'text-ink' : 'text-muted'}>{label}</Text>
      </Pressable>
      {open ? (
        <View className="mt-2 gap-1 rounded-xl border border-line bg-canvas p-2">
          <Pressable
            onPress={() => {
              setOpen(false)
              if (task.predecessorId) onChange(null)
            }}
            className="rounded-lg px-2 py-2"
          >
            <Text className="text-ink">Nenhuma</Text>
          </Pressable>
          {options.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => {
                setOpen(false)
                if (item.id !== task.predecessorId) onChange(item.id)
              }}
              className="rounded-lg px-2 py-2"
            >
              <Text className="text-ink">{item.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </>
  )
}

function DoneBox({ checked, disabled, onPress }: { checked: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityLabel="Feita" accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onPress}>
      <View className={`h-5 w-5 items-center justify-center rounded border ${checked ? 'border-brand bg-brand' : 'border-line bg-paper'} ${disabled ? 'opacity-40' : ''}`}>
        {checked ? <Text className="text-xs font-bold text-white">✓</Text> : null}
      </View>
    </Pressable>
  )
}

function PersonMenu({
  people,
  onSelect,
}: {
  people: ProfessionalOption[]
  onSelect: (person: ProfessionalOption) => void
}) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLocaleLowerCase('pt-BR')
  const filtered = people.filter((person) => person.name.toLocaleLowerCase('pt-BR').includes(needle))
  return (
    <View className="mt-2 gap-2 rounded-xl border border-line bg-canvas p-2">
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar por nome"
        placeholderTextColor={mutedColor}
        autoCapitalize="none"
        className="rounded-lg border border-line bg-paper px-3 py-2 text-ink"
      />
      {filtered.length === 0 ? <Muted>Nenhum profissional disponível.</Muted> : null}
      {filtered.map((person) => (
        <Pressable key={`${person.kind}:${person.id}`} onPress={() => onSelect(person)} className="rounded-lg px-2 py-2">
          <Text className="text-ink">{person.kind === 'supplier' ? `${person.name} (fornecedor)` : person.name}</Text>
        </Pressable>
      ))}
    </View>
  )
}
