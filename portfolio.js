(() => {
  'use strict';
  const REPO = 'kimdakg/stageup-review-2026';
  const RELEASES_URL = `https://github.com/${REPO}/releases`;
  const API_URL = `https://api.github.com/repos/${REPO}/releases?per_page=10`;
  const MAX_BYTES = 200000000;

  function resolvePortfolio(releases) {
    if (!Array.isArray(releases)) throw new Error('INVALID_RESPONSE');
    const published = releases.filter(r => r && r.draft === false && r.published_at)
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
    if (!published.length) return {state: 'empty'};
    const release = published[0];
    if (!Array.isArray(release.assets)) throw new Error('INVALID_RESPONSE');
    const info = {releaseUrl: RELEASES_URL};
    if (!release.assets.length) return {...info, state: 'empty'};
    if (release.assets.length !== 1) return {...info, state: 'multiple'};
    const asset = release.assets[0];
    if (!Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.state !== 'uploaded') return {...info, state: 'invalid'};
    if (asset.size > MAX_BYTES) return {...info, state: 'oversize'};
    let url;
    try { url = new URL(asset.browser_download_url); } catch { throw new Error('INVALID_RESPONSE'); }
    if (url.origin !== 'https://github.com' || url.username || url.password ||
        !url.pathname.startsWith(`/${REPO}/releases/download/`) ||
        typeof asset.name !== 'string' || !asset.name.trim()) throw new Error('INVALID_RESPONSE');
    return {...info, state: 'ready', name: asset.name, size: asset.size, url: url.href};
  }

  async function fetchPortfolio(fetcher, signal) {
    const response = await fetcher(API_URL, {headers: {Accept: 'application/vnd.github+json'}, cache: 'no-store', credentials: 'omit', signal});
    if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'RATE_LIMIT' : 'FETCH_FAILED');
    return resolvePortfolio(await response.json());
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = {resolvePortfolio, fetchPortfolio, MAX_BYTES};
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const filename = $('portfolio-filename'), message = $('portfolio-status');
  const download = $('portfolio-download'), refresh = $('portfolio-refresh');
  const dialog = $('portfolio-dialog'), fallback = $('portfolio-fallback');
  let loading = false, waitingForUpload = false, lastAttempt = 0;

  function render(result) {
    download.hidden = true; download.removeAttribute('href');
    filename.classList.remove('has-portfolio');
    $('portfolio-card').dataset.state = result.state;
    fallback.hidden = true;
    if (result.state === 'ready') {
      filename.textContent = result.name;
      filename.classList.add('has-portfolio');
      download.href = result.url;
      download.download = result.name;
      download.hidden = false;
      message.textContent = `${(result.size / 1000000).toLocaleString('ko-KR', {maximumFractionDigits: 1})}MB · 리더도 로그인 없이 다운로드할 수 있습니다.`;
    } else if (result.state === 'oversize') {
      filename.textContent = '첨부파일 용량이 200MB를 초과했습니다.';
      message.textContent = '파일 용량을 줄인 뒤 다시 등록해 주세요. 현재 파일은 리뷰에 첨부되지 않았습니다.';
    } else if (result.state === 'multiple') {
      filename.textContent = '파일을 하나로 압축해 등록해 주세요.';
      message.textContent = '여러 파일이 등록되어 있습니다. 200MB 이하의 ZIP 파일 한 개로 교체해 주세요.';
    } else if (result.state === 'invalid') {
      filename.textContent = '파일 업로드가 완료되지 않았습니다.';
      message.textContent = 'GitHub에서 파일 업로드와 공개가 완료됐는지 확인한 뒤 새로고침해 주세요.';
    } else {
      filename.textContent = '첨부된 포트폴리오가 없습니다.';
      message.textContent = '파일첨부에서 등록하면 이곳에 다운로드 버튼이 표시됩니다.';
    }
  }

  async function refreshPortfolio() {
    if (loading) return;
    loading = true; lastAttempt = Date.now();
    refresh.disabled = true;
    $('portfolio-card').setAttribute('aria-busy', 'true');
    message.textContent = '첨부파일을 확인하고 있습니다…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      render(await fetchPortfolio(fetch, controller.signal));
    } catch (error) {
      download.hidden = true; download.removeAttribute('href');
      filename.textContent = '첨부파일을 확인하지 못했습니다.';
      message.textContent = error.message === 'RATE_LIMIT'
        ? '일시적으로 조회가 제한됐습니다. 아래 링크에서 공개된 첨부파일을 확인할 수 있습니다.'
        : '연결을 확인하고 새로고침해 주세요. 아래 링크에서도 공개된 첨부파일을 확인할 수 있습니다.';
      fallback.hidden = false;
      $('portfolio-card').dataset.state = 'error';
    } finally {
      clearTimeout(timeout); loading = false; refresh.disabled = false;
      $('portfolio-card').setAttribute('aria-busy', 'false');
    }
  }

  $('portfolio-open').addEventListener('click', () => dialog.showModal());
  $('portfolio-close').addEventListener('click', () => dialog.close());
  refresh.addEventListener('click', refreshPortfolio);
  $('portfolio-published').addEventListener('click', () => {dialog.close(); waitingForUpload = false; refreshPortfolio();});
  $('portfolio-github-upload').addEventListener('click', () => {waitingForUpload = true;});
  $('portfolio-github-manage').addEventListener('click', () => {waitingForUpload = true;});
  window.addEventListener('focus', () => {if (waitingForUpload && Date.now() - lastAttempt > 3000) refreshPortfolio();});
  refreshPortfolio();
})();
