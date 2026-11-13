import { useState } from 'react'
import { View } from 'react-native'
import { ApiError } from '../api'
import { useSession } from '../session'
import { Banner, Button, Field, Muted, Screen, Title } from '../ui'

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
      <View className="w-full max-w-md gap-4 self-center">
      <Title>Produção editorial</Title>
      <Muted>Entre com o e-mail e a senha da equipe.</Muted>
      {error ? <Banner message={error} /> : null}
      <Field label="E-mail" value={email} onChangeText={setEmail} />
      <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry />
      <Button label={pending ? 'Entrando...' : 'Entrar'} onPress={() => void submit()} disabled={pending} />
      </View>
    </Screen>
  )
}
