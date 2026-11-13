import { useEffect, useState } from 'react'
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { ApiError, api } from '../api'
import type { ClientRecord } from '../types'
import { Banner, Button, Field, Loading, Muted, Screen, Title } from '../ui'

type Editor = { mode: 'create' } | { mode: 'edit'; client: ClientRecord }

export function ClientListScreen() {
  const [clients, setClients] = useState<ClientRecord[] | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [error, setError] = useState('')

  function load(): void {
    api.clients()
      .then((result) => setClients(result.clients))
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : 'Não foi possível carregar os clientes.'))
  }

  useEffect(() => {
    load()
  }, [])

  if (!clients && !error) return <Loading />

  return (
    <Screen wide>
      <View className="flex-row items-center justify-between gap-4">
        <Title>Clientes</Title>
        <Button label="Novo cliente" onPress={() => setEditor({ mode: 'create' })} />
      </View>
      {error ? <Banner message={error} /> : null}
      {clients?.length === 0 ? <Muted>Nenhum cliente no catálogo.</Muted> : null}
      {clients && clients.length > 0 ? (
        <ScrollView horizontal>
          <View className="min-w-[480px] overflow-hidden rounded-2xl border border-line bg-paper">
            <View className="flex-row border-b border-line bg-canvas px-4 py-3">
              <Text className="flex-1 text-sm font-semibold text-muted">Nome</Text>
            </View>
            {clients.map((client) => (
              <Pressable
                key={client.id}
                accessibilityRole="button"
                accessibilityLabel={client.name}
                onPress={() => setEditor({ mode: 'edit', client })}
                className="border-b border-line px-4 py-3"
                style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined}
              >
                <Text className="text-base font-semibold text-ink">{client.name}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : null}
      {editor ? (
        <ClientModal
          key={editor.mode === 'edit' ? editor.client.id : 'new'}
          editor={editor}
          onClose={() => setEditor(null)}
          onSaved={(client) => {
            setClients((current) => {
              const next = current?.some((item) => item.id === client.id)
                ? current.map((item) => item.id === client.id ? client : item)
                : [...(current ?? []), client]
              return next.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
            })
            setError('')
            setEditor(null)
          }}
          onDeleted={(id) => {
            setClients((current) => current?.filter((item) => item.id !== id) ?? [])
            setError('')
            setEditor(null)
          }}
        />
      ) : null}
    </Screen>
  )
}

function ClientModal({
  editor,
  onClose,
  onSaved,
  onDeleted,
}: {
  editor: Editor
  onClose: () => void
  onSaved: (client: ClientRecord) => void
  onDeleted: (id: string) => void
}) {
  const editing = editor.mode === 'edit' ? editor.client : null
  const [name, setName] = useState(editing?.name ?? '')
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState<'save' | 'delete' | null>(null)

  async function save(): Promise<void> {
    const nextName = name.trim()
    if (!nextName) {
      setFormError('Informe o nome.')
      return
    }
    setPending('save')
    setFormError('')
    try {
      const result = editing
        ? await api.updateClient(editing.id, { name: nextName })
        : await api.createClient({ name: nextName })
      onSaved(result.client)
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Não foi possível salvar o cliente.')
      setPending(null)
    }
  }

  async function remove(): Promise<void> {
    if (!editing) return
    setPending('delete')
    setFormError('')
    try {
      await api.deleteClient(editing.id)
      onDeleted(editing.id)
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Não foi possível excluir o cliente.')
      setPending(null)
    }
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={() => { if (!pending) onClose() }}>
      <View className="flex-1 items-center justify-center bg-ink/45 p-5">
        <View className="w-full max-w-md gap-3 rounded-2xl bg-paper p-5">
          <Text className="text-lg font-bold text-ink">{editing ? 'Editar cliente' : 'Novo cliente'}</Text>
          <Field label="Nome" value={name} onChangeText={setName} />
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
