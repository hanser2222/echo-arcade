import { catalog } from './catalog.mjs';
import { createSession, answerRound, skipRound, nextRound, getFullTrack } from './game.mjs';
import { buildFullSource, getPlaybackLimit, formatTime } from './media.mjs';

const $ = id => document.getElementById(id);
const paths = {
  play:'<path d="m9 5 11 7-11 7z" fill="currentColor" stroke="none"/>',
  pause:'<path d="M8 5v14M16 5v14" stroke-width="4"/>',
  replay:'<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
  volume:'<path d="M4 9h4l5-4v14l-5-4H4zM17 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  link:'<path d="M14 4h6v6m0-6L10 14M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
};
const icon = (name, cls='') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML=icon(node.dataset.icon); });
const audio = new Audio();
audio.preload='none';
audio.volume=0.65;
let currentMode='easy';
let session=createSession(catalog,{mode:currentMode});
let generation=0;
let mediaState='idle';
let previousVolume=audio.volume;
const modeName = () => currentMode==='easy' ? '简单模式' : '困难模式';
const clipLength = () => getPlaybackLimit(audio.duration);

function readBest(mode) {
  try {
    const value=localStorage.getItem(`echo-arcade-best-${mode}`);
    return Math.max(0,Number(value ?? (mode==='easy' ? localStorage.getItem('echo-arcade-best') : 0)) || 0);
  } catch { return 0; }
}

function updatePlayback() {
  const playing=!audio.paused && mediaState==='playing';
  $('turntable').classList.toggle('playing',playing);
  $('equalizer').classList.toggle('active',playing);
  $('play-icon').innerHTML=icon(playing?'pause':'play');
  $('play').setAttribute('aria-label',playing?'暂停音乐':mediaState==='error'?'重试播放音乐':'播放音乐');
  $('record-play').setAttribute('aria-label',playing?'点击唱片暂停音乐':'点击唱片播放音乐');
  $('on-air-text').textContent=playing?'NOW ON AIR':mediaState==='loading'?'TUNING IN...':mediaState==='ended'?'PLAY IT AGAIN':currentMode==='hard'?'DEEP CUTS RADIO':'READY TO PLAY';
  $('audio-message').classList.toggle('error',mediaState==='error');
  const messages={idle:'答题前试听 30 秒，可以反复听，不计时。',loading:'正在接通这段旋律…',playing:'正在试听 · 答题后，无论对错都能听完整版。',paused:'已暂停，点击播放继续试听。',ended:'试听结束，可以重听；作答后解锁完整版。',error:'这首暂时没连上，点击播放重试，或跳过并听完整版。'};
  $('audio-message').textContent=messages[mediaState] || messages.idle;
}

function updateTimeline() {
  const duration=clipLength();
  const current=Math.min(audio.currentTime || 0,duration);
  $('current-time').textContent=formatTime(current);
  $('duration').textContent=formatTime(duration);
  $('seek').max=duration;
  $('seek').value=current;
  $('seek').style.setProperty('--progress',`${duration ? current/duration*100 : 0}%`);
}

function closeFullPlayer() {
  $('full-player-content').querySelectorAll('audio,video').forEach(media => { media.pause(); media.removeAttribute('src'); media.load(); });
  $('full-player-content').querySelectorAll('iframe').forEach(frame => { frame.src='about:blank'; });
  $('full-player-content').replaceChildren();
  $('full-player-panel').hidden=true;
}

function prepareAudio() {
  generation++;
  audio.pause();
  closeFullPlayer();
  mediaState='idle';
  audio.src=session.rounds[session.index].track.preview;
  audio.load();
  updatePlayback();
  updateTimeline();
}

async function playAudio(fromStart=false) {
  if (session.phase==='complete') return;
  closeFullPlayer();
  const requestGeneration=generation;
  if (mediaState==='error') audio.load();
  if (fromStart || audio.currentTime>=clipLength()-0.1) audio.currentTime=0;
  mediaState='loading';
  updatePlayback();
  try {
    await audio.play();
    if (requestGeneration!==generation) return;
    mediaState='playing';
    updatePlayback();
  } catch(error) {
    if (requestGeneration!==generation || error.name==='AbortError') return;
    mediaState=error.name==='NotAllowedError'?'paused':'error';
    updatePlayback();
  }
}

function toggleAudio() {
  if (!audio.paused) { audio.pause(); mediaState='paused'; updatePlayback(); }
  else playAudio();
}

