import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 402 Payment Required — o tenant existe e o usuario e valido, mas a conta
 * esta inadimplente (Opcao B, DECISOES.md #18). Distinto de 401 (sem sessao) e
 * 403 (sessao valida, papel sem permissao): aqui a acao que falta e pagar, nao
 * logar de novo nem trocar de usuario. O frontend usa o status para
 * redirecionar a tela de cobranca em vez de mostrar um erro generico.
 */
export class TenantBloqueadoException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'Payment Required',
        message:
          'Sua conta esta com o pagamento pendente. Regularize para continuar usando o Rotulei.',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
