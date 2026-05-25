import { AppProvider } from './contexts/AppContext'
import { Layout } from './components/Layout'
import './App.css'

export function App({ isReadOnly = false }: { isReadOnly?: boolean }) {
  return (
    <AppProvider isReadOnly={isReadOnly}>
      <Layout />
    </AppProvider>
  )
}
