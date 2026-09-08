import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RotaProtegida } from './auth/RotaProtegida';
import { Entrar } from './pages/Entrar';
import { Estudio } from './pages/Estudio';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/entrar" element={<Entrar />} />

          <Route element={<RotaProtegida />}>
            <Route path="/" element={<Estudio />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
