import './global.css'
import { useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
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
import { Loading, Screen, Title } from './src/ui'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function App() {
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

  return (
    <View className="min-h-screen flex-1 flex-row bg-canvas">
      <View className="w-64 shrink-0 border-r border-line bg-paper px-4 py-6">
        <Text className="text-lg font-bold text-ink">Produção editorial</Text>
        <Text className="mt-1 text-sm text-muted">{user.name}</Text>
        <Text className="mb-1 mt-8 text-xs font-semibold uppercase tracking-wide text-muted">Operação</Text>
        <NavLink label="Projetos" path="/projetos" current={path === '/projetos' || path.startsWith('/projetos/')} />
        {admin ? <NavLink label="Clientes" path="/clientes" current={path.startsWith('/clientes')} /> : null}
        {admin ? <NavLink label="Fornecedores" path="/fornecedores" current={path.startsWith('/fornecedores')} /> : null}
        {admin ? (
          <>
            <Text className="mb-1 mt-8 text-xs font-semibold uppercase tracking-wide text-muted">Reports</Text>
            <NavLink label="Alocação" path="/alocacao" current={path.startsWith('/alocacao')} />
            <Text className="mb-1 mt-8 text-xs font-semibold uppercase tracking-wide text-muted">Configuração</Text>
            <NavLink label="Templates" path="/templates" current={path.startsWith('/templates')} />
            <NavLink label="Equipe" path="/usuarios" current={path.startsWith('/usuarios')} />
            <NavLink label="Serviços" path="/servicos" current={path.startsWith('/servicos')} />
            <NavLink label="Calendário" path="/calendario" current={path.startsWith('/calendario')} />
            <NavLink label="Projetos arquivados" path="/projetos-arquivados" current={path.startsWith('/projetos-arquivados')} />
            <SignOut onPress={() => void signOut().then(() => go('/login'))} />
          </>
        ) : (
          <SignOut onPress={() => void signOut().then(() => go('/login'))} />
        )}
      </View>
      <View className="min-w-0 flex-1">{body}</View>
    </View>
  )
}

function NavLink({ label, path, current }: { label: string; path: string; current: boolean }) {
  return (
    <Pressable onPress={() => go(path)} className={`rounded-lg px-3 py-2 ${current ? 'bg-canvas' : ''}`}>
      <Text className={`font-semibold ${current ? 'text-brand' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  )
}

function SignOut({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="mt-2 rounded-lg px-3 py-2">
      <Text className="font-semibold text-brand">Sair</Text>
    </Pressable>
  )
}

function Denied() {
  return (
    <Screen>
      <Title>Sem acesso</Title>
      <Text className="text-[15px] leading-6 text-muted">Esta área é só do administrador.</Text>
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
