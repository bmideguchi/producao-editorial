import { createElement, type ReactNode, useEffect, useState } from 'react'
import { Modal, Platform, Pressable, Text, View } from 'react-native'
import { ApiError, api } from '../api'
import { formatAllocationDays, parseAllocationDays } from '../format'
import type { ServiceRecord } from '../types'
import { Banner, Button, Field, Loading, Muted, Screen, Title } from '../ui'

type Editor = { mode: 'create' } | { mode: 'edit'; service: ServiceRecord }

export function ServiceListScreen() {
  const [services, setServices] = useState<ServiceRecord[] | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [error, setError] = useState('')

  function load(): void {
    api.services()
      .then((result) => setServices(result.services))
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : 'Não foi possível carregar os serviços.'))
  }

  useEffect(() => {
    load()
  }, [])

  if (!services && !error) return <Loading />

  return (
    <Screen fill>
      <View className="flex-row items-center justify-between gap-4">
        <Title>Serviços</Title>
        <Button label="Novo serviço" onPress={() => setEditor({ mode: 'create' })} />
      </View>
      {error ? <Banner message={error} /> : null}
      {services?.length === 0 ? <Muted>Nenhum serviço no catálogo.</Muted> : null}
      <Catalog>
        {services?.map((service) => (
          <Pressable
            key={service.id}
            accessibilityRole="button"
            accessibilityLabel={`${service.name}, ${formatAllocationDays(service.allocationDays)}`}
            onPress={() => setEditor({ mode: 'edit', service })}
            className="rounded-2xl border border-line bg-paper px-4 py-3"
            style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined}
          >
            <Text className="text-base font-bold text-ink">{service.name}</Text>
            <Text className="mt-1 text-sm text-muted">{formatAllocationDays(service.allocationDays)}</Text>
          </Pressable>
        ))}
      </Catalog>
      {editor ? (
        <ServiceModal
          key={editor.mode === 'edit' ? editor.service.id : 'new'}
          editor={editor}
          onClose={() => setEditor(null)}
          onSaved={(service) => {
            setServices((current) => {
              const next = current?.some((item) => item.id === service.id)
                ? current.map((item) => item.id === service.id ? service : item)
                : [...(current ?? []), service]
              return next.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
            })
            setError('')
            setEditor(null)
          }}
          onDeleted={(id) => {
            setServices((current) => current?.filter((item) => item.id !== id) ?? [])
            setError('')
            setEditor(null)
          }}
        />
      ) : null}
    </Screen>
  )
}

function Catalog({ children }: { children: ReactNode }) {
  if (Platform.OS === 'web') {
    return createElement('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 10,
        width: '100%',
      },
    }, children)
  }
  return <View className="gap-2.5">{children}</View>
}

function ServiceModal({
  editor,
  onClose,
  onSaved,
  onDeleted,
}: {
  editor: Editor
  onClose: () => void
  onSaved: (service: ServiceRecord) => void
  onDeleted: (id: string) => void
}) {
  const editing = editor.mode === 'edit' ? editor.service : null
  const [name, setName] = useState(editing?.name ?? '')
  const [days, setDays] = useState(editing ? daysInput(editing.allocationDays) : '')
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState<'save' | 'delete' | null>(null)

  async function save(): Promise<void> {
    const nextName = name.trim()
    const allocationDays = parseAllocationDays(days)
    if (!nextName) {
      setFormError('Informe o nome.')
      return
    }
    if (allocationDays === null) {
      setFormError('Informe um tempo maior que zero, com até duas casas decimais.')
      return
    }
    setPending('save')
    setFormError('')
    try {
      const result = editing
        ? await api.updateService(editing.id, { name: nextName, allocationDays })
        : await api.createService({ name: nextName, allocationDays })
      onSaved(result.service)
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Não foi possível salvar o serviço.')
      setPending(null)
    }
  }

  async function remove(): Promise<void> {
    if (!editing) return
    setPending('delete')
    setFormError('')
    try {
      await api.deleteService(editing.id)
      onDeleted(editing.id)
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Não foi possível excluir o serviço.')
      setPending(null)
    }
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={() => { if (!pending) onClose() }}>
      <View className="flex-1 items-center justify-center bg-ink/45 p-5">
        <View className="w-full max-w-md gap-3 rounded-2xl bg-paper p-5">
          <Text className="text-lg font-bold text-ink">{editing ? 'Editar serviço' : 'Novo serviço'}</Text>
          <Field label="Nome" value={name} onChangeText={setName} />
          <Field label="Tempo (dias)" value={days} placeholder="0,5" onChangeText={setDays} />
          {formError ? <Banner message={formError} /> : null}
          <View className="flex-row items-center justify-between gap-2">
            {editing ? (
              <Button label={pending === 'delete' ? 'Excluindo...' : 'Excluir'} tone="danger" disabled={pending !== null} onPress={() => void remove()} />
            ) : <View />}
            <View className="flex-row gap-2">
              <Button label="Cancelar" tone="quiet" disabled={pending !== null} onPress={onClose} />
              <Button label={pending === 'save' ? 'Salvando...' : 'Salvar'} disabled={pending !== null} onPress={() => void save()} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function daysInput(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}
