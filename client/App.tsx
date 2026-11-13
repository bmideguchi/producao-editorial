import './global.css'
import { useEffect } from 'react'
import { Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import {
  IconAllocation,
  IconArchive,
  IconCalendar,
  IconClients,
  IconLogout,
  IconProjects,
  IconServices,
  IconSuppliers,
  IconTeam,
  IconTemplates,
} from './src/icons'
import { go, usePath } from './src/nav'
import { SessionProvider, useSession } from './src/session'
import { LoginScreen } from './src/screens/LoginScreen'
import { NewProjectScreen } from './src/screens/NewProjectScreen'
import { ProjectDetailScreen } from './src/screens/ProjectDetailScreen'
import { ProjectListScreen } from './src/screens/ProjectListScreen'
import { TemplateFormScreen, TemplateListScreen } from './src/screens/TemplateScreens'
import { AllocationScreen } from './src/screens/AllocationScreen'
import { ArchivedProjectsScreen } from './src/screens/ArchivedProjectsScreen'
import { CalendarScreen } from './src/screens/CalendarScreen'
import { ClientListScreen } from './src/screens/ClientScreens'
import { SupplierListScreen } from './src/screens/SupplierScreens'
import { ServiceListScreen } from './src/screens/ServiceScreens'
import { UserFormScreen, UserListScreen } from './src/screens/UserScreens'
import { Loading, Muted, Screen, Title } from './src/ui'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const navIcon = {
  '/projetos': IconProjects,
  '/clientes': IconClients,
  '/fornecedores': IconSuppliers,
  '/alocacao': IconAllocation,
  '/templates': IconTemplates,
  '/usuarios': IconTeam,
  '/servicos': IconServices,
  '/calendario': IconCalendar,
  '/projetos-arquivados': IconArchive,
} as const

export default function App() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return
    const id = 'editorial-fonts'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap'
    document.head.appendChild(link)
  }, [])
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <Root />
    </SessionProvider>
  )
}

function Root() {
  const { user, loading, signOut } = useSession()
  const path = usePath()

  useEffect(() => {
    if (loading) return
    if (!user && path !== '/login') go('/login')
    if (user && (path === '/' || path === '/login')) go('/projetos')
  }, [loading, user, path])

  if (loading) return <Loading />
  if (!user) {
    return (
      <View className="min-h-screen flex-1 bg-canvas">
        <LoginScreen />
      </View>
    )
  }

  const admin = user.role === 'admin'
  const adminOnly = path.startsWith('/usuarios') || path.startsWith('/templates') || path.startsWith('/calendario') || path.startsWith('/servicos') || path.startsWith('/clientes') || path.startsWith('/fornecedores') || path.startsWith('/alocacao') || path.startsWith('/projetos-arquivados') || path === '/projetos/novo'
  const body = !admin && adminOnly ? <Denied /> : <Routes path={path} />

  const projetosCurrent = path === '/projetos' || (path.startsWith('/projetos/') && !path.startsWith('/projetos-arquivados'))
  const initial = user.name.trim().charAt(0).toUpperCase() || 'U'

  return (
    <View className="h-screen flex-1 flex-row overflow-hidden bg-canvas">
      <View className="h-full w-64 shrink-0 bg-sidebar">
        <View className="border-b border-sidebar-line px-4 py-5">
          <Text
            className="text-base font-semibold tracking-tight text-sidebar-fg"
            style={Platform.OS === 'web' ? { fontFamily: 'Space Grotesk, Inter, "Segoe UI", sans-serif' } : undefined}
          >
            Produção editorial
          </Text>
        </View>
        <ScrollView className="flex-1" contentContainerClassName="gap-6 px-3 py-4">
          <View>
            <Text className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-muted">Operação</Text>
            <NavLink label="Projetos" path="/projetos" current={projetosCurrent} />
            {admin ? <NavLink label="Clientes" path="/clientes" current={path.startsWith('/clientes')} /> : null}
            {admin ? <NavLink label="Fornecedores" path="/fornecedores" current={path.startsWith('/fornecedores')} /> : null}
          </View>
          {admin ? (
            <View>
              <Text className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-muted">Reports</Text>
              <NavLink label="Alocação" path="/alocacao" current={path.startsWith('/alocacao')} />
            </View>
          ) : null}
          {admin ? (
            <View>
              <Text className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-muted">Configuração</Text>
              <NavLink label="Templates" path="/templates" current={path.startsWith('/templates')} />
              <NavLink label="Equipe" path="/usuarios" current={path.startsWith('/usuarios')} />
              <NavLink label="Serviços" path="/servicos" current={path.startsWith('/servicos')} />
              <NavLink label="Calendário" path="/calendario" current={path.startsWith('/calendario')} />
              <NavLink label="Projetos arquivados" path="/projetos-arquivados" current={path.startsWith('/projetos-arquivados')} />
            </View>
          ) : null}
        </ScrollView>
        <View className="border-t border-sidebar-line p-4">
          <View className="mb-3 flex-row items-center gap-3">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent">
              <Text className="text-sm font-semibold text-sidebar-fg">{initial}</Text>
            </View>
            <Text className="min-w-0 flex-1 text-sm font-medium text-sidebar-fg" numberOfLines={1}>{user.name}</Text>
          </View>
          <SignOut onPress={() => void signOut().then(() => go('/login'))} />
        </View>
      </View>
      <View className="min-w-0 flex-1">{body}</View>
    </View>
  )
}

