function buildLocalManifestUrl(params){
  const origin = window.location.origin; // assume same host
  const query = new URLSearchParams(params).toString();
  return `${origin}/manifest.json?${query}`;
}

const form = document.getElementById('configForm');
const resultEl = document.getElementById('result');
const installUrlInput = document.getElementById('installUrl');
const copyBtn = document.getElementById('copyBtn');
const openManifestLink = document.getElementById('openManifest');

form.addEventListener('submit', (e)=>{
  e.preventDefault();
  const geminiKey = document.getElementById('geminiKey').value.trim();
  const ttl = document.getElementById('ttl').value || '21600';
  const maxResults = document.getElementById('maxResults').value || '8';
  if(!geminiKey){
    alert('Gemini API Key required');
    return;
  }
  // We embed key & options as query params; backend will override env for that request.
  const url = buildLocalManifestUrl({ geminiKey, ttl, max: maxResults });
  installUrlInput.value = url;
  openManifestLink.href = url;
  resultEl.classList.remove('hidden');
});

copyBtn.addEventListener('click', ()=>{
  installUrlInput.select();
  document.execCommand('copy');
  copyBtn.textContent='Copied';
  setTimeout(()=> copyBtn.textContent='Copy', 1500);
});
