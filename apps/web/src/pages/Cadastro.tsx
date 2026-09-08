import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { validarCnpj, validarCpf, validarTelefone } from '@rotulei/shared';
import { useSessao } from '../auth/AuthProvider';
import { ErroDaApi, listarPlanos, type Plano } from '../lib/api';

/**
 * Cadastro público — cria o tenant em trial, sem cartão (ESCOPO.md).
 *
 * Valida CNPJ/CPF/telefone no navegador com os MESMOS validadores que a API
 * usa (packages/shared/src/documentos.ts) — dá feedback antes de gastar um
 * round-trip, mas quem decide de verdade continua sendo o service (nunca
 * confie só na validação do cliente).
 */

type CamposTexto = 'nomeMercado' | 'cnpj' | 'nomeAdmin' | 'cpf' | 'telefone' | 'email' | 'senha';

const ESTADO_INICIAL: Record<CamposTexto, string> = {
  nomeMercado: '',
  cnpj: '',
  nomeAdmin: '',
  cpf: '',
  telefone: '',
  email: '',
  senha: '',
};

function formatarPreco(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function Cadastro() {
  const { cadastrar } = useSessao();
  const navegar = useNavigate();

  const [campos, setCampos] = useState(ESTADO_INICIAL);
  const [planoCodigo, setPlanoCodigo] = useState('');
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [erroDeCampo, setErroDeCampo] = useState<Partial<Record<CamposTexto, string>>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    listarPlanos()
      .then((lista) => {
        setPlanos(lista);
        // A API ordena por preco_mensal_centavos ASC — planos "sob consulta"
        // (Enterprise) sao gravados como 0 e, por isso, ordenam ANTES dos
        // planos de verdade. Sem este filtro, o formulario pre-selecionaria
        // Enterprise por engano, e o cadastro terminaria sem conseguir
        // assinar (mensalidadeCentavos <= 0 recusa o checkout).
        const primeiroComPreco = lista.find((p) => p.precoMensalCentavos > 0);
        if (primeiroComPreco) setPlanoCodigo(primeiroComPreco.codigo);
        else if (lista.length > 0) setPlanoCodigo(lista[0].codigo);
      })
      .catch(() => setErroGeral('Não foi possível carregar os planos. Recarregue a página.'));
  }, []);

  function editar(campo: CamposTexto, valor: string) {
    setCampos((atual) => ({ ...atual, [campo]: valor }));
    setErroDeCampo((atual) => ({ ...atual, [campo]: undefined }));
  }

  /** Confere os campos que tem digito verificador antes de gastar uma request. */
  function validar(): boolean {
    const proximosErros: Partial<Record<CamposTexto, string>> = {};

    if (!campos.nomeMercado.trim()) proximosErros.nomeMercado = 'Informe o nome do mercado.';
    if (!validarCnpj(campos.cnpj)) proximosErros.cnpj = 'CNPJ inválido.';
    if (!campos.nomeAdmin.trim()) proximosErros.nomeAdmin = 'Informe seu nome.';
    if (!validarCpf(campos.cpf)) proximosErros.cpf = 'CPF inválido.';
    if (!validarTelefone(campos.telefone)) proximosErros.telefone = 'Telefone inválido — use DDD + número.';
    if (campos.senha.length < 10) proximosErros.senha = 'Use ao menos 10 caracteres.';

    setErroDeCampo(proximosErros);
    return Object.keys(proximosErros).length === 0;
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErroGeral(null);
    if (!validar()) return;

    setEnviando(true);
    try {
      await cadastrar({ ...campos, planoCodigo });
      navegar('/', { replace: true });
    } catch (falha) {
      // 409 (CNPJ/e-mail/CPF/telefone já usado) e 429 (rate limit) já vêm com
      // mensagem pronta da API — só o texto genérico fica por nossa conta.
      setErroGeral(
        falha instanceof ErroDaApi ? falha.message : 'Não foi possível concluir o cadastro.',
      );
    } finally {
      setEnviando(false);
    }
  }

  const campo = (id: CamposTexto, rotulo: string, opcoes: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}) => (
    <div className="editor-campo">
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        value={campos[id]}
        onChange={(e) => editar(id, e.target.value)}
        {...opcoes}
      />
      {erroDeCampo[id] && (
        <p role="alert" style={{ color: 'var(--acento)', fontSize: 13, margin: '4px 0 0' }}>
          {erroDeCampo[id]}
        </p>
      )}
    </div>
  );

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 20 }}>
      <form
        onSubmit={enviar}
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'var(--superficie)',
          border: '1px solid var(--borda)',
          borderRadius: 14,
          padding: 28,
        }}
      >
        <h1 style={{ fontSize: 26, marginBottom: 4 }}>Criar conta no Rotulei</h1>
        <p style={{ color: 'var(--suave)', marginTop: 0, marginBottom: 22 }}>
          7 dias grátis, sem pedir cartão de crédito.
        </p>

        {campo('nomeMercado', 'Nome do mercado', { autoComplete: 'organization' })}
        {campo('cnpj', 'CNPJ', { inputMode: 'numeric', placeholder: '00.000.000/0000-00' })}

        <div className="editor-pares">
          {campo('nomeAdmin', 'Seu nome', { autoComplete: 'name' })}
          {campo('cpf', 'Seu CPF', { inputMode: 'numeric', placeholder: '000.000.000-00' })}
        </div>

        {campo('telefone', 'Seu telefone (com DDD)', {
          inputMode: 'tel',
          placeholder: '(11) 98888-7777',
          autoComplete: 'tel',
        })}
        {campo('email', 'E-mail', { type: 'email', autoComplete: 'email' })}
        {campo('senha', 'Senha', { type: 'password', autoComplete: 'new-password' })}

        <div className="editor-campo">
          <label htmlFor="plano">Plano</label>
          <select id="plano" value={planoCodigo} onChange={(e) => setPlanoCodigo(e.target.value)}>
            {/* "Sob consulta" (preco 0) por último — a API ordena por preço
                ASC, e 0 sorting primeiro deixaria Enterprise no topo da lista. */}
            {[...planos]
              .sort((a, b) => (a.precoMensalCentavos || Infinity) - (b.precoMensalCentavos || Infinity))
              .map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.nome} —{' '}
                  {p.precoMensalCentavos > 0
                    ? `${formatarPreco(p.precoMensalCentavos)}${p.precoPorLoja ? '/loja' : ''}/mês`
                    : 'sob consulta'}
                </option>
              ))}
          </select>
        </div>

        {erroGeral && (
          <p role="alert" style={{ color: 'var(--acento)', fontSize: 14, marginTop: 4 }}>
            {erroGeral}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando || planos.length === 0}
          style={{
            width: '100%',
            marginTop: 10,
            background: 'var(--acento)',
            color: '#fff',
            borderColor: 'var(--acento)',
            fontWeight: 600,
          }}
        >
          {enviando ? 'Criando conta…' : 'Começar teste grátis'}
        </button>

        <p style={{ textAlign: 'center', fontSize: 13, marginTop: 16, marginBottom: 0 }}>
          Já tem conta? <Link to="/entrar">Entre</Link>
        </p>
      </form>
    </div>
  );
}
