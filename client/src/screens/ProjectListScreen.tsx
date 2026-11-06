import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { ApiError, api } from '../api'
import { go } from '../nav'
import { useSession } from '../session'
import type { ProjectListItem } from '../types'
import { Banner, Dots, LinkText, Loading, Muted, Screen, Title } from '../ui'

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
    <Screen wide>
      <Title>{user?.role === 'admin' ? 'Projetos' : 'Meus projetos'}</Title>
      {user?.role === 'admin' ? <LinkText label="Novo projeto" onPress={() => go('/projetos/novo')} /> : null}
      {error ? <Banner message={error} /> : null}
      {projects?.length === 0 ? (
        <Muted>{user?.role === 'admin' ? 'Nenhum projeto em andamento.' : 'Você ainda não está em nenhum projeto.'}</Muted>
      ) : null}
      <ScrollView horizontal>
        <View className="min-w-[760px] overflow-hidden rounded-2xl border border-line bg-paper">
          <View className="flex-row border-b border-line bg-canvas px-4 py-3">
            <Text className="flex-1 text-sm font-semibold text-muted">Nome do projeto</Text>
            <Text className="w-64 text-sm font-semibold text-muted">Status</Text>
            <Text className="w-32 text-sm font-semibold text-muted">Status %</Text>
            <Text className="w-36 text-sm font-semibold text-muted">Geral</Text>
          </View>
          {projects?.map((project) => (
            <Pressable
              key={project.id}
              onPress={() => go(`/projetos/${project.id}`)}
              className="flex-row items-start border-b border-line px-4 py-3"
            >
              <Text className="flex-1 pr-3 text-base font-semibold text-ink">{project.name}</Text>
              <View className="w-64 pr-3">
                <Dots stages={project.stages} />
              </View>
              <Text className="w-32 text-ink">
                {project.statusPercent}% ({project.subtasksDone}/{project.subtasksTotal})
              </Text>
              <Text className="w-36 text-ink">{project.overall}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Screen>
  )
}
