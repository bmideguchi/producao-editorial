import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { ApiError, api } from '../api'
import { go } from '../nav'
import type { Template } from '../types'
import { Banner, Button, Card, Confirm, Empty, Field, FormColumn, LinkText, Loading, Muted, PageHeader, Screen, SectionLabel, SelectField } from '../ui'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type DraftTask = { key: string; name: string; duration: string; predecessorKey: string }
type DraftStage = { key: string; name: string; tasks: DraftTask[] }

function draftId(): string {
  const generator = globalThis.crypto?.randomUUID
  if (generator) return generator.call(globalThis.crypto)
  return `new-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function stageLabel(stage: DraftStage, index: number): string {
  return stage.name.trim() || `Etapa ${index + 1}`
}

function dependencyOptions(stages: readonly DraftStage[], stageIndex: number, task: DraftTask) {
  const options = [{ value: '', label: 'Nenhuma' }]
  const indexes = stageIndex > 0 ? [stageIndex - 1, stageIndex] : [stageIndex]
  for (const index of indexes) {
    const stage = stages[index]
    for (const item of stage.tasks) {
      if (item.key === task.key) continue
      options.push({
        value: item.key,
        label: `${stageLabel(stage, index)} · ${item.name.trim() || 'Sem nome'}`,
      })
    }
  }
  if (task.predecessorKey && !options.some((option) => option.value === task.predecessorKey)) {
    for (let index = 0; index < stages.length; index += 1) {
      const found = stages[index].tasks.find((item) => item.key === task.predecessorKey)
      if (!found) continue
      options.push({
        value: found.key,
        label: `${stageLabel(stages[index], index)} · ${found.name.trim() || 'Sem nome'}`,
      })
    }
  }
  return options
}

export function TemplateListScreen() {
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.templates()
      .then((result) => setTemplates(result.templates))
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : 'Não foi possível carregar os templates.'))
  }, [])

  if (!templates && !error) return <Loading />
  const active = templates?.filter((template) => !template.archived) ?? []
  const archived = templates?.filter((template) => template.archived) ?? []

  return (
    <Screen>
      <PageHeader title="Templates">
        <Button label="Novo template" onPress={() => go('/templates/novo')} />
      </PageHeader>
      {error ? <Banner message={error} /> : null}
      {active.length === 0 ? <Empty>Nenhum template ativo.</Empty> : null}
      {active.map((template) => (
        <TemplateRow key={template.id} template={template} />
      ))}
      {archived.length > 0 ? <SectionLabel>Arquivados</SectionLabel> : null}
      {archived.map((template) => (
        <TemplateRow key={template.id} template={template} />
      ))}
    </Screen>
  )
}

function TemplateRow({ template }: { template: Template }) {
  return (
    <Card>
      <LinkText label={template.name} onPress={() => go(`/templates/${template.id}`)} />
      <Muted>{template.stages.map((stage) => stage.name).join(' → ') || 'Sem etapas'}</Muted>
    </Card>
  )
}

export function TemplateFormScreen({ id }: { id: string | null }) {
  const [name, setName] = useState('')
  const [stages, setStages] = useState<DraftStage[]>([{ key: 'new-1', name: '', tasks: [] }])
  const [archived, setArchived] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [loaded, setLoaded] = useState(id === null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!id) return
    api.templates()
      .then((result) => {
        const template = result.templates.find((item) => item.id === id)
        if (!template) {
          setError('Template não encontrado.')
          return
        }
        setName(template.name)
        setArchived(template.archived)
        setStages(template.stages.map((stage) => ({
          key: stage.id,
          name: stage.name,
          tasks: (stage.tasks ?? []).map((task) => ({
            key: task.id,
            name: task.name,
            duration: String(task.durationDays),
            predecessorKey: task.predecessorId ?? '',
          })),
        })))
      })
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : 'Não foi possível carregar o template.'))
      .finally(() => setLoaded(true))
  }, [id])

  function updateStage(key: string, stageName: string): void {
    setStages((current) => current.map((stage) => (stage.key === key ? { ...stage, name: stageName } : stage)))
  }

  function move(index: number, direction: -1 | 1): void {
    setStages((current) => {
      const next = [...current]
      const target = index + direction
      if (target < 0 || target >= next.length) return current
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  function updateTask(stageKey: string, taskKey: string, patch: Partial<DraftTask>): void {
    setStages((current) => current.map((stage) => (
      stage.key === stageKey
        ? { ...stage, tasks: stage.tasks.map((task) => (task.key === taskKey ? { ...task, ...patch } : task)) }
        : stage
    )))
  }

  function removeTask(taskKey: string): void {
    setStages((current) => current.map((stage) => ({
      ...stage,
      tasks: stage.tasks
        .filter((task) => task.key !== taskKey)
        .map((task) => (task.predecessorKey === taskKey ? { ...task, predecessorKey: '' } : task)),
    })))
  }

  async function save(): Promise<void> {
    setPending(true)
    setError('')
    const body = {
      name,
      stages: stages.map((stage) => ({
        ...(uuid.test(stage.key) ? { id: stage.key } : {}),
        name: stage.name,
        tasks: stage.tasks.map((task) => {
          const durationDays = Number(task.duration)
          return {
            ...(uuid.test(task.key) ? { id: task.key } : {}),
            name: task.name,
            durationDays,
            predecessorId: task.predecessorKey || null,
          }
        }),
      })),
    }
    const invalid = body.stages.some((stage) => stage.tasks.some((task) => !Number.isInteger(task.durationDays) || task.durationDays <= 0))
    if (invalid) {
      setError('A duração precisa ser um número inteiro de dias maior que zero.')
      setPending(false)
      return
    }
    try {
      if (id) await api.updateTemplate(id, body)
      else await api.createTemplate(body)
      go('/templates')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível salvar o template.')
    } finally {
      setPending(false)
    }
  }

  if (!loaded) return <Loading />

  return (
    <Screen>
      <PageHeader title={id ? 'Editar template' : 'Novo template'} />
      <FormColumn>
      <Muted>
        Salvar atualiza as etapas dos projetos que usam este template. As tarefas de cada etapa são copiadas quando um projeto é criado; alterá-las depois não reescreve as tarefas que o projeto já tem.
      </Muted>
      {archived ? <Banner message="Este template está arquivado e não aparece na criação de projeto." /> : null}
      {error ? <Banner message={error} /> : null}
      <Field label="Nome" value={name} onChangeText={setName} />
      {stages.map((stage, index) => (
        <Card key={stage.key}>
          <Field label={`Etapa ${index + 1}`} value={stage.name} onChangeText={(value) => updateStage(stage.key, value)} />
          <View className="flex-row flex-wrap gap-2">
            <Button label="Subir" tone="quiet" onPress={() => move(index, -1)} />
            <Button label="Descer" tone="quiet" onPress={() => move(index, 1)} />
            <Button
              label="Remover"
              tone="quiet"
              onPress={() => setStages((current) => {
                const removed = current.find((item) => item.key === stage.key)
                const gone = new Set(removed?.tasks.map((task) => task.key) ?? [])
                return current
                  .filter((item) => item.key !== stage.key)
                  .map((item) => ({
                    ...item,
                    tasks: item.tasks.map((task) => (
                      gone.has(task.predecessorKey) ? { ...task, predecessorKey: '' } : task
                    )),
                  }))
              })}
            />
          </View>
          <SectionLabel>Tarefas</SectionLabel>
          {stage.tasks.map((task) => (
            <View key={task.key} className="gap-2 rounded-xl border border-line p-3">
              <Field
                label="Nome"
                value={task.name}
                onChangeText={(value) => updateTask(stage.key, task.key, { name: value })}
              />
              <Field
                label="Tempo (dias)"
                value={task.duration}
                onChangeText={(value) => updateTask(stage.key, task.key, { duration: value })}
              />
              <SelectField
                label="Predecessora"
                value={task.predecessorKey}
                options={dependencyOptions(stages, index, task)}
                onValueChange={(value) => updateTask(stage.key, task.key, { predecessorKey: value })}
              />
              <Button label="Remover tarefa" tone="quiet" onPress={() => removeTask(task.key)} />
            </View>
          ))}
          <Button
            label="Adicionar tarefa"
            tone="quiet"
            onPress={() => setStages((current) => current.map((item) => (
              item.key === stage.key
                ? { ...item, tasks: [...item.tasks, { key: draftId(), name: '', duration: '', predecessorKey: '' }] }
                : item
            )))}
          />
        </Card>
      ))}
      <Button
        label="Adicionar etapa"
        tone="quiet"
        onPress={() => setStages((current) => [...current, { key: `new-${Date.now()}`, name: '', tasks: [] }])}
      />
      <Button label={pending ? 'Salvando...' : 'Salvar template'} disabled={pending} onPress={() => void save()} />
      {id && !archived ? (
        <Button
          label="Arquivar"
          tone="quiet"
          onPress={() => void api.archiveTemplate(id).then(() => go('/templates')).catch((caught) => {
            setError(caught instanceof ApiError ? caught.message : 'Não foi possível arquivar.')
          })}
        />
      ) : null}
      {id ? (
        <Button label="Excluir" tone="danger" onPress={() => setConfirmDelete(true)} />
      ) : null}
      {confirmDelete && id ? (
        <Confirm
          title="Excluir template"
          message="Os projetos que usam este template continuam com as etapas e tarefas atuais e seguem editáveis."
          confirmLabel="Excluir"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false)
            void api.deleteTemplate(id).then(() => go('/templates')).catch((caught) => {
              setError(caught instanceof ApiError ? caught.message : 'Não foi possível excluir.')
            })
          }}
        />
      ) : null}
      </FormColumn>
    </Screen>
  )
}