function NavLink({ label, path, current }: { label: string; path: string; current: boolean }) {
  const Icon = navIcon[path as keyof typeof navIcon]
  const color = current ? '#f8fafc' : '#cbd5e1'
  return (
    <Pressable
      onPress={() => go(path)}
      className={`flex-row items-center gap-3 rounded-lg px-3 py-2.5 ${current ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent'}`}
    >
      {Icon ? <Icon color={color} /> : null}
      <Text className={`text-sm font-medium ${current ? 'text-sidebar-fg' : 'text-sidebar-fg/80'}`}>{label}</Text>
    </Pressable>
  )
}

function SignOut({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-2 rounded-lg px-3 py-2 hover:bg-sidebar-accent">
      <IconLogout color="#cbd5e1" />
      <Text className="text-sm font-medium text-sidebar-fg/80">Sair</Text>
    </Pressable>
  )
}

function Denied() {
  return (
    <Screen>
      <Title>Sem acesso</Title>
      <Muted>Esta área é só do administrador.</Muted>
    </Screen>
  )
}

function Routes({ path }: { path: string }) {
  if (path === '/projetos') return <ProjectListScreen />
  if (path === '/projetos/novo') return <NewProjectScreen />
  if (path === '/templates') return <TemplateListScreen />
  if (path === '/templates/novo') return <TemplateFormScreen id={null} />
  if (path === '/usuarios') return <UserListScreen />
  if (path === '/calendario') return <CalendarScreen />
  if (path === '/servicos') return <ServiceListScreen />
  if (path === '/clientes') return <ClientListScreen />
  if (path === '/fornecedores') return <SupplierListScreen />
  if (path === '/alocacao') return <AllocationScreen />
  if (path === '/projetos-arquivados') return <ArchivedProjectsScreen />
  if (path === '/usuarios/novo') return <UserFormScreen id={null} />

  const project = path.match(/^\/projetos\/([^/]+)$/)
  if (project && uuid.test(project[1])) return <ProjectDetailScreen id={project[1]} />
  const template = path.match(/^\/templates\/([^/]+)$/)
  if (template && uuid.test(template[1])) return <TemplateFormScreen id={template[1]} />
  const person = path.match(/^\/usuarios\/([^/]+)$/)
  if (person && uuid.test(person[1])) return <UserFormScreen id={person[1]} />

  return (
    <Screen>
      <Title>Página não encontrada</Title>
      <Pressable onPress={() => go('/projetos')}>
        <Text className="font-bold text-brand">Voltar aos projetos</Text>
      </Pressable>
    </Screen>
  )
}
