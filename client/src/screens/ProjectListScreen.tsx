import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { ApiError, api } from '../api'
import { go } from '../nav'
import { useSession } from '../session'
import type { ProjectListItem } from '../types'
import { Banner, BodyText, Button, Dots, Empty, Loading, PageHeader, Screen, TableHeaderText, TableScroll, TableShell } from '../ui'

export function ProjectListScreen() {
  const { user } = useSession()
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.projects()
      .then((result) => setProjects(result.projects))
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : 'Não foi possível carregar os projetos.'))
  }, [])

  if (!projects && !error) return <Loading />

  return (
    <Screen>
      <PageHeader title={user?.role === 'admin' ? 'Projetos' : 'Meus projetos'}>
        {user?.role === 'admin' ? <Button label="Novo projeto" onPress={() => go('/projetos/novo')} /> : null}
      </PageHeader>
      {error ? <Banner message={error} /> : null}
      {projects?.length === 0 ? (
        <Empty>{user?.role === 'admin' ? 'Nenhum projeto em andamento.' : 'Você ainda não está em nenhum projeto.'}</Empty>
      ) : null}
      {projects && projects.length > 0 ? (
      <TableScroll>
        <TableShell minWidth={760}>
          <View className="w-full flex-row items-center border-b border-line bg-canvas px-4 py-2.5">
            <TableHeaderText className="flex-1">Nome do projeto</TableHeaderText>
            <TableHeaderText className="w-64">Status</TableHeaderText>
            <TableHeaderText className="w-32">Status %</TableHeaderText>
            <TableHeaderText className="w-36">Geral</TableHeaderText>
          </View>
          {projects.map((project) => (
            <Pressable
              key={project.id}
              onPress={() => go(`/projetos/${project.id}`)}
              className="w-full flex-row items-start border-b border-line px-4 py-3 hover:bg-canvas"
            >
              <BodyText className="flex-1 pr-3 font-medium">{project.name}</BodyText>
              <View className="w-64 pr-3">
                <Dots stages={project.stages} />
              </View>
              <BodyText className="w-32">
                {project.statusPercent}% ({project.subtasksDone}/{project.subtasksTotal})
              </BodyText>
              <BodyText className="w-36">{project.overall}</BodyText>
            </Pressable>
          ))}
        </TableShell>
      </TableScroll>
      ) : null}
    </Screen>
  )
}
