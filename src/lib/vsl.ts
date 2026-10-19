// VSL do Grupo VIP: link do YouTube/Vimeo (ou de um player com /embed) vira iframe; o resto é arquivo de vídeo.

/** endereço do iframe já com autoplay mudo, ou null quando o link é de um arquivo de vídeo */
export function vslEmbed(url: string): string | null {
  const yt = /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/.exec(url);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1`;
  const vm = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}?autoplay=1&muted=1&playsinline=1`;
  return /^https:\/\/[^/]+\/.*embed/i.test(url) ? url : null;
}
