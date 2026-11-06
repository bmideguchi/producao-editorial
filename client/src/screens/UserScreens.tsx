import { useEffect, useRef, useState } from 'react'
import { Platform, Text, View } from 'react-native'
import { ApiError, api } from '../api'
import { roleLabel } from '../format'
import { go } from '../nav'
import type { Role, SessionUser } from '../types'
import { Banner, Button, Card, Confirm, Field, LinkText, Loading, Muted, Screen, SelectField, Title, TrashButton } from '../ui'

export function UserListScreen() {
  const [users, setUsers] = useState<SessionUser[] | null>(null)
  const [error, setError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<SessionUser | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    api.users()
      .then((result) => setUsers(result.users))
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : 'Não foi possível carregar as pessoas.'))
  }, [])

  async function remove(person: SessionUser): Promise<void> {
    setDeleting(true)
    setError('')
    try {
      await api.deleteUser(person.id)
      setUsers((current) => current?.filter((item) => item.id !== person.id) ?? current)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível excluir.')
    } finally {
      setDeleting(false)
    }
  }

  if (!users && !error) return <Loading />

  return (
    <Screen>
      <Title>Equipe</Title>
      <LinkText label="Nova pessoa" onPress={() => go('/usuarios/novo')} />
      {error ? <Banner message={error} /> : null}
      {users?.map((person) => (
        <Card key={person.id}>
          <View className="flex-row items-start gap-3">
            <View
              accessibilityLabel={person.active ? 'Ativo' : 'Inativo'}
              className={`mt-1.5 h-3 w-3 rounded-full ${person.active ? 'bg-ok' : 'bg-wait'}`}
            />
            <View className="min-w-0 flex-1 gap-1">
              <LinkText label={person.name} onPress={() => go(`/usuarios/${person.id}`)} />
              <Muted>
                {person.email} · {roleLabel(person.role)}
              </Muted>
            </View>
            <TrashButton
              label={`Excluir ${person.name}`}
              disabled={deleting}
              onPress={() => setPendingDelete(person)}
            />
          </View>
        </Card>
      ))}
      {pendingDelete ? (
        <Confirm
          title="Excluir membro"
          message={`Excluir ${pendingDelete.name}? O histórico dos projetos não é apagado.`}
          confirmLabel="Excluir"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const person = pendingDelete
            setPendingDelete(null)
            void remove(person)
          }}
        />
      ) : null}
    </Screen>
  )
}

