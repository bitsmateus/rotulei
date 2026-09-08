/** Codigos de erro do Postgres usados para mapear violacao de constraint em excecao de dominio. */
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

interface ErroDePostgres {
  code: string;
  constraint?: string;
}

function ehErroDePostgres(erro: unknown, codigo: string): erro is ErroDePostgres {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    'code' in erro &&
    (erro as { code: unknown }).code === codigo
  );
}

export function ehViolacaoDeUnicidade(erro: unknown): erro is ErroDePostgres {
  return ehErroDePostgres(erro, UNIQUE_VIOLATION);
}

export function ehViolacaoDeChaveEstrangeira(erro: unknown): erro is ErroDePostgres {
  return ehErroDePostgres(erro, FOREIGN_KEY_VIOLATION);
}
