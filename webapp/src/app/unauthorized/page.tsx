import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-fc-dark-100 p-4">
      <div className="w-full max-w-md space-y-5 border-t-4 border-fc-red bg-white p-8 text-center shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
        <div className="mx-auto flex size-14 items-center justify-center bg-fc-danger/15">
          <svg className="size-7 text-fc-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="space-y-2">
          <h1>Acesso restrito</h1>
          <p className="text-fc-dark-80">
            Lamentamos, mas o seu endereço de email não consta na lista de utilizadores autorizados para aceder a esta plataforma técnica.
          </p>
        </div>
        <div className="bg-fc-grey-100 px-4 py-3 fc-small text-fc-dark-60">
          Se considera que isto é um erro, por favor contacte o administrador do sistema da Frotcom.
        </div>
        <div className="pt-4">
          <Link href="/login" className={buttonVariants({ variant: 'secondary', size: 'lg', className: 'w-full' })}>
            Voltar para o Login
          </Link>
        </div>
      </div>
    </div>
  )
}
