import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RotaProtegida } from './auth/RotaProtegida';
import { Entrar } from './pages/Entrar';
import { Cadastro } from './pages/Cadastro';
import { Estudio } from './pages/Estudio';
import { Admin } from './pages/Admin';
import { PainelDoTenant } from './pages/PainelDoTenant';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/entrar" element={<Entrar />} />
          <Route path="/cadastro" element={<Cadastro />} />

          <Route element={<RotaProtegida />}>
            <Route path="/" element={<Estudio />} />
          </Route>

          <Route element={<RotaProtegida papeis={['superadmin']} />}>
            <Route path="/admin" element={<Admin />} />
          </Route>

          <Route element={<RotaProtegida papeis={['admin']} />}>
            <Route path="/painel" element={<PainelDoTenant />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
