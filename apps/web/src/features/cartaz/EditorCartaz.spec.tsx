import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cartazVazio } from '@rotulei/shared';
import { EditorCartaz } from './EditorCartaz';

vi.mock('./fontes', () => ({ useFontesDoCartaz: () => {} }));
beforeEach(() => localStorage.clear());
afterEach(cleanup);

it('edita, adiciona, abre e remove cartazes da fila', () => {
  render(<EditorCartaz escopoFila="tenant:usuario" />);
  fireEvent.change(screen.getByLabelText('Titulo'), { target: { value: 'Arroz' } });
  fireEvent.change(screen.getByLabelText('Preco'), { target: { value: '12,99' } });
  fireEvent.click(screen.getByRole('button', { name: '+ Adicionar a fila' }));
  expect(screen.getByText('Fila (1)')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Titulo'), { target: { value: 'Feijao' } });
  fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
  expect(screen.getByLabelText('Titulo')).toHaveValue('Arroz');
  fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
  expect(screen.queryByText('Fila (1)')).not.toBeInTheDocument();
});

it('nao mostra a fila de outra conta nem a fila legada sem dono', () => {
  const cartaz = { ...cartazVazio('teste'), produto: 'SEGREDO OUTRO MERCADO' };
  localStorage.setItem('rotulei:fila-de-impressao', JSON.stringify([cartaz]));
  localStorage.setItem('rotulei:fila-de-impressao:outro:usuario', JSON.stringify([cartaz]));
  render(<EditorCartaz escopoFila="tenant:usuario" />);
  expect(screen.queryByText(cartaz.produto)).not.toBeInTheDocument();
  expect(screen.queryByText('Fila (1)')).not.toBeInTheDocument();
});

it('descarta itens corrompidos sem derrubar a tela e preserva os validos', () => {
  localStorage.setItem('rotulei:fila-de-impressao:tenant:usuario', JSON.stringify([
    null, 1, {}, { ...cartazVazio('ruim'), produto: {} }, cartazVazio('valido'),
  ]));
  render(<EditorCartaz escopoFila="tenant:usuario" />);
  expect(screen.getByText('Fila (1)')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
  expect(screen.getByLabelText('Titulo')).toHaveValue('');
});
