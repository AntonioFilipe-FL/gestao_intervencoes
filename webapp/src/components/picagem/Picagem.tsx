'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Camera, CameraOff, Download, Trash2, X, ArrowRightLeft, Flashlight, ZoomIn, ImageUp } from 'lucide-react'
import { locateImeis, registerTransfer } from '@/actions/stock'
import { applyIntranetForTransfer, getIntranetAccounts } from '@/actions/intranet-write'

/**
 * PWA de picagem: lê IMEIs por QR / código de barras (câmara do telemóvel: BarcodeDetector do Chrome Android + jsQR para os QR
 *   que o BarcodeDetector não apanha — pequenos, invertidos; ou por fotografia, com o foco da câmara do telemóvel)
 * ou por um leitor que escreve como teclado (pistola / terminal: escreve o código e carrega Enter).
 * Depois transfere todos para um armazém, com as mesmas opções da Transferência do Stock.
 */

type Opt = { id: string; name: string }
type Loc = { imei: string; warehouseId: string | null; warehouse: string | null }

// BarcodeDetector (Chrome Android) — ainda não está nos tipos do TypeScript
type DetectedBarcode = { rawValue: string }
type BarcodeDetectorT = { detect: (src: CanvasImageSource) => Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = { new (o?: { formats?: string[] }): BarcodeDetectorT; getSupportedFormats?: () => Promise<string[]> }
type InstallPrompt = Event & { prompt: () => Promise<void> }
type JsQR = (data: Uint8ClampedArray, w: number, h: number, o?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' }) => { data: string } | null
// capacidades da câmara (lanterna, zoom, foco) — ainda não estão nos tipos do TypeScript
type CamCaps = { torch?: boolean; zoom?: { min: number; max: number }; focusMode?: string[] }

const WANTED_FORMATS = ['qr_code', 'code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'itf', 'upc_a', 'data_matrix', 'pdf417', 'codabar']
const READ_ONLY = /^\s*(tr[aâ]nsito?|suspensos)\s*$/i
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })

/** IMEIs (15 dígitos) dentro do texto lido — um QR pode trazer vários ou texto à volta (ex.: "IMEI:35…") */
function extractImeis(text: string): string[] {
  const found = text.match(/(?<!\d)\d{15}(?!\d)/g) ?? []
  return [...new Set(found)]
}

export function Picagem({ destinations, isAdmin, userName }: { destinations: Opt[]; isAdmin: boolean; userName: string }) {
  const [imeis, setImeis] = useState<string[]>([])
  const [locs, setLocs] = useState<Map<string, Loc>>(new Map())
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null)
  const [typed, setTyped] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // lista atual (as leituras da câmara chegam fora do ciclo do React)
  const imeisRef = useRef<string[]>([])
  useEffect(() => { imeisRef.current = imeis }, [imeis])

  // ---------- adicionar IMEIs (de qualquer leitura) ----------
  const beep = useCallback((ok: boolean) => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.frequency.value = ok ? 1250 : 330; g.gain.value = 0.15
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (ok ? 0.09 : 0.25))
      o.onended = () => void ctx.close()
    } catch { /* sem som */ }
    try { navigator.vibrate?.(ok ? 60 : [80, 60, 80]) } catch { /* sem vibração */ }
  }, [])

  const addFromText = useCallback((text: string) => {
    const found = extractImeis(text)
    if (!found.length) {
      setFeedback({ tone: 'err', text: `Código sem IMEI (15 dígitos): ${text.slice(0, 40)}` })
      beep(false)
      return
    }
    const cur = imeisRef.current
    const novos = found.filter((i) => !cur.includes(i))
    if (!novos.length) { setFeedback({ tone: 'warn', text: `Já está na lista: ${found.join(', ')}` }); beep(false); return }
    setFeedback({ tone: 'ok', text: `${novos.length === 1 ? novos[0] : `${novos.length} IMEIs`} adicionado${novos.length === 1 ? '' : 's'}` })
    beep(true)
    imeisRef.current = [...novos.reverse(), ...cur]
    setImeis(imeisRef.current)
  }, [beep])

  // ---------- onde está cada IMEI (stock atual) ----------
  useEffect(() => {
    const missing = imeis.filter((i) => !locs.has(i))
    if (!missing.length) return
    const t = setTimeout(async () => {
      try {
        const r = await locateImeis(missing.join('\n'))
        setLocs((prev) => {
          const m = new Map(prev)
          for (const o of r.origins) for (const i of o.imeis) m.set(i, { imei: i, warehouseId: o.id, warehouse: o.name })
          for (const i of r.missing) m.set(i, { imei: i, warehouseId: null, warehouse: null })
          return m
        })
      } catch { /* tenta de novo na próxima alteração */ }
    }, 300)
    return () => clearTimeout(t)
  }, [imeis, locs])

  // ---------- câmara ----------
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const loopRef = useRef<number | null>(null)
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 })
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const jsqrRef = useRef<JsQR | null>(null)
  const detectorRef = useRef<BarcodeDetectorT | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [camOn, setCamOn] = useState(false)
  const [camError, setCamError] = useState<string | null>(null)
  const [caps, setCaps] = useState<{ torch: boolean; zoom: { min: number; max: number } | null }>({ torch: false, zoom: null })
  const [torch, setTorch] = useState(false)
  const [zoom, setZoom] = useState(1)

  /** leitores: BarcodeDetector (se o browser tiver) e jsQR (sempre; carregado só quando é preciso) */
  const loadReaders = useCallback(async () => {
    if (!jsqrRef.current) jsqrRef.current = (await import('jsqr')).default as unknown as JsQR
    const BD = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
    if (BD && !detectorRef.current) {
      try {
        const supported = (await BD.getSupportedFormats?.()) ?? WANTED_FORMATS
        const formats = WANTED_FORMATS.filter((f) => supported.includes(f))
        if (formats.length) detectorRef.current = new BD({ formats })
      } catch { /* sem BarcodeDetector: fica só o jsQR (QR) */ }
    }
  }, [])

  /** QR com jsQR numa imagem: recorte central (crop 0..1) reduzido a no máx. maxPx; tenta também a imagem invertida */
  const qrFrom = useCallback((src: CanvasImageSource, w: number, h: number, crop: number, maxPx: number): string | null => {
    const qr = jsqrRef.current
    if (!qr || !w || !h) return null
    const c = (canvasRef.current ??= document.createElement('canvas'))
    const cw = Math.round(w * crop), ch = Math.round(h * crop)
    const scale = Math.min(1, maxPx / Math.max(cw, ch))
    c.width = Math.max(1, Math.round(cw * scale)); c.height = Math.max(1, Math.round(ch * scale))
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(src, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, c.width, c.height)
    const img = ctx.getImageData(0, 0, c.width, c.height)
    return qr(img.data, c.width, c.height, { inversionAttempts: 'attemptBoth' })?.data ?? null
  }, [])

  const handleCode = useCallback((raw: string) => {
    const now = Date.now()
    // o mesmo código seguido só conta uma vez (2,5 s)
    if (raw === lastRef.current.code && now - lastRef.current.at < 2500) return
    lastRef.current = { code: raw, at: now }
    addFromText(raw)
  }, [addFromText])

  const stopCamera = useCallback(() => {
    if (loopRef.current) { window.clearInterval(loopRef.current); loopRef.current = null }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCamOn(false); setTorch(false); setZoom(1)
  }, [])

  const startCamera = useCallback(async () => {
    setCamError(null)
    if (!navigator.mediaDevices?.getUserMedia) { setCamError('Este browser não deixa usar a câmara aqui. Use "Fotografar código", o leitor ou escreva o IMEI.'); return }
    try {
      await loadReaders()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
      })
      streamRef.current = stream
      const track = stream.getVideoTracks()[0]
      const tc = (track.getCapabilities?.() ?? {}) as CamCaps
      // foco contínuo (se a câmara deixar): ajuda nos QR pequenos
      if (tc.focusMode?.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {})
      setCaps({ torch: !!tc.torch, zoom: tc.zoom && tc.zoom.max > tc.zoom.min ? tc.zoom : null })
      const v = videoRef.current!
      v.srcObject = stream
      await v.play()
      setCamOn(true)
      let busy = false
      let tick = 0
      loopRef.current = window.setInterval(async () => {
        if (busy || v.readyState < 2) return
        busy = true
        tick++
        try {
          let found = false
          if (detectorRef.current) {
            const codes = await detectorRef.current.detect(v)
            for (const c of codes) { found = true; handleCode(c.rawValue) }
          }
          // QR que o BarcodeDetector não apanhou: jsQR, alternando o centro (onde se aponta) e a imagem toda
          if (!found) {
            const raw = qrFrom(v, v.videoWidth, v.videoHeight, tick % 2 ? 0.6 : 1, tick % 2 ? 800 : 1000)
            if (raw) handleCode(raw)
          }
        } catch { /* frame sem leitura */ }
        busy = false
      }, 180)
    } catch (e) {
      stopCamera()
      setCamError((e as Error).name === 'NotAllowedError' ? 'Sem autorização para usar a câmara. Autorize nas definições do browser.' : `Não foi possível abrir a câmara: ${(e as Error).message}`)
    }
  }, [loadReaders, qrFrom, handleCode, stopCamera])
  useEffect(() => () => stopCamera(), [stopCamera])

  const applyTrack = useCallback(async (c: Record<string, unknown>) => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (track) await track.applyConstraints({ advanced: [c as MediaTrackConstraintSet] }).catch(() => {})
  }, [])
  const toggleTorch = () => { const t = !torch; setTorch(t); void applyTrack({ torch: t }) }
  const cycleZoom = () => {
    if (!caps.zoom) return
    const steps = [1, 2, 3].filter((z) => z >= caps.zoom!.min && z <= caps.zoom!.max)
    const next = steps[(steps.indexOf(zoom) + 1) % steps.length] ?? 1
    setZoom(next); void applyTrack({ zoom: next })
  }

  /** Fotografia do código (câmara do telemóvel, com o foco e a resolução toda): lê QR e códigos de barras */
  const readPhoto = useCallback(async (file: File) => {
    try {
      await loadReaders()
      const bmp = await createImageBitmap(file)
      let raws: string[] = []
      if (detectorRef.current) raws = (await detectorRef.current.detect(bmp).catch(() => [])).map((c) => c.rawValue)
      if (!raws.length) {
        for (const [crop, max] of [[1, 1600], [0.6, 1400], [1, 2400], [0.4, 1200]] as const) {
          const raw = qrFrom(bmp, bmp.width, bmp.height, crop, max)
          if (raw) { raws = [raw]; break }
        }
      }
      bmp.close()
      if (!raws.length) { setFeedback({ tone: 'err', text: 'Não encontrei nenhum código na fotografia. Tente mais perto e com o código direito.' }); beep(false); return }
      for (const r of raws) addFromText(r)
    } catch (e) {
      setFeedback({ tone: 'err', text: `Não foi possível ler a fotografia: ${(e as Error).message}` })
    }
  }, [loadReaders, qrFrom, addFromText, beep])

  // ---------- PWA: service worker e "Instalar" ----------
  const [install, setInstall] = useState<InstallPrompt | null>(null)
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/picagem-sw.js', { scope: '/picagem' }).catch(() => {})
    const onPrompt = (e: Event) => { e.preventDefault(); setInstall(e as InstallPrompt) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  // ---------- transferência ----------
  const [sheet, setSheet] = useState(false)
  const [busy, start] = useTransition()
  const [to, setTo] = useState('')
  const [withAcc, setWithAcc] = useState<'' | 'sim' | 'nao'>('')
  const [modality, setModality] = useState('')
  const [date, setDate] = useState(today())
  const [notes, setNotes] = useState('')
  const [intra, setIntra] = useState(false)
  const [intraAcc, setIntraAcc] = useState('')
  const [accounts, setAccounts] = useState<Opt[] | null>(null)
  const [result, setResult] = useState<{ tone: 'ok' | 'err'; lines: string[] } | null>(null)
  useEffect(() => {
    if (intra && accounts === null) getIntranetAccounts(true).then(setAccounts).catch(() => setAccounts([]))
  }, [intra, accounts])

  const list: Loc[] = imeis.map((i) => locs.get(i) ?? { imei: i, warehouseId: null, warehouse: null })
  const pending = imeis.some((i) => !locs.has(i))
  // vão: os que estão em stock, fora dos armazéns só de leitura e que não estão já no destino
  const movable = list.filter((l) => l.warehouseId && !READ_ONLY.test(l.warehouse ?? '') && l.warehouseId !== to)
  const origins = [...new Set(movable.map((l) => l.warehouseId!))]
  const byOrigin = origins.map((id) => ({ name: list.find((l) => l.warehouseId === id)!.warehouse, n: movable.filter((l) => l.warehouseId === id).length }))
  const skipped = list.filter((l) => !movable.includes(l))

  const openSheet = () => { setResult(null); setSheet(true); stopCamera() }
  const submit = () => start(async () => {
    const send = movable.map((l) => l.imei)
    const r = await registerTransfer({ fromWarehouseIds: origins, toWarehouseId: to, imeis: send.join('\n'), date, modality, notes, withAccessories: withAcc !== 'nao' })
    if (!r.ok) { setResult({ tone: 'err', lines: [r.error] }); beep(false); return }
    const lines = [`${r.n} IMEI(s) transferidos para ${destinations.find((d) => d.id === to)?.name}.`, ...r.warnings]
    let tone: 'ok' | 'err' = 'ok'
    if (intra && isAdmin) {
      const ir = await applyIntranetForTransfer({ imeis: send, accountId: intraAcc || undefined })
      if (!ir.ok) { tone = 'err'; lines.push(`Intranet: ${ir.error}`) }
      else {
        lines.push(`Intranet: ${ir.done} atualizado(s).`)
        if (ir.failed.length) { tone = 'err'; lines.push(`Intranet — não atualizados ${ir.failed.length}: ${ir.failed.slice(0, 5).map((x) => `${x.imei} (${x.error})`).join('; ')}`) }
      }
    }
    beep(tone === 'ok')
    setResult({ tone, lines })
    // tira da lista os transferidos; ficam os que não foram (para ver o que falta)
    setImeis((cur) => cur.filter((i) => !send.includes(i)))
    setLocs((prev) => { const m = new Map(prev); for (const i of send) m.delete(i); return m })
    setSheet(false)
    setTo(''); setWithAcc(''); setModality(''); setNotes(''); setIntra(false); setIntraAcc(''); setDate(today())
  })

  const field = 'h-11 w-full rounded-[2px] border border-fc-dark-40 bg-white px-3 text-[16px] text-fc-dark-100 outline-none focus:border-fc-light-60'

  return (
    <div className="flex min-h-screen flex-col bg-fc-grey-100 pb-24">
      {/* topo */}
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-fc-dark-100 px-4 py-3 text-white" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold tracking-[0.04em] uppercase">Picagem</p>
          <p className="truncate text-[12px] text-white/70">{userName}</p>
        </div>
        {install && (
          <button type="button" onClick={() => { void install.prompt(); setInstall(null) }} className="flex items-center gap-1 rounded-[2px] border border-white/40 px-3 py-2 text-[13px]">
            <Download className="size-4" /> Instalar
          </button>
        )}
        <span className="rounded-full bg-fc-red px-3 py-1 text-[15px] font-bold tabular-nums">{imeis.length}</span>
      </header>

      <div className="space-y-3 p-4">
        {/* câmara */}
        <div className="overflow-hidden rounded-[2px] border border-fc-dark-20 bg-black">
          <div className={camOn ? 'relative' : 'hidden'}>
            <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" />
            {/* zona de leitura: apontar o código para o centro */}
            <div className="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-[4px] border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
            <div className="pointer-events-none absolute inset-x-[20%] top-1/2 h-0.5 -translate-y-1/2 bg-fc-red shadow-[0_0_8px_#cf0a2c]" />
            <div className="absolute right-2 bottom-2 flex gap-2">
              {caps.torch && (
                <button type="button" onClick={toggleTorch} aria-label="Lanterna" className={`rounded-full p-3 ${torch ? 'bg-yellow-300 text-black' : 'bg-black/60 text-white'}`}>
                  <Flashlight className="size-5" />
                </button>
              )}
              {caps.zoom && (
                <button type="button" onClick={cycleZoom} aria-label="Zoom" className="flex items-center gap-1 rounded-full bg-black/60 px-3 py-2 text-[14px] font-bold text-white">
                  <ZoomIn className="size-5" /> {zoom}×
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto]">
            <button type="button" onClick={() => (camOn ? stopCamera() : void startCamera())}
              className="flex h-14 items-center justify-center gap-2 bg-fc-dark-100 text-[16px] font-bold uppercase tracking-[0.03em] text-white">
              {camOn ? <><CameraOff className="size-5" /> Parar câmara</> : <><Camera className="size-5" /> Ler com a câmara</>}
            </button>
            <button type="button" onClick={() => { stopCamera(); fileRef.current?.click() }} title="Tirar uma fotografia ao código (usa o foco da câmara do telemóvel)"
              className="flex h-14 items-center gap-2 border-l border-white/20 bg-fc-dark-100 px-4 text-[13px] font-bold uppercase text-white">
              <ImageUp className="size-5" /> Foto
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void readPhoto(f); e.target.value = '' }} />
        </div>
        {camError && <p className="bg-fc-warning/15 px-3 py-2 text-[13px]">{camError}</p>}
        {camOn && <p className="text-center text-[12px] text-fc-dark-60">Aponte o código para o quadrado. QR pequenos: aproxime ou use o zoom; se não ler, use <b>Foto</b>.</p>}

        {/* leitor (escreve como teclado + Enter) ou escrita à mão */}
        <form onSubmit={(e) => { e.preventDefault(); if (typed.trim()) addFromText(typed); setTyped(''); inputRef.current?.focus() }} className="flex gap-2">
          <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus enterKeyHint="done"
            placeholder="Leitor de códigos ou escrever IMEI" className={field} aria-label="IMEI" />
          <button type="submit" className="h-11 shrink-0 rounded-[2px] bg-fc-light-100 px-4 text-[14px] font-bold uppercase text-white">OK</button>
        </form>

        {feedback && (
          <p className={feedback.tone === 'ok' ? 'bg-fc-success/20 px-3 py-2 text-[14px] text-[#4b850d]' : feedback.tone === 'warn' ? 'bg-fc-warning/20 px-3 py-2 text-[14px] text-[#8a5a00]' : 'bg-fc-danger/20 px-3 py-2 text-[14px] text-[#b31d25]'}>
            {feedback.text}
          </p>
        )}
        {result && (
          <div className={result.tone === 'ok' ? 'space-y-1 bg-fc-success/20 px-3 py-2 text-[14px] text-[#4b850d]' : 'space-y-1 bg-fc-danger/20 px-3 py-2 text-[14px] text-[#b31d25]'}>
            {result.lines.map((l, i) => <p key={i}>{l}</p>)}
          </div>
        )}

        {/* lista */}
        {imeis.length > 0 && (
          <div className="divide-y divide-fc-dark-10 border border-fc-dark-20 bg-white">
            {list.map((l) => (
              <div key={l.imei} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[15px]">{l.imei}</p>
                  <p className={`text-[12px] ${!locs.has(l.imei) ? 'text-fc-dark-60' : l.warehouseId ? (READ_ONLY.test(l.warehouse ?? '') ? 'text-[#8a5a00]' : 'text-fc-dark-60') : 'text-[#b31d25]'}`}>
                    {!locs.has(l.imei) ? 'a procurar…' : l.warehouseId ? `${l.warehouse}${READ_ONLY.test(l.warehouse ?? '') ? ' · só de leitura, não se transfere' : ''}` : 'Sem stock na app — não se transfere'}
                  </p>
                </div>
                <button type="button" aria-label={`Retirar ${l.imei}`} onClick={() => { setImeis((c) => c.filter((x) => x !== l.imei)) }} className="p-2 text-fc-dark-60">
                  <X className="size-5" />
                </button>
              </div>
            ))}
          </div>
        )}
        {!imeis.length && <p className="py-6 text-center text-[14px] text-fc-dark-60">Pique os IMEIs com a câmara ou com o leitor. Podem ser vários.</p>}
      </div>

      {/* barra de baixo */}
      {imeis.length > 0 && !sheet && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-fc-dark-20 bg-white p-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={() => { if (confirm(`Limpar os ${imeis.length} IMEI(s) da lista?`)) { setImeis([]); setFeedback(null) } }}
            className="flex h-12 items-center gap-1 rounded-[2px] border border-fc-dark-40 px-4 text-[14px] uppercase"><Trash2 className="size-4" /> Limpar</button>
          <button type="button" onClick={openSheet} disabled={pending}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[2px] bg-fc-red text-[15px] font-bold uppercase text-white disabled:opacity-60">
            <ArrowRightLeft className="size-5" /> {pending ? 'A procurar…' : `Transferir ${imeis.length}`}
          </button>
        </div>
      )}

      {/* transferência */}
      {sheet && (
        <div className="fixed inset-0 z-30 overflow-y-auto bg-fc-grey-100">
          <header className="sticky top-0 flex items-center gap-3 bg-fc-dark-100 px-4 py-3 text-white" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
            <p className="flex-1 text-[16px] font-bold uppercase">Transferir</p>
            <button type="button" onClick={() => setSheet(false)} aria-label="Fechar" className="p-1"><X className="size-6" /></button>
          </header>
          <div className="space-y-4 p-4 pb-28">
            <div className="space-y-1.5">
              <label className="fc-label" htmlFor="pk-to">Armazém de destino *</label>
              <select id="pk-to" value={to} onChange={(e) => setTo(e.target.value)} className={field}>
                <option value="">Escolha…</option>
                {destinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <div className="space-y-2 border border-fc-dark-20 bg-white px-3 py-3">
              <p className="fc-label">O que transferir? *</p>
              <label className="flex items-center gap-3 text-[15px]">
                <input type="radio" name="pk-acc" className="size-5" checked={withAcc === 'sim'} onChange={() => setWithAcc('sim')} />
                Equipamento e acessórios (conjunto)
              </label>
              <label className="flex items-center gap-3 text-[15px]">
                <input type="radio" name="pk-acc" className="size-5" checked={withAcc === 'nao'} onChange={() => setWithAcc('nao')} />
                Só o equipamento
              </label>
              <p className="text-[12px] text-fc-dark-60">Os acessórios do kit só se movimentam nas transferências do A1/A2 para o armazém de um técnico.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="fc-label" htmlFor="pk-mod">Venda / Aluguer</label>
                <select id="pk-mod" value={modality} onChange={(e) => setModality(e.target.value)} className={field}>
                  <option value="">Mantém</option>
                  <option value="Venda">Venda</option>
                  <option value="Aluguer">Aluguer</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="fc-label" htmlFor="pk-date">Data</label>
                <input id="pk-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="fc-label" htmlFor="pk-notes">Observações</label>
              <input id="pk-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: guia de remessa, técnico…" className={field} />
            </div>

            {isAdmin && (
              <div className="space-y-2 border border-fc-dark-20 bg-white px-3 py-3">
                <label className="flex items-center gap-3 text-[15px] font-bold">
                  <input type="checkbox" className="size-5" checked={intra} onChange={(e) => setIntra(e.target.checked)} />
                  Atualizar na Intranet
                </label>
                <p className="text-[12px] text-fc-dark-60">Matrícula XX_Ay_ZZZ_12345 do armazém de destino (A1/A2 → FL; y = 1 Venda / 2 Aluguer; ZZZ = operador do cartão). Os dados do equipamento (PIN, MSISDN, operador) não mudam.</p>
                {intra && (
                  <div className="space-y-1.5">
                    <label className="fc-label" htmlFor="pk-acc2">Transferir para a conta Intranet (opcional)</label>
                    <select id="pk-acc2" value={intraAcc} onChange={(e) => setIntraAcc(e.target.value)} className={field}>
                      <option value="">Manter a conta atual</option>
                      {(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* resumo */}
            <div className="space-y-1 border border-fc-dark-20 bg-white px-3 py-3 text-[14px]">
              <p className="font-bold">{movable.length} IMEI(s) a transferir</p>
              {byOrigin.map((o) => <p key={o.name} className="text-fc-dark-60">de {o.name}: {o.n}</p>)}
              {skipped.length > 0 && (
                <p className="text-[#8a5a00]">Não vão ({skipped.length}): {skipped.slice(0, 6).map((s) => `${s.imei} (${!s.warehouseId ? 'sem stock' : s.warehouseId === to ? 'já no destino' : 'só de leitura'})`).join(', ')}{skipped.length > 6 ? '…' : ''}</p>
              )}
            </div>
          </div>

          <div className="fixed inset-x-0 bottom-0 flex gap-2 border-t border-fc-dark-20 bg-white p-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <button type="button" onClick={() => setSheet(false)} className="h-12 rounded-[2px] border border-fc-dark-40 px-4 text-[14px] uppercase">Voltar</button>
            <button type="button" onClick={submit} disabled={busy || !to || !withAcc || !movable.length}
              className="h-12 flex-1 rounded-[2px] bg-fc-red text-[15px] font-bold uppercase text-white disabled:opacity-50">
              {busy ? 'A transferir…' : `Confirmar ${movable.length}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