audio.addEventListener('playing',()=>{mediaState='playing';updatePlayback();});
audio.addEventListener('waiting',()=>{mediaState='loading';updatePlayback();});
audio.addEventListener('error',()=>{mediaState='error';updatePlayback();});
audio.addEventListener('loadedmetadata',updateTimeline);
audio.addEventListener('timeupdate',()=>{
  if (audio.currentTime>=clipLength()) {audio.pause();mediaState='ended';updatePlayback();}
  updateTimeline();
});
audio.addEventListener('ended',()=>{mediaState='ended';updatePlayback();});
audio.addEventListener('pause',()=>{if(mediaState==='playing'){mediaState='paused';updatePlayback();}});

function openFullTrack(index=session.index) {
  const full=getFullTrack(session,index);
  if (!full) return;
  const track=session.history[index].track;
  const source=buildFullSource(full,{protocol:window.location.protocol});
  generation++;
  audio.pause();
  mediaState='paused';
  updatePlayback();
  closeFullPlayer();
  $('full-player-panel').hidden=false;
  $('full-player-title').textContent=track.title;
  $('full-player-credit').textContent=`${track.game} · ${track.artist}`;
  $('full-player-source').href=source.pageUrl;
  $('full-player-source').textContent=`在 ${source.provider} 打开整首 ↗`;
  $('full-player-status').textContent=full.origin==='community'?'公开上传的完整游戏版；不受答题试听时长限制，也可打开来源页聆听。':'已解锁整首，不受答题试听时长限制；也可打开来源页聆听。';
  if (source.kind==='embed') {
    const frame=document.createElement('iframe');
    frame.src=source.src;
    frame.title=`${track.title} 完整版`;
    frame.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';
    frame.allowFullscreen=true;
    frame.referrerPolicy='strict-origin-when-cross-origin';
    $('full-player-content').append(frame);
  } else if (source.kind==='external') {
    const card=document.createElement('div');
    card.className='full-player-external';
    card.innerHTML=`<span class="eyebrow">FULL TRACK · 在来源页继续听</span><h3>整首旋律，已经为你解锁。</h3><p>${source.reason==='local-file'?'直接打开的本地文件无法使用 YouTube 内嵌播放器。':'当前打开方式无法使用 YouTube 内嵌播放器。'}点击下方按钮，即可在 YouTube 收听完整歌曲。</p><a class="full-external-link" href="${escapeHtml(source.pageUrl)}" target="_blank" rel="noopener noreferrer">${icon('play')} 在 YouTube 播放整首 ${icon('link')}</a>${source.reason==='local-file'?'<p class="full-local-hint">想留在本页听？使用本地版文件包中的“启动回声电台.cmd”打开游戏。</p>':''}`;
    $('full-player-content').append(card);
    $('full-player-status').textContent=full.origin==='community'?'公开上传的完整游戏版 · 在新标签页播放，不受 30 秒限制。':'已解锁整首 · 在新标签页播放，不受 30 秒限制。';
  } else {
    const fullAudio=document.createElement('audio');
    fullAudio.controls=true;
    fullAudio.autoplay=true;
    fullAudio.preload='metadata';
    fullAudio.src=source.src;
    fullAudio.volume=audio.muted?0:audio.volume;
    fullAudio.addEventListener('error',()=>{$('full-player-status').textContent='当前音源暂时无法播放，请使用右侧整首来源链接。';});
    $('full-player-content').append(fullAudio);
  }
  $('full-player-panel').scrollIntoView({behavior:'smooth',block:'start'});
}

function renderMode() {
  document.body.dataset.mode=currentMode;
  document.querySelector('meta[name="theme-color"]').content=currentMode==='hard'?'#17141f':'#f6f5ee';
  for (const mode of ['easy','hard']) {
    $(`mode-${mode}`).setAttribute('aria-pressed',String(mode===currentMode));
    $(`mode-${mode}`).classList.toggle('active',mode===currentMode);
    $(`${mode}-count`).textContent=`${catalog.filter(track=>track.difficulty===mode).length} 首`;
  }
  $('page-title').innerHTML=currentMode==='easy'?'旋律响起，<span>游戏记忆上线。</span>':'夜色渐深，<span>寻找隐藏的旋律。</span>';
  $('intro-description').textContent=currentMode==='easy'?'那些最熟悉的旋律，你的耳朵一定还记得。':'冷门曲目与纯音乐，留给真正深入过这些世界的你。';
  $('mode-hint').textContent=`${modeName()} · 本模式纪录 ${readBest(currentMode)} 分 · 切换难度会开始新的一局`;
}

