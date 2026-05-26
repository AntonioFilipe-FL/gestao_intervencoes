import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full p-8 bg-white rounded-xl shadow-lg text-center space-y-6 border border-red-100">
        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-2">
          <svg className="w-10 h-10 text-[#cf0a2c]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Acesso Restrito</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Lamentamos, mas o seu endereço de email não consta na lista de utilizadores autorizados para aceder a esta plataforma técnica.
          </p>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg text-xs text-gray-400 italic">
          Se considera que isto é um erro, por favor contacte o administrador do sistema da Frotcom.
        </div>
        <div className="pt-4">
          <Button asChild className="w-full bg-[#cf0a2c] hover:bg-[#b00926]">
            <Link href="/login">Voltar para o Login</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
