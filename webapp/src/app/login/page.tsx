import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ERRORS: Record<string, string> = {
  state: 'A sessão de login expirou. Tente novamente.',
  email: 'A conta Google não tem um email verificado.',
  oauth: 'Não foi possível concluir o login com Google. Tente novamente.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-fc-dark-100 p-4">
      <div className="w-full max-w-sm border-t-4 border-fc-red bg-white p-8 shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
        <div className="space-y-1 text-center">
          <p className="text-[15px] font-bold tracking-[0.04em] uppercase">Frotcom</p>
          <h1 className="font-light">Gestão de intervenções</h1>
          <p className="fc-small pt-2 text-fc-dark-60">Entre com a sua conta Google da empresa.</p>
        </div>
        
        {error && (
          <p className="mt-6 bg-fc-danger/20 px-3 py-2 text-center text-[13px] text-[#b31d25]">{ERRORS[error] ?? ERRORS.oauth}</p>
        )}

        <div className="mt-8">
          <a
            href="/auth/google"
            className={cn(buttonVariants({ variant: 'inverse', size: 'lg' }), 'w-full gap-3')}
          >
            <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Entrar com Google
          </a>
        </div>
      </div>
    </div>
  )
}
