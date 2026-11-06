import { useEffect, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { ApiError, api } from '../api'
import { formatDate } from '../format'
import type { ArchivedProject } from '../types'
import { Banner, Confirm, Loading, Muted, Screen, Title, TrashButton } from '../ui'

export function ArchivedProjectsScreen() {
  const [projects, setProjects] = useState<ArchivedProject[] | null>(null)
  const [error, setError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<ArchivedProject | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    api.archivedProjects()
      .then((result) => setProjects(result.projects))
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : 'Não foi possível carregar os projetos arquivados.'))
  }, [])

  async function remove(project: ArchivedProject): Promise<void> {
    setDeleting(true)
    setError('')
    try {
      await api.deleteProject(project.id)
      setProjects((current) => current?.filter((item) => item.id !== project.id) ?? current)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível excluir o projeto.')
    } finally {
      setDeleting(false)
    }
  }

  if (!projects && !error) return <Loading />

  return (
    <Screen wide>
      <Title>Projetos arquivados</Title>
      {error ? <Banner message={error} /> : null}
      {projects?.length === 0 ? <Muted>Nenhum projeto arquivado.</Muted> : null}
      {projects && projects.length > 0 ? (
        <ScrollView horizontal>
          <View className="min-w-[640px] overflow-hidden rounded-2xl border border-line bg-paper">
            <View className="flex-row border-b border-line bg-canvas px-4 py-3">
              <Text className="flex-1 text-sm font-semibold text-muted">Nome</Text>
              <Text className="w-36 text-sm font-semibold text-muted">Início</Text>
              <View className="w-12" />
            </View>
            {projects.map((project) => (
              <View key={project.id} className="flex-row items-center border-b border-line px-4 py-3">
                <Text className="flex-1 pr-3 text-base font-semibold text-ink">{project.name}</Text>
                <Text className="w-36 text-ink">{formatDate(project.startDate)}</Text>
                <TrashButton
                  label={`Excluir ${project.name}`}
                  disabled={deleting}
                  onPress={() => setPendingDelete(project)}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}
      {pendingDelete ? (
        <Confirm
          title="Excluir projeto"
          message={`Excluir ${pendingDelete.name}? As etapas, as tarefas e as alocações são apagadas.`}
          confirmLabel="Excluir"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const project = pendingDelete
            setPendingDelete(null)
            void remove(project)
          }}
        />
      ) : null}
    </Screen>
  )
}
