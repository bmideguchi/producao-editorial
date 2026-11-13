import { useEffect, useState } from 'react'
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { ApiError, api } from '../api'
import type { SupplierRecord } from '../types'
import { Banner, Button, Field, Loading, Muted, Screen, Title } from '../ui'

type Editor = { mode: 'create' } | { mode: 'edit'; supplier: SupplierRecord }

export function SupplierListScreen() {
  const [suppliers, setSuppliers] = useState<SupplierRecord[] | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [error, setError] = useState('')

  function load(): void {
    api.suppliers()
      .then((result) => setSuppliers(result.suppliers))
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : 'Não foi possível carregar os fornecedores.'))
  }

  useEffect(() => {
    load()
  }, [])

  if (!suppliers && !error) return <Loading />

  return (
    <Screen wide>
      <View className="flex-row items-center justify-between gap-4">
        <Title>Fornecedores</Title>
        <Button label="Novo fornecedor" onPress={() => setEditor({ mode: 'create' })} />
      </View>
      {error ? <Banner message={error} /> : null}
      {suppliers?.length === 0 ? <Muted>Nenhum fornecedor no catálogo.</Muted> : null}
      {suppliers && suppliers.length > 0 ? (
        <ScrollView horizontal>
          <View className="min-w-[480px] overflow-hidden rounded-2xl border border-line bg-paper">
            <View className="flex-row border-b border-line bg-canvas px-4 py-3">
              <Text className="flex-1 text-sm font-semibold text-muted">Nome</Text>
            </View>
            {suppliers.map((supplier) => (
              <Pressable
                key={supplier.id}
                accessibilityRole="button"
                accessibilityLabel={supplier.name}
                onPress={() => setEditor({ mode: 'edit', supplier })}
                className="border-b border-line px-4 py-3"
                style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined}
              >
                <Text className="text-base font-semibold text-ink">{supplier.name}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : null}
      {editor ? (
        <SupplierModal
          key={editor.mode === 'edit' ? editor.supplier.id : 'new'}
          editor={editor}
          onClose={() => setEditor(null)}
          onSaved={(supplier) => {
            setSuppliers((current) => {
              const next = current?.some((item) => item.id === supplier.id)
                ? current.map((item) => item.id === supplier.id ? supplier : item)
                : [...(current ?? []), supplier]
              return next.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
            })
            setError('')
            setEditor(null)
          }}
          onDeleted={(id) => {
            setSuppliers((current) => current?.filter((item) => item.id !== id) ?? [])
            setError('')
            setEditor(null)
          }}
        />
      ) : null}
    </Screen>
  )
}

function SupplierModal({
  editor,
  onClose,
  onSaved,
  onDeleted,
}: {
  editor: Editor
  onClose: () => void
  onSaved: (supplier: SupplierRecord) => void
  onDeleted: (id: string) => void
}) {
  const editing = editor.mode === 'edit' ? editor.supplier : null
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
        ? await api.updateSupplier(editing.id, { name: nextName })
        : await api.createSupplier({ name: nextName })
      onSaved(result.supplier)
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Não foi possível salvar o fornecedor.')
      setPending(null)
    }
  }

  async function remove(): Promise<void> {
    if (!editing) return
    setPending('delete')
    setFormError('')
    try {
      await api.deleteSupplier(editing.id)
      onDeleted(editing.id)
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Não foi possível excluir o fornecedor.')
      setPending(null)
    }
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={() => { if (!pending) onClose() }}>
      <View className="flex-1 items-center justify-center bg-ink/45 p-5">
        <View className="w-full max-w-md gap-3 rounded-2xl bg-paper p-5">
          <Text className="text-lg font-bold text-ink">{editing ? 'Editar fornecedor' : 'Novo fornecedor'}</Text>
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
