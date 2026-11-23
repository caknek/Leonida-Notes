// Puentes nativos (Capacitor) con alternativa web
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { state } from './store.js';

export const isNative = Capacitor.isNativePlatform();
export { ImpactStyle };

export async function tap(style = ImpactStyle.Light) {
  if (!isNative) return;
  try { await Haptics.impact({ style }); } catch {}
}
export async function openUrl(url) {
  if (isNative) await Browser.open({ url, toolbarColor: '#0a1220', presentationStyle: 'fullscreen' });
  else { window.__ignOpened = true; window.open(url, '_blank', 'noopener'); }
}

// Guía de voz
export async function speak(text, force = false) {
  if (!force && !state.settings.voice) return;
  const rate = state.settings.voiceRate || 1;
  try {
    if (isNative) {
      await TextToSpeech.stop().catch(() => {});
      await TextToSpeech.speak({ text, lang: 'es-ES', rate, pitch: 1.05, volume: 1, category: 'playback' });
    } else if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES'; u.rate = rate; u.pitch = 1.05;
      speechSynthesis.speak(u);
    }
  } catch (e) { console.warn('TTS', e); }
}
export async function stopSpeak() {
  try { if (isNative) await TextToSpeech.stop(); else speechSynthesis?.cancel(); } catch {}
}

// Archivos: compartir / descargar
const blobToBase64 = (b) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(b); });
export async function shareBlob(blob, filename, title = filename) {
  if (isNative) {
    const res = await Filesystem.writeFile({ path: filename, data: await blobToBase64(blob), directory: Directory.Cache });
    await Share.share({ title, files: [res.uri], dialogTitle: title });
  } else {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title }); return; } catch {} }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
}
export async function shareJson(obj, filename) {
  if (isNative) {
    const res = await Filesystem.writeFile({ path: filename, data: JSON.stringify(obj), directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: filename, files: [res.uri], dialogTitle: 'Enviar archivo' });
  } else {
    await shareBlob(new Blob([JSON.stringify(obj)], { type: 'application/json' }), filename);
  }
}
export async function shareText(title, text) {
  try {
    if (isNative || navigator.share) await Share.share({ title, text });
    else { await navigator.clipboard.writeText(text); return 'copied'; }
  } catch {}
}

// Aviso cuando el usuario vuelve del navegador interno (p. ej. desde el mapa de IGN)
const browserClosedFns = [];
export const onBrowserClosed = (fn) => browserClosedFns.push(fn);
if (isNative) Browser.addListener('browserFinished', () => browserClosedFns.forEach((f) => f()));
else window.addEventListener('focus', () => { if (window.__ignOpened) { window.__ignOpened = false; browserClosedFns.forEach((f) => f()); } });