function renderRound() {
  const round=session.rounds[session.index];
  const answer=session.answer;
  $('round-number').innerHTML=`${String(session.index+1).padStart(2,'0')}<span> / ${session.rounds.length}</span>`;
  $('score').textContent=session.score;
  $('streak').textContent=session.streak;
  $('round-dots').innerHTML=session.rounds.map((_,i)=>`<span class="round-dot ${i<session.history.length?session.history[i].correct?'correct':'wrong':i===session.index?'current':''}" title="第 ${i+1} 题${i<session.history.length?session.history[i].correct?'：答对':session.history[i].skipped?'：跳过':'：答错':''}"></span>`).join('');
  $('track-eyebrow').textContent=answer?'答案揭晓 · FULL TRACK UNLOCKED':`${modeName()} · TRACK ${String(session.index+1).padStart(2,'0')}`;
  $('track-title').textContent=answer?round.track.title:'下一段冒险，藏在旋律里';
  $('track-artist').textContent=answer?`${round.track.artist} · ${round.track.game} · ${round.track.kind || '游戏原声'}`:'点击播放，作答后解锁这首歌的完整版';
  document.querySelector('.vocal-tag').textContent=round.track.vocal?'VOCAL TRACK / 人声曲目':'INSTRUMENTAL / 纯音乐';
  $('question-subtitle').textContent=answer?'旋律已经揭晓，完整的故事现在可以听。':currentMode==='easy'?'相信第一直觉，也可以再听一遍。':'少了熟悉的线索，还能认出这个世界吗？';
  $('options').innerHTML=round.options.map((game,i)=>{
    const track=catalog.find(t=>t.game===game);
    const correct=answer && game===round.track.game;
    const wrong=answer && !answer.correct && answer.game===game;
    return `<button class="option${correct?' correct':wrong?' wrong':answer?' dimmed':''}" data-choice="${i}" ${answer?'disabled':''}><span class="option-letter">${'ABCDEF'[i]}</span><span class="option-text"><span class="option-name">${escapeHtml(game)}</span><span class="option-english">${escapeHtml(track.english)}</span></span>${correct?icon('check','option-status'):wrong?icon('close','option-status'):''}</button>`;
  }).join('');
  $('options').querySelectorAll('[data-choice]').forEach(button=>button.addEventListener('click',()=>choose(round.options[Number(button.dataset.choice)])));
  $('feedback').hidden=!answer;
  $('skip').hidden=Boolean(answer);
  $('next').hidden=!answer;
  $('keyboard-tip').innerHTML=answer?'<kbd>Enter</kbd> 继续下一首':'<kbd>1</kbd> – <kbd>6</kbd> 快速作答';
  $('next').innerHTML=`${session.index===session.rounds.length-1?'看看本局成绩':'下一首'} ${icon('arrow')}`;
  if (answer) {
    $('feedback').classList.toggle('incorrect',!answer.correct);
    $('feedback').innerHTML=`<strong>${answer.correct?'猜对了！你的游戏记忆 +100':answer.skipped?'留个存档点，下次就记得了。':'差一点！这段旋律来自另一个世界。'}</strong>${answer.correct?'':`正确答案：${escapeHtml(round.track.game)}<br>`}<div class="full-unlock"><button class="full-track-button" id="listen-full">${icon('play')} 听完整版</button><span class="full-unlock-label">本题已解锁 · 无论对错都能听</span></div><a class="feedback-link" href="${escapeHtml(round.track.source)}" target="_blank" rel="noopener noreferrer">Apple Music 歌曲页 ${icon('link')}</a>`;
    $('listen-full').addEventListener('click',()=>openFullTrack());
    $('next').focus({preventScroll:true});
  }
}

function choose(game) {
  if (session.answer || session.phase==='complete') return;
  session=answerRound(session,game);
  renderRound();
}

