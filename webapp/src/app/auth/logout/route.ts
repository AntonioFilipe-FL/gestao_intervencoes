import { NextResponse } from 'next/server'
import { deleteSession } from '@/lib/session'
import { appUrl } from '@/lib/google'

export async function POST(request: Request) {
  await deleteSession()
  return NextResponse.redirect(`${appUrl(request)}/login`, { status: 303 })
}
