import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { ApiError, api } from '../api'
import { formatDate } from '../format'
import type { ArchivedProject } from '../types'
import { Banner, BodyText, Confirm, Empty, Loading, PageHeader, Screen, TableHeaderText, TableScroll, TableShell, TrashButton } from '../ui'

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
    <Screen>
      <PageHeader title="Projetos arquivados" />
      {error ? <Banner message={error} /> : null}
      {projects?.length === 0 ? <Empty>Nenhum projeto arquivado.</Empty> : null}
      {projects && projects.length > 0 ? (
        <TableScroll>
          <TableShell minWidth={640}>
            <View className="w-full flex-row items-center border-b border-line bg-canvas px-4 py-2.5">
              <TableHeaderText className="flex-1">Nome</TableHeaderText>
              <TableHeaderText className="w-36">Início</TableHeaderText>
              <View className="w-12" />
            </View>
            {projects.map((project) => (
              <View key={project.id} className="w-full flex-row items-center border-b border-line px-4 py-3 hover:bg-canvas">
                <BodyText className="flex-1 pr-3 font-medium">{project.name}</BodyText>
                <BodyText className="w-36">{formatDate(project.startDate)}</BodyText>
                <TrashButton
                  label={`Excluir ${project.name}`}
                  disabled={deleting}
                  onPress={() => setPendingDelete(project)}
                />
              </View>
            ))}
          </TableShell>
        </TableScroll>
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
