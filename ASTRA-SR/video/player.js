(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const film = $('film'), seek = $('seek'), player = $('player');
  const sources = {
    '720': 'media/astra-sr-v6-720p60-web.mp4',
    '1080': 'media/astra-sr-v6-1080p60-web.mp4'
  };
  let pendingTime = null, scrubbing = false, scrubResume = false;
  let restore = null, seekTimer = 0, statusTimer = 0;
  const duration = () => Number.isFinite(film.duration) ? film.duration : 72;
  const clamp = n => Math.max(0, Math.min(duration(), Number(n) || 0));
  const format = n => {
    n = Math.max(0, Math.floor(n || 0));
    return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  };
  const position = () => pendingTime ?? restore?.time ?? film.currentTime;

  function drawTime(value = position()) {
    const t = clamp(value), total = duration(), text = `${format(t)} / ${format(total)}`;
    seek.max = total;
    seek.value = t;
    seek.style.setProperty('--played', `${100 * t / total}%`);
    seek.setAttribute('aria-valuetext', text);
    $('time').textContent = $('elapsed').textContent = text;
    let buffered = 0;
    for (let i = 0; i < film.buffered.length; i++) {
      if (film.buffered.start(i) <= t + .1 && film.buffered.end(i) >= t) buffered = film.buffered.end(i);
    }
    seek.style.setProperty('--buffered', `${100 * Math.max(t, buffered) / total}%`);
  }
  function showStatus(message, delay = 0) {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      $('play-status').textContent = message;
      $('play-status').hidden = false;
    }, delay);
  }
  function hideStatus() {
    clearTimeout(statusTimer);
    $('play-status').hidden = true;
  }
  function updatePlay() {
    const playing = restore ? restore.resume : !film.paused;
    $('play').textContent = playing ? '暂停' : '播放';
    $('play').setAttribute('aria-label', playing ? '暂停视频' : '播放视频');
  }
  function play() {
    if (restore) { restore.resume = true; updatePlay(); return; }
    if (film.ended) seekTo(0);
    film.play().catch(error => {
      if (error.name !== 'AbortError') showStatus('点击播放继续观看');
    });
  }
  function pause() {
    if (restore) restore.resume = false;
    film.pause(); updatePlay();
  }
  function togglePlay() {
    if (restore ? restore.resume : !film.paused) pause();
    else play();
  }
  function commitSeek() {
    clearTimeout(seekTimer); seekTimer = 0;
    if (pendingTime === null) return;
    if (restore) { restore.time = pendingTime; return; }
    if (film.readyState < 1) return;
    if (Math.abs(film.currentTime - pendingTime) < .01) {
      pendingTime = null; drawTime(); return;
    }
    film.currentTime = pendingTime;
  }
  function seekTo(value, delayed = false) {
    pendingTime = clamp(value);
    if (restore) restore.time = pendingTime;
    drawTime(pendingTime);
    clearTimeout(seekTimer);
    if (delayed) seekTimer = setTimeout(commitSeek, 100);
    else commitSeek();
  }
  function seekBy(delta) { seekTo(position() + delta, true); }
  function beginScrub() {
    if (scrubbing) return;
    scrubbing = true;
    scrubResume = restore ? restore.resume : !film.paused;
    pause();
    clearTimeout(seekTimer);
  }
  function finishScrub() {
    if (!scrubbing) return;
    const target = Number(seek.value);
    scrubbing = false;
    seekTo(target);
    if (scrubResume) play();
  }

  seek.addEventListener('pointerdown', beginScrub);
  seek.addEventListener('input', () => {
    beginScrub();
    pendingTime = clamp(seek.value);
    drawTime(pendingTime);
  });
  seek.addEventListener('change', finishScrub);
  window.addEventListener('pointerup', finishScrub);
  window.addEventListener('pointercancel', finishScrub);
  $('play').addEventListener('click', togglePlay);
  film.addEventListener('click', togglePlay);
  $('back').addEventListener('click', () => seekBy(-5));
  $('forward').addEventListener('click', () => seekBy(5));
  document.querySelectorAll('[data-t]').forEach(button => button.addEventListener('click', () => {
    seekTo(Number(button.dataset.t)); play();
  }));

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const target = event.target;
    if (target.closest('textarea,select,[contenteditable="true"]') ||
        (target.matches('input') && target !== seek)) return;
    const key = event.key.toLowerCase();
    if (key === 'a' || key === 'arrowleft' || key === 'd' || key === 'arrowright') {
      event.preventDefault(); event.stopPropagation();
      seekBy(key === 'a' || key === 'arrowleft' ? -5 : 5);
    } else if (event.code === 'Space' && !target.closest('button,a,input')) {
      event.preventDefault();
      if (!event.repeat) togglePlay();
    }
  }, true);

  $('quality').addEventListener('change', () => {
    const selected = $('quality').value;
    const time = position(), resume = restore ? restore.resume : !film.paused;
    clearTimeout(seekTimer);
    restore = {time, resume};
    pendingTime = time;
    film.pause();
    film.src = sources[selected];
    film.load();
    showStatus('正在切换画质…', 250);
    updatePlay();
  });
  $('mute').addEventListener('click', () => { film.muted = !film.muted; });
  film.addEventListener('volumechange', () => {
    $('mute').textContent = film.muted ? '开声音' : '静音';
    $('mute').setAttribute('aria-pressed', String(film.muted));
    $('mute').setAttribute('aria-label', film.muted ? '开启声音' : '静音');
  });
  $('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (player.requestFullscreen) await player.requestFullscreen();
      else if (film.webkitEnterFullscreen) film.webkitEnterFullscreen();
    } catch { showStatus('可使用浏览器的全屏按钮'); }
  });
  document.addEventListener('fullscreenchange', () => {
    $('fullscreen').textContent = document.fullscreenElement ? '退出全屏' : '全屏';
  });

  film.addEventListener('loadedmetadata', () => {
    const saved = restore;
    restore = null;
    if (saved) pendingTime = saved.time;
    commitSeek(); drawTime();
    if (saved?.resume) play();
    else updatePlay();
  });
  film.addEventListener('seeked', () => {
    if (scrubbing || seekTimer || restore) return;
    if (pendingTime !== null && Math.abs(film.currentTime - pendingTime) > .1) {
      commitSeek(); return;
    }
    pendingTime = null; hideStatus(); drawTime();
  });
  film.addEventListener('timeupdate', () => { if (!scrubbing) drawTime(); });
  film.addEventListener('progress', () => { if (!scrubbing) drawTime(); });
  film.addEventListener('seeking', () => { if (!scrubbing) showStatus('正在跳转…', 350); });
  film.addEventListener('waiting', () => { if (!scrubbing) showStatus('正在缓冲…', 500); });
  film.addEventListener('canplay', hideStatus);
  film.addEventListener('playing', hideStatus);
  film.addEventListener('play', updatePlay);
  film.addEventListener('pause', updatePlay);
  film.addEventListener('ended', () => { pendingTime = null; updatePlay(); drawTime(); });
  film.addEventListener('error', () => showStatus('视频暂时未能加载，请刷新或使用下方下载链接'));
  film.controls = false;
  $('player-controls').hidden = false;
  drawTime(); updatePlay();
})();
