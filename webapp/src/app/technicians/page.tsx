import { createClient } from '@/utils/supabase/server'

export default async function TechniciansPage() {
  const supabase = await createClient()
  const { data: technicians, error } = await supabase
    .schema('gestao_interv')
    .from('technicians')
    .select('*')
    .order('name')

  if (error) {
    return <div>Erro ao carregar técnicos: {error.message}</div>
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Lista de Técnicos</h1>
      {technicians?.length === 0 ? (
        <p>Nenhum técnico encontrado.</p>
      ) : (
        <ul className="list-disc pl-5">
          {technicians?.map((tech) => (
            <li key={tech.id} className={tech.active ? 'text-green-600' : 'text-gray-400'}>
              {tech.name} {tech.active ? '(Ativo)' : '(Inativo)'}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-8">
        <a href="/" className="text-blue-500 hover:underline">Voltar à Home</a>
      </div>
    </div>
  )
}
