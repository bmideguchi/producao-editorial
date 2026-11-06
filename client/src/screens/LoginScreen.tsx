import { useState } from 'react'
import { Text } from 'react-native'
import { ApiError } from '../api'
import { useSession } from '../session'
import { Banner, Button, Field, Screen, Title } from '../ui'

export function LoginScreen() {
  const { signIn } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(): Promise<void> {
    setPending(true)
    setError('')
    try {
      await signIn(email.trim(), password)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível entrar.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Screen>
      <Title>Produção editorial</Title>
      <Text className="text-base text-muted">Entre com o e-mail e a senha da equipe.</Text>
      {error ? <Banner message={error} /> : null}
      <Field label="E-mail" value={email} onChangeText={setEmail} />
      <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry />
      <Button label={pending ? 'Entrando...' : 'Entrar'} onPress={() => void submit()} disabled={pending} />
    </Screen>
  )
}