function showResults() {
  generation++;
  audio.pause();
  closeFullPlayer();
  const best=Math.max(readBest(currentMode),session.score);
  try {localStorage.setItem(`echo-arcade-best-${currentMode}`,String(best));} catch { /* 不影响本局成绩。 */ }
  $('game-view').hidden=true;
  $('results-view').hidden=false;
  $('final-score').textContent=session.score;
  $('correct-count').textContent=`${session.history.filter(a=>a.correct).length} / ${session.rounds.length}`;
  $('best-streak').textContent=session.bestStreak;
  $('best-score').textContent=best;
  $('results-heading').textContent=`${modeName()}，余音未散。`;
  $('result-message').textContent=session.score===1000?'满分！每一段旋律，都刻在你的游戏 DNA 里。':session.score>=700?'耳朵里的存档，果然保存得很好。':session.score>=400?'有些世界很熟悉，有些旋律值得再相遇。':'发现了一些新旋律？这一局的完整版歌单都已解锁。';
  $('result-tracks').innerHTML=session.history.map((answer,i)=>`<div class="result-track"><span class="result-track-number">${String(i+1).padStart(2,'0')}</span>${icon(answer.correct?'check':'close',`result-track-icon${answer.correct?'':' wrong'}`)}<div class="result-track-detail"><strong>${escapeHtml(answer.track.title)}</strong><small>${escapeHtml(answer.track.game)} · ${answer.skipped?'已跳过':answer.correct?'+100 PTS':'未答对'}</small></div><button class="result-full-button" data-full-index="${i}" aria-label="听 ${escapeHtml(answer.track.title)} 完整版">听完整版</button></div>`).join('');
  $('result-tracks').querySelectorAll('[data-full-index]').forEach(button=>button.addEventListener('click',()=>openFullTrack(Number(button.dataset.fullIndex))));
  $('results-heading').tabIndex=-1;
  $('results-heading').focus({preventScroll:true});
  $('results-view').scrollIntoView({behavior:'smooth',block:'start'});
  renderMode();
}

function advance() {
  if (!session.answer || session.phase==='complete') return;
  session=nextRound(session);
  if (session.phase==='complete') {showResults();return;}
  prepareAudio();renderRound();playAudio();
}

function startSession(mode,{autoplay=false}={}) {
  currentMode=mode;
  session=createSession(catalog,{mode});
  $('results-view').hidden=true;
  $('game-view').hidden=false;
  renderMode();prepareAudio();renderRound();
  if (autoplay) playAudio();
}

$('mode-easy').addEventListener('click',()=>{if(currentMode!=='easy')startSession('easy');});
$('mode-hard').addEventListener('click',()=>{if(currentMode!=='hard')startSession('hard');});
$('close-full-player').addEventListener('click',closeFullPlayer);
$('play').addEventListener('click',toggleAudio);
$('record-play').addEventListener('click',toggleAudio);
$('replay').addEventListener('click',()=>playAudio(true));
$('seek').addEventListener('input',event=>{if(Number.isFinite(audio.duration)){audio.currentTime=Math.min(Number(event.target.value),clipLength());updateTimeline();}});
$('volume').addEventListener('input',event=>{audio.volume=Number(event.target.value);previousVolume=audio.volume;audio.muted=false;$('mute').setAttribute('aria-label','静音');$('mute').style.opacity='1';});
$('mute').addEventListener('click',()=>{audio.muted=!audio.muted;if(audio.muted)previousVolume=audio.volume;$('volume').value=audio.muted?0:previousVolume;$('mute').setAttribute('aria-label',audio.muted?'取消静音':'静音');$('mute').style.opacity=audio.muted?'.4':'1';});
$('skip').addEventListener('click',()=>{session=skipRound(session);renderRound();});
$('next').addEventListener('click',advance);
$('restart').addEventListener('click',()=>{startSession(currentMode,{autoplay:true});$('game-view').scrollIntoView({behavior:'smooth',block:'start'});});
const rulesDialog=$('rules-dialog');
$('show-rules').addEventListener('click',()=>rulesDialog.showModal());
$('close-rules').addEventListener('click',()=>rulesDialog.close());
$('rules-done').addEventListener('click',()=>rulesDialog.close());
rulesDialog.addEventListener('click',event=>{if(event.target===rulesDialog){const rect=rulesDialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)rulesDialog.close();}});
document.addEventListener('keydown',event=>{
  if(event.ctrlKey||event.altKey||event.metaKey||rulesDialog.open||session.phase==='complete'||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName))return;
  if(event.code==='Space'&&!/BUTTON|A/.test(document.activeElement?.tagName)){event.preventDefault();toggleAudio();}
  if(/^[1-6]$/.test(event.key)&&!session.answer)choose(session.rounds[session.index].options[Number(event.key)-1]);
  if(event.key==='Enter'&&session.answer&&!/BUTTON|A/.test(document.activeElement?.tagName)){event.preventDefault();advance();}
});
$('library-count').textContent=`${new Set(catalog.map(track=>track.game)).size} 款游戏 · ${catalog.length} 首曲目`;
renderMode();prepareAudio();renderRound();
