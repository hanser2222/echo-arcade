function secureUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new TypeError('播放器来源必须是公开 HTTPS 地址');
  return url.href;
}

export function buildFullSource(full, {protocol='https:'} = {}) {
  if (full?.type === 'youtube' && /^[A-Za-z0-9_-]{11}$/.test(full.videoId)) {
    const pageUrl = `https://www.youtube.com/watch?v=${full.videoId}`;
    const provider = full.origin === 'community' ? 'YouTube（公开上传）' : 'YouTube';
    // file:// and other opaque origins cannot supply YouTube's required HTTP Referer.
    if (!['http:','https:'].includes(protocol)) {
      return {kind:'external', pageUrl, provider, reason:protocol === 'file:' ? 'local-file' : 'unsupported-origin'};
    }
    return {kind:'embed', src:`https://www.youtube-nocookie.com/embed/${full.videoId}?autoplay=1&rel=0&playsinline=1`, pageUrl, provider};
  }
  if (full?.type === 'bandcamp' && /^\d+$/.test(full.albumId) && /^\d+$/.test(full.trackId)) {
    return { kind:'embed', src:`https://bandcamp.com/EmbeddedPlayer/album=${full.albumId}/size=large/bgcol=ffffff/linkcol=315542/tracklist=false/track=${full.trackId}/transparent=true/`, pageUrl:secureUrl(full.url), provider:'Bandcamp' };
  }
  if (full?.type === 'audio') {
    return { kind:'audio', src:secureUrl(full.url), pageUrl:secureUrl(full.sourceUrl || full.url), provider:'官方音源' };
  }
  throw new TypeError('没有有效的完整版来源');
}

export function getPlaybackLimit(duration, {full=false, unlocked=false} = {}) {
  const known = Number.isFinite(duration) && duration > 0;
  if (full && unlocked) return known ? duration : Infinity;
  return known ? Math.min(30,duration) : 30;
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(Math.floor(seconds % 60)).padStart(2,'0')}`;
}
