import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'

export default async function TechniciansPage() {
  await requireUser()
  const technicians = await sql<{ id: string; name: string; active: boolean }[]>`select id, name, active from technicians order by name`

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
