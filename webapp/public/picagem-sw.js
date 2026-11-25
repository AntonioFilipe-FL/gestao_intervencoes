/*
 * Service worker da PWA "Picagem" (âmbito /picagem).
 * Não guarda dados nem páginas em cache: a picagem precisa sempre do servidor (stock em tempo real).
 * Só mostra uma página simples quando não há rede, em vez do erro do browser.
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request).catch(() => new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Picagem</title><body style="font-family:sans-serif;background:#263646;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px">' +
      '<div><h2>Sem ligação</h2><p>A picagem precisa de rede para ver e transferir o stock.</p>' +
      '<button onclick="location.reload()" style="padding:12px 20px;font-size:16px">Tentar de novo</button></div></body>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )),
  )
})
