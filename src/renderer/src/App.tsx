import { AppProvider } from './contexts/AppContext'
import { Layout } from './components/Layout'
import './App.css'

export default function App() {
  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  )
}
