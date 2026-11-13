import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ApiError, api } from '../api'
import { todayIso } from '../format'
import { go } from '../nav'
import type { ScopeLine, Template } from '../types'
import { ScopeEditor } from './ScopeEditor'
import { Banner, Button, DateField, Empty, Field, FieldLabel, FormColumn, Loading, Muted, PageHeader, Screen } from '../ui'

export function NewProjectScreen() {
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [templateId, setTemplateId] = useState('')
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState(todayIso())
  const [scope, setScope] = useState<ScopeLine[]>([])
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    api.templates()
      .then((result) => {
        const active = result.templates.filter((template) => !template.archived && template.stages.length > 0)
        setTemplates(active)
        setTemplateId(active[0]?.id ?? '')
      })
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : 'Não foi possível carregar os templates.'))
  }, [])

  async function submit(): Promise<void> {
    setPending(true)
    setError('')
    try {
      const result = await api.createProject({
        name,
        startDate,
        templateId,
        scope: scope.map((line) => ({ serviceId: line.serviceId, quantity: line.quantity, allocationDays: line.allocationDays })),
      })
      go(`/projetos/${result.project.id}`)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível criar o projeto.')
    } finally {
      setPending(false)
    }
  }

  if (!templates && !error) return <Loading />
  const selected = templates?.find((template) => template.id === templateId)

  return (
    <Screen>
      <PageHeader title="Novo projeto" />
      <FormColumn>
      <Muted>Escolha um template ativo. As etapas e as tarefas do template nascem neste projeto. O escopo diz quais serviços, e quantos, serão realizados.</Muted>
      {error ? <Banner message={error} /> : null}
      <Field label="Nome" value={name} onChangeText={setName} />
      <View className="gap-1.5">
        <FieldLabel>Data de início</FieldLabel>
        <DateField value={startDate} onChange={setStartDate} />
      </View>
      <View className="gap-2">
        <FieldLabel>Template</FieldLabel>
        {templates?.length === 0 ? <Empty compact>Nenhum template ativo.</Empty> : null}
        {templates?.map((template) => (
          <Pressable key={template.id} onPress={() => setTemplateId(template.id)}>
            <Text className={template.id === templateId ? 'text-sm font-bold text-brand' : 'text-sm text-ink'}>
              {template.name} · {template.stages.length} etapas
            </Text>
          </Pressable>
        ))}
      </View>
      {selected ? <Muted>{selected.stages.map((stage) => stage.name).join(' → ')}</Muted> : null}
      <ScopeEditor scope={scope} admin onChange={(lines) => setScope(lines.map((line) => ({
        serviceId: line.serviceId,
        serviceName: '',
        allocationDays: line.allocationDays,
        quantity: line.quantity,
      })))} />
      <Button label={pending ? 'Criando...' : 'Criar projeto'} onPress={() => void submit()} disabled={pending || !templateId} />
      </FormColumn>
    </Screen>
  )
}