export function UserFormScreen({ id }: { id: string | null }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('operator')
  const [password, setPassword] = useState('')
  const [active, setActive] = useState(true)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [loaded, setLoaded] = useState(id === null)
  const [missing, setMissing] = useState(false)
  const saved = useRef({ name: '', email: '', role: 'operator' as Role, active: true })
  const queue = useRef(Promise.resolve())

  useEffect(() => {
    if (!id) return
    api.users()
      .then((result) => {
        const person = result.users.find((item) => item.id === id)
        if (!person) {
          setMissing(true)
          setError('Pessoa não encontrada.')
          return
        }
        saved.current = { name: person.name, email: person.email, role: person.role, active: person.active }
        setName(person.name)
        setEmail(person.email)
        setRole(person.role)
        setActive(person.active)
      })
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : 'Não foi possível carregar a pessoa.'))
      .finally(() => setLoaded(true))
  }, [id])

  function enqueue(task: () => Promise<void>): void {
    queue.current = queue.current.then(task, task)
  }

  function remember(user: SessionUser): void {
    saved.current = { name: user.name, email: user.email, role: user.role, active: user.active }
  }

  function saveField(patch: { name?: string; email?: string; role?: Role; password?: string; active?: boolean }, revert: () => void): void {
    if (!id) return
    setError('')
    enqueue(async () => {
      try {
        const result = await api.updateUser(id, patch)
        remember(result.user)
        setName((current) => (patch.name !== undefined && current.trim() === patch.name ? result.user.name : current))
        setEmail((current) => (patch.email !== undefined && current.trim().toLowerCase() === patch.email ? result.user.email : current))
        setRole((current) => (patch.role !== undefined && current === patch.role ? result.user.role : current))
        setActive((current) => (patch.active !== undefined && current === patch.active ? result.user.active : current))
        if (patch.password) setPassword((current) => (current === patch.password ? '' : current))
        setError('')
      } catch (caught) {
        revert()
        setError(caught instanceof ApiError ? caught.message : 'Não foi possível salvar.')
      }
    })
  }

  function blurName(): void {
    const next = name.trim()
    if (!next) {
      setName(saved.current.name)
      setError('Informe o nome.')
      return
    }
    if (next === saved.current.name) {
      setName(saved.current.name)
      return
    }
    saveField({ name: next }, () => setName((current) => (current.trim() === next ? saved.current.name : current)))
  }

  function blurEmail(): void {
    const next = email.trim().toLowerCase()
    if (!next) {
      setEmail(saved.current.email)
      setError('Informe o e-mail.')
      return
    }
    if (next === saved.current.email) {
      setEmail(saved.current.email)
      return
    }
    saveField({ email: next }, () => setEmail((current) => (current.trim().toLowerCase() === next ? saved.current.email : current)))
  }

  function blurPassword(): void {
    if (!password) return
    const next = password
    saveField({ password: next }, () => undefined)
  }

  function changeRole(next: Role): void {
    const previous = role
    if (next === previous) return
    setRole(next)
    saveField({ role: next }, () => setRole((current) => (current === next ? previous : current)))
  }

  function changeActive(next: boolean): void {
    const previous = active
    if (next === previous) return
    setActive(next)
    saveField({ active: next }, () => setActive((current) => (current === next ? previous : current)))
  }

  async function create(): Promise<void> {
    setPending(true)
    setError('')
    try {
      await api.createUser({ name, email, role, password })
      go('/usuarios')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível salvar.')
    } finally {
      setPending(false)
    }
  }

  if (!loaded) return <Loading />

  if (id && missing) {
    return (
      <Screen>
        <Title>Editar membro</Title>
        {error ? <Banner message={error} /> : null}
      </Screen>
    )
  }

  if (!id) {
    return (
      <Screen>
        <Title>Nova pessoa</Title>
        {error ? <Banner message={error} /> : null}
        <Field label="Nome" value={name} onChangeText={setName} />
        <Field label="E-mail" value={email} onChangeText={setEmail} />
        <SelectField
          label="Papel"
          value={role}
          options={[
            { value: 'admin', label: 'Administrador' },
            { value: 'operator', label: 'Operador' },
          ]}
          onValueChange={(value) => {
            if (value === 'admin' || value === 'operator') setRole(value)
          }}
        />
        <Field label="Senha inicial" value={password} onChangeText={setPassword} secureTextEntry />
        <Button label={pending ? 'Salvando...' : 'Salvar'} disabled={pending} onPress={() => void create()} />
      </Screen>
    )
  }

  const columns = Platform.OS === 'web' ? 'w-full flex-row flex-wrap gap-8' : 'gap-4'

  return (
    <Screen>
      <Title>Editar membro</Title>
      {error ? <Text className="text-sm text-danger">{error}</Text> : null}
      <View className={columns}>
        <View className="min-w-72 flex-1 gap-4">
          <Field label="Nome" value={name} onChangeText={setName} onBlur={blurName} />
          <Field label="E-mail" value={email} onChangeText={setEmail} onBlur={blurEmail} />
          <Field
            label="Senha"
            value={password}
            onChangeText={setPassword}
            onBlur={blurPassword}
            secureTextEntry
            placeholder="Em branco mantém a atual"
          />
        </View>
        <View className="min-w-72 flex-1 gap-4">
          <SelectField
            label="Papel"
            value={role}
            options={[
              { value: 'admin', label: 'Administrador' },
              { value: 'operator', label: 'Operador' },
            ]}
            onValueChange={(value) => {
              if (value === 'admin' || value === 'operator') changeRole(value)
            }}
          />
          <SelectField
            label="Status"
            value={active ? 'active' : 'inactive'}
            options={[
              { value: 'active', label: 'Ativo' },
              { value: 'inactive', label: 'Inativo' },
            ]}
            onValueChange={(value) => changeActive(value === 'active')}
          />
        </View>
      </View>
    </Screen>
  )
}
