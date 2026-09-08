import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  entrar as entrarNaApi,
  recuperarSessao,
  sair as sairDaApi,
  type UsuarioDaSessao,
} from '../lib/api';

interface Sessao {
  usuario: UsuarioDaSessao | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
}

const Contexto = createContext<Sessao | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioDaSessao | null>(null);
  // Comeca carregando: sem isto, a tela pisca o login por um instante antes de
  // a sessao ser reidratada, mesmo para quem ja esta logado.
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    recuperarSessao()
      .then((u) => !cancelado && setUsuario(u))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, []);

  const entrar = useCallback(async (email: string, senha: string) => {
    setUsuario(await entrarNaApi(email, senha));
  }, []);

  const sair = useCallback(async () => {
    await sairDaApi();
    setUsuario(null);
  }, []);

  const valor = useMemo(
    () => ({ usuario, carregando, entrar, sair }),
    [usuario, carregando, entrar, sair],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): Sessao {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useSessao precisa estar dentro de <AuthProvider>.');
  return contexto;
}
