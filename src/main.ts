import './style.css';
import type { ImageQueueItem, ConversionSettings, OutputFormat, MatteColor } from './modules/types';
import { prepareImageSource, convertImageBlob, formatBytes, getExtensionForFormat } from './modules/converter';
import { packageBatchZip } from './modules/zipper';

const app = document.querySelector<HTMLDivElement>('#app')!;

const currentSettings: ConversionSettings = {
  targetFormat: 'image/gif',
  quality: 0.85,
  preserveAlpha: true,
  matteColor: '#ffffff',
  stripExif: true,
  removeBackground: true,
  bgTargetColor: 'auto',
  bgTolerance: 15,
  bgContiguous: true,
};

let queue: ImageQueueItem[] = [];
let isProcessing = false;

app.innerHTML = `
  <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased">
    <!-- Top Navigation -->
    <header class="h-16 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 z-20 backdrop-blur">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-mono font-bold text-lg shadow-sm">
          ⚡
        </div>
        <div>
          <span class="text-base font-bold tracking-tight text-white flex items-center gap-2">
            Holodeck Replicator
            <span class="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/30 text-cyan-400">v1.3</span>
          </span>
          <p class="text-xs text-slate-400 hidden sm:block">100% Client-Side Image Matrix & Format Transcoder</p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <button id="btn-clear-queue" class="hidden text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 px-3.5 rounded-lg border border-slate-700 transition-colors">
          Clear All
        </button>
        <button id="btn-batch-download" class="hidden text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white py-2 px-4 rounded-lg shadow-lg shadow-cyan-600/30 transition-all flex items-center gap-1.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
          Download All (ZIP)
        </button>
      </div>
    </header>

    <div class="flex-1 flex flex-col lg:flex-row overflow-hidden">
      <!-- Controls Configuration Panel -->
      <aside class="w-full lg:w-80 bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-800 p-5 shrink-0 flex flex-col gap-5 overflow-y-auto">
        <div>
          <h2 class="text-xs font-mono uppercase tracking-wider text-cyan-400 mb-3">Replication Parameters</h2>
          
          <!-- Target Format Selection -->
          <div class="space-y-2 mb-4">
            <div class="flex items-center justify-between">
              <label class="text-xs text-slate-400 font-medium">Output Format</label>
              <button type="button" data-info="format" class="info-trigger w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-serif font-bold text-cyan-400 hover:bg-cyan-950 hover:border-cyan-500 flex items-center justify-center transition-colors">i</button>
            </div>
            <div class="grid grid-cols-4 gap-1.5">
              <button data-format="image/webp" class="format-btn py-2 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all text-center">WebP</button>
              <button data-format="image/jpeg" class="format-btn py-2 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all text-center">JPEG</button>
              <button data-format="image/png" class="format-btn py-2 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all text-center">PNG</button>
              <button data-format="image/gif" class="format-btn py-2 text-xs font-medium rounded-lg border border-cyan-500 bg-cyan-950/60 text-cyan-300 transition-all text-center">GIF</button>
            </div>
          </div>

          <!-- Quality Slider -->
          <div id="quality-container" class="space-y-1.5 mb-4 opacity-40 pointer-events-none">
            <div class="flex justify-between items-center text-xs">
              <div class="flex items-center gap-1.5">
                <label class="text-slate-400 font-medium">Compression Quality</label>
                <button type="button" data-info="quality" class="info-trigger w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-serif font-bold text-cyan-400 hover:bg-cyan-950 hover:border-cyan-500 flex items-center justify-center transition-colors">i</button>
              </div>
              <span id="quality-val" class="font-mono text-cyan-400">85%</span>
            </div>
            <input type="range" id="quality-slider" min="10" max="100" value="85" step="5" class="w-full accent-cyan-500 bg-slate-800 cursor-pointer h-2 rounded-lg" />
          </div>

          <!-- Background Knockout (Eyedropper & Chroma Key) -->
          <div class="space-y-3 pt-3 border-t border-slate-800">
            <div class="flex items-center justify-between">
              <div>
                <div class="flex items-center gap-1.5">
                  <label class="text-xs font-medium text-slate-200 block">Remove Background</label>
                  <button type="button" data-info="knockout" class="info-trigger w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-serif font-bold text-cyan-400 hover:bg-cyan-950 hover:border-cyan-500 flex items-center justify-center transition-colors">i</button>
                </div>
                <span class="text-[11px] text-slate-400 block">Erase background to transparent</span>
              </div>
              <input type="checkbox" id="check-knockout" checked class="w-4 h-4 accent-cyan-500 rounded cursor-pointer" />
            </div>

            <div id="knockout-controls" class="space-y-2.5 pl-2.5 border-l-2 border-cyan-500/40">
              <!-- Eyedropper Button & Swatch -->
              <div class="flex items-center justify-between gap-2">
                <button type="button" id="btn-open-eyedropper" class="flex-1 bg-cyan-950/70 hover:bg-cyan-900/70 text-cyan-300 border border-cyan-500/40 rounded-lg py-1.5 px-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                  Eyedropper Sample
                </button>
                <div id="sampled-swatch" title="Active target colour" class="w-7 h-7 rounded-lg border border-slate-600 shrink-0 flex items-center justify-center text-[9px] font-mono text-slate-300 bg-slate-800">
                  AUTO
                </div>
              </div>

              <!-- Preset Dropdown -->
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-400">Colour Mode</span>
                <div class="flex items-center gap-1.5">
                  <select id="select-bg-color" class="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded px-2 py-1 outline-none focus:border-cyan-500">
                    <option value="auto">Auto (Corner / Sample)</option>
                    <option value="#ffffff">Pure White (#FFF)</option>
                    <option value="#000000">Pure Black (#000)</option>
                    <option value="custom">Custom Hex</option>
                  </select>
                  <input type="color" id="picker-bg-color" value="#ffffff" class="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer hidden" />
                </div>
              </div>

              <!-- Contiguous Magic Wand Toggle -->
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-400">Contiguous (Magic Wand)</span>
                <input type="checkbox" id="check-contiguous" checked class="w-3.5 h-3.5 accent-cyan-500 rounded cursor-pointer" />
              </div>

              <!-- Tolerance Slider -->
              <div class="space-y-1">
                <div class="flex justify-between items-center text-xs">
                  <span class="text-slate-400">Tolerance</span>
                  <span id="tolerance-val" class="font-mono text-cyan-400 text-[11px]">15%</span>
                </div>
                <input type="range" id="tolerance-slider" min="1" max="60" value="15" step="1" class="w-full accent-cyan-500 bg-slate-800 cursor-pointer h-1.5 rounded-lg" />
              </div>
            </div>
          </div>

          <!-- Transparency & Alpha Controls -->
          <div class="space-y-3 pt-3 border-t border-slate-800">
            <div class="flex items-center justify-between">
              <div>
                <div class="flex items-center gap-1.5">
                  <label class="text-xs font-medium text-slate-200 block">Preserve Native Alpha</label>
                  <button type="button" data-info="alpha" class="info-trigger w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-serif font-bold text-cyan-400 hover:bg-cyan-950 hover:border-cyan-500 flex items-center justify-center transition-colors">i</button>
                </div>
                <span class="text-[11px] text-slate-400 block">Retain pre-existing transparency</span>
              </div>
              <input type="checkbox" id="check-alpha" checked class="w-4 h-4 accent-cyan-500 rounded cursor-pointer" />
            </div>

            <!-- Matte Color Fallback -->
            <div id="matte-container" class="space-y-1.5 pt-2 hidden">
              <div class="flex items-center justify-between">
                <label class="text-xs text-slate-400 font-medium">Fallback Matte</label>
                <button type="button" data-info="matte" class="info-trigger w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-serif font-bold text-cyan-400 hover:bg-cyan-950 hover:border-cyan-500 flex items-center justify-center transition-colors">i</button>
              </div>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <button data-matte="#ffffff" class="matte-btn py-1.5 px-2 rounded-lg border border-cyan-500 bg-cyan-950/40 text-cyan-300 font-medium">White Matte</button>
                <button data-matte="#000000" class="matte-btn py-1.5 px-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 font-medium">Black Matte</button>
              </div>
            </div>
          </div>

          <!-- Maximum Dimensions -->
          <div class="space-y-2 pt-3 border-t border-slate-800">
            <div class="flex items-center justify-between">
              <label class="text-xs font-medium text-slate-200 block">Constraint Limits (Optional)</label>
              <button type="button" data-info="limits" class="info-trigger w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-serif font-bold text-cyan-400 hover:bg-cyan-950 hover:border-cyan-500 flex items-center justify-center transition-colors">i</button>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <span class="text-[10px] text-slate-500 block mb-1">Max Width (px)</span>
                <input type="number" id="input-max-w" placeholder="Auto" class="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 outline-none" />
              </div>
              <div>
                <span class="text-[10px] text-slate-500 block mb-1">Max Height (px)</span>
                <input type="number" id="input-max-h" placeholder="Auto" class="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 outline-none" />
              </div>
            </div>
          </div>
        </div>

        <div class="mt-auto pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-2">
          <svg class="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
          100% In-Memory Sandbox. Images are processed locally and never transmitted.
        </div>
      </aside>

      <!-- Main Stage / File Matrix Queue -->
      <main class="flex-1 p-6 overflow-y-auto flex flex-col items-center justify-start relative">
        <!-- Drag & Drop Zone -->
        <div id="drop-target" class="w-full max-w-2xl border-2 border-dashed border-slate-800 hover:border-cyan-500/60 rounded-3xl p-8 text-center transition-all bg-slate-900/50 flex flex-col items-center justify-center cursor-pointer mb-6">
          <div class="w-14 h-14 rounded-2xl bg-cyan-600/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-3 pointer-events-none">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
          </div>
          <h3 class="text-base font-semibold text-white mb-1 pointer-events-none">Drag & Drop Image Manifest</h3>
          <p class="text-xs text-slate-400 max-w-sm mb-4 pointer-events-none">Drop JPG, PNG, WebP, GIF, Apple HEIC, or TIFF files here for immediate client-side matrix conversion.</p>
          <label class="cursor-pointer bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs py-2 px-5 rounded-xl shadow-lg shadow-cyan-600/20 transition-all pointer-events-auto">
            Choose Files
            <input type="file" id="file-input" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/tiff,.heic,.heif,.gif,.tif,.tiff" class="hidden" />
          </label>
        </div>

        <!-- Conversion Queue Grid -->
        <div id="queue-grid" class="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4"></div>
      </main>
    </div>

    <!-- Eyedropper Sampling Modal -->
    <div id="eyedropper-modal" class="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 hidden flex-col items-center justify-center p-6">
      <div class="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full p-5 shadow-2xl flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-bold text-white flex items-center gap-2">
              <span class="text-cyan-400">💧</span> Eyedropper Background Sampler
            </h3>
            <p class="text-xs text-slate-400">Click anywhere on the background area you want to erase to transparency.</p>
          </div>
          <button id="btn-close-eyedropper" class="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <div class="relative bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex items-center justify-center max-h-[65vh] p-2">
          <canvas id="eyedropper-canvas" class="max-w-full max-h-[60vh] object-contain cursor-crosshair shadow-lg"></canvas>
        </div>

        <div class="flex items-center justify-between text-xs text-slate-400">
          <div class="flex items-center gap-2">
            <span>Hovered Pixel:</span>
            <span id="hover-swatch" class="w-4 h-4 rounded border border-slate-600 inline-block bg-transparent"></span>
            <span id="hover-hex" class="font-mono text-slate-200">—</span>
          </div>
          <span class="text-[11px] text-cyan-400">Click pixel to apply & re-process</span>
        </div>
      </div>
    </div>

    <!-- Developer Support Badge -->
    <div class="fixed bottom-4 right-4 z-40">
      <a 
        href="https://buymeacoffee.com/curiouslyso" 
        target="_blank" 
        rel="noopener noreferrer" 
        class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 hover:bg-slate-800 text-amber-300 font-medium text-xs border border-amber-500/30 hover:border-amber-400/60 shadow-lg shadow-black/50 backdrop-blur transition-all duration-200 hover:scale-105"
      >
        <span class="text-sm select-none">☕</span>
        <span class="text-[11px] tracking-wide text-slate-200 hover:text-amber-200">Support the dev</span>
      </a>
    </div>

    <!-- Global Viewport-Clamped Popover -->
    <div id="global-info-popover"></div>
  </div>
`;

// Info Copy Registry
const infoCopy: Record<string, string> = {
  format: `<strong class="text-white block mb-1">Export Format Guide</strong>
           <b class="text-cyan-400">WebP:</b> Modern web compression with 8-bit alpha.<br/>
           <b class="text-amber-400">JPEG:</b> Standard universal format (no transparency).<br/>
           <b class="text-emerald-400">PNG:</b> Lossless image fidelity with full alpha channel.<br/>
           <b class="text-purple-400">GIF:</b> 256-colour raster image with 1-bit transparent index.`,
  quality: `<strong class="text-white block mb-1">Quality Encoding</strong>
            Applies lossy compression to WebP and JPEG. Disabled for lossless PNG and palette-quantised GIF.`,
  knockout: `<strong class="text-white block mb-1">Eyedropper & Background Knockout</strong>
             Use <b>Eyedropper Sample</b> to click directly on the background you want removed. Enable <b>Contiguous</b> (Magic Wand) to erase only the connected background without touching matching colours inside your subject.`,
  alpha: `<strong class="text-white block mb-1">Alpha Channel Retention</strong>
          Preserves pre-existing transparent areas from input PNG/WebP/GIF files.`,
  matte: `<strong class="text-white block mb-1">Matte Background</strong>
          Fills transparent regions with a solid color when converting to JPEG.`,
  limits: `<strong class="text-white block mb-1">Aspect-Ratio Scaling</strong>
           Constrain oversized images to a width/height ceiling while strictly maintaining proportions.`,
};

// Viewport-Clamped Popover Controller
const popover = document.getElementById('global-info-popover') as HTMLDivElement;

const showPopover = (trigger: HTMLElement) => {
  const key = trigger.dataset.info;
  if (!key || !infoCopy[key]) return;

  popover.innerHTML = infoCopy[key];
  popover.classList.add('visible');

  const rect = trigger.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  const margin = 12;

  let left = rect.right + 10;
  if (left + popRect.width > window.innerWidth - margin) {
    left = Math.max(margin, rect.left - popRect.width / 2 + rect.width / 2);
  }
  left = Math.max(margin, Math.min(left, window.innerWidth - popRect.width - margin));

  let top = rect.top - 8;
  if (top + popRect.height > window.innerHeight - margin) {
    top = window.innerHeight - popRect.height - margin;
  }
  top = Math.max(margin, top);

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
};

const hidePopover = () => {
  popover.classList.remove('visible');
};

document.querySelectorAll('.info-trigger').forEach((btn) => {
  const el = btn as HTMLElement;
  el.addEventListener('mouseenter', () => showPopover(el));
  el.addEventListener('mouseleave', hidePopover);
  el.addEventListener('focus', () => showPopover(el));
  el.addEventListener('blur', hidePopover);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (popover.classList.contains('visible')) {
      hidePopover();
    } else {
      showPopover(el);
    }
  });
});

document.addEventListener('click', hidePopover);

// Element References
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const dropTarget = document.getElementById('drop-target') as HTMLDivElement;
const queueGrid = document.getElementById('queue-grid') as HTMLDivElement;
const btnBatchDownload = document.getElementById('btn-batch-download') as HTMLButtonElement;
const btnClearQueue = document.getElementById('btn-clear-queue') as HTMLButtonElement;
const qualitySlider = document.getElementById('quality-slider') as HTMLInputElement;
const qualityVal = document.getElementById('quality-val') as HTMLSpanElement;
const qualityContainer = document.getElementById('quality-container') as HTMLDivElement;
const checkAlpha = document.getElementById('check-alpha') as HTMLInputElement;
const matteContainer = document.getElementById('matte-container') as HTMLDivElement;
const inputMaxW = document.getElementById('input-max-w') as HTMLInputElement;
const inputMaxH = document.getElementById('input-max-h') as HTMLInputElement;
const checkKnockout = document.getElementById('check-knockout') as HTMLInputElement;
const knockoutControls = document.getElementById('knockout-controls') as HTMLDivElement;
const selectBgColor = document.getElementById('select-bg-color') as HTMLSelectElement;
const pickerBgColor = document.getElementById('picker-bg-color') as HTMLInputElement;
const toleranceSlider = document.getElementById('tolerance-slider') as HTMLInputElement;
const toleranceVal = document.getElementById('tolerance-val') as HTMLSpanElement;
const checkContiguous = document.getElementById('check-contiguous') as HTMLInputElement;
const btnOpenEyedropper = document.getElementById('btn-open-eyedropper') as HTMLButtonElement;
const sampledSwatch = document.getElementById('sampled-swatch') as HTMLDivElement;

// Eyedropper Modal Elements
const eyedropperModal = document.getElementById('eyedropper-modal') as HTMLDivElement;
const eyedropperCanvas = document.getElementById('eyedropper-canvas') as HTMLCanvasElement;
const btnCloseEyedropper = document.getElementById('btn-close-eyedropper') as HTMLButtonElement;
const hoverSwatch = document.getElementById('hover-swatch') as HTMLSpanElement;
const hoverHex = document.getElementById('hover-hex') as HTMLSpanElement;

const openEyedropperFor = async (item: ImageQueueItem) => {
  const preparedBlob = await prepareImageSource(item.file);
  const bitmap = await createImageBitmap(preparedBlob);

  eyedropperCanvas.width = bitmap.width;
  eyedropperCanvas.height = bitmap.height;
  const ctx = eyedropperCanvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(bitmap, 0, 0);
  }

  eyedropperModal.classList.remove('hidden');
  eyedropperModal.classList.add('flex');
};

const closeEyedropper = () => {
  eyedropperModal.classList.add('hidden');
  eyedropperModal.classList.remove('flex');
};

const rgbToHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');

eyedropperCanvas.addEventListener('mousemove', (e) => {
  const rect = eyedropperCanvas.getBoundingClientRect();
  const scaleX = eyedropperCanvas.width / rect.width;
  const scaleY = eyedropperCanvas.height / rect.height;
  const x = Math.min(eyedropperCanvas.width - 1, Math.max(0, Math.floor((e.clientX - rect.left) * scaleX)));
  const y = Math.min(eyedropperCanvas.height - 1, Math.max(0, Math.floor((e.clientY - rect.top) * scaleY)));

  const ctx = eyedropperCanvas.getContext('2d');
  if (!ctx) return;
  const pixel = ctx.getImageData(x, y, 1, 1).data;
  const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
  hoverSwatch.style.backgroundColor = hex;
  hoverHex.textContent = hex.toUpperCase();
});

eyedropperCanvas.addEventListener('click', (e) => {
  const rect = eyedropperCanvas.getBoundingClientRect();
  const normX = (e.clientX - rect.left) / rect.width;
  const normY = (e.clientY - rect.top) / rect.height;

  const scaleX = eyedropperCanvas.width / rect.width;
  const scaleY = eyedropperCanvas.height / rect.height;
  const x = Math.min(eyedropperCanvas.width - 1, Math.max(0, Math.floor((e.clientX - rect.left) * scaleX)));
  const y = Math.min(eyedropperCanvas.height - 1, Math.max(0, Math.floor((e.clientY - rect.top) * scaleY)));

  const ctx = eyedropperCanvas.getContext('2d');
  if (!ctx) return;
  const pixel = ctx.getImageData(x, y, 1, 1).data;
  const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);

  currentSettings.removeBackground = true;
  checkKnockout.checked = true;
  currentSettings.samplePoint = { x: normX, y: normY };
  currentSettings.bgTargetColor = hex;

  selectBgColor.value = 'custom';
  pickerBgColor.value = hex;
  pickerBgColor.classList.remove('hidden');
  sampledSwatch.style.backgroundColor = hex;
  sampledSwatch.textContent = '';

  closeEyedropper();
  updateSettingsUI();

  queue.forEach((q) => (q.status = 'idle'));
  renderQueue();
  processQueue();
});

btnCloseEyedropper.addEventListener('click', closeEyedropper);
eyedropperModal.addEventListener('click', (e) => {
  if (e.target === eyedropperModal) closeEyedropper();
});

btnOpenEyedropper.addEventListener('click', () => {
  if (queue.length === 0) {
    fileInput.click();
    return;
  }
  openEyedropperFor(queue[0]);
});

const updateSettingsUI = () => {
  const isLosslessOrPalette = currentSettings.targetFormat === 'image/png' || currentSettings.targetFormat === 'image/gif';
  if (isLosslessOrPalette) {
    qualityContainer.classList.add('opacity-40', 'pointer-events-none');
  } else {
    qualityContainer.classList.remove('opacity-40', 'pointer-events-none');
  }

  if (currentSettings.targetFormat === 'image/jpeg' || (!currentSettings.preserveAlpha && !currentSettings.removeBackground)) {
    matteContainer.classList.remove('hidden');
  } else {
    matteContainer.classList.add('hidden');
  }

  if (currentSettings.removeBackground) {
    knockoutControls.classList.remove('hidden');
  } else {
    knockoutControls.classList.add('hidden');
  }
};

const renderQueue = () => {
  if (queue.length === 0) {
    queueGrid.innerHTML = '';
    btnBatchDownload.classList.add('hidden');
    btnClearQueue.classList.add('hidden');
    return;
  }

  btnClearQueue.classList.remove('hidden');
  const allCompleted = queue.some(item => item.status === 'completed');
  if (allCompleted) {
    btnBatchDownload.classList.remove('hidden');
  } else {
    btnBatchDownload.classList.add('hidden');
  }

  queueGrid.innerHTML = queue.map(item => `
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex gap-4 items-center relative overflow-hidden group">
      <!-- Checkerboard preview box with quick eyedropper trigger -->
      <div class="w-20 h-20 rounded-xl overflow-hidden shrink-0 transparency-check border border-slate-700/60 flex items-center justify-center relative group/thumb">
        <img src="${item.previewUrl}" alt="Preview" class="w-full h-full object-contain select-none" />
        <button data-sample="${item.id}" title="Sample background colour with Eyedropper" class="btn-sample-item absolute bottom-1 right-1 bg-slate-900/90 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-slate-700 rounded-md p-1 opacity-0 group-hover/thumb:opacity-100 transition-opacity shadow-md">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
        </button>
      </div>

      <!-- Details -->
      <div class="flex-1 min-w-0">
        <h4 class="text-xs font-semibold text-white truncate mb-1" title="${item.originalName}">${item.originalName}</h4>
        <div class="text-[11px] text-slate-400 flex items-center gap-2 mb-2">
          <span>${formatBytes(item.originalSize)}</span>
          ${item.convertedSize ? `
            <span>→</span>
            <span class="font-mono text-cyan-400 font-medium">${formatBytes(item.convertedSize)}</span>
            <span class="${item.convertedSize < item.originalSize ? 'text-emerald-400' : 'text-slate-400'}">
              (${Math.round((1 - item.convertedSize / item.originalSize) * 100)}% saved)
            </span>
          ` : ''}
        </div>

        <!-- Status / Action -->
        ${item.status === 'converting' ? `
          <div class="text-[11px] font-mono text-cyan-400 animate-pulse flex items-center gap-1.5">
            <svg class="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
            Replicating...
          </div>
        ` : ''}

        ${item.status === 'completed' ? `
          <div class="flex items-center gap-2">
            <button data-download="${item.id}" class="btn-single-download text-[11px] bg-slate-800 hover:bg-slate-700 text-cyan-300 font-medium py-1 px-3 rounded-lg border border-slate-700 hover:border-cyan-500/40 transition-all inline-flex items-center gap-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              Save ${getExtensionForFormat(currentSettings.targetFormat).toUpperCase()}
            </button>
            <button data-sample="${item.id}" class="btn-sample-item text-[11px] bg-slate-800/70 hover:bg-slate-700 text-slate-300 py-1 px-2 rounded-lg border border-slate-700 transition-colors" title="Pick background colour">
              💧 Pick
            </button>
          </div>
        ` : ''}

        ${item.status === 'error' ? `
          <div class="text-[11px] font-mono text-rose-400 truncate" title="${item.errorMessage}">
            Error: ${item.errorMessage || 'Conversion failed'}
          </div>
        ` : ''}
      </div>

      <!-- Delete from queue -->
      <button data-remove="${item.id}" title="Remove from queue" class="text-slate-500 hover:text-slate-300 p-1 rounded-lg transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
      </button>
    </div>
  `).join('');
};

const processQueue = async () => {
  if (isProcessing) return;
  isProcessing = true;

  for (const item of queue) {
    if (item.status === 'idle') {
      item.status = 'converting';
      renderQueue();

      try {
        const preparedBlob = await prepareImageSource(item.file);
        const { blob: convertedBlob, dimensions } = await convertImageBlob(preparedBlob, currentSettings);
        
        item.convertedBlob = convertedBlob;
        item.convertedSize = convertedBlob.size;
        item.dimensions = dimensions;
        item.previewUrl = URL.createObjectURL(convertedBlob);
        item.status = 'completed';
      } catch (err: any) {
        console.error(err);
        item.status = 'error';
        item.errorMessage = err?.message || 'Processing failed';
      }

      renderQueue();
    }
  }

  isProcessing = false;
};

const addFilesToQueue = (files: FileList | File[]) => {
  Array.from(files).forEach(file => {
    const url = URL.createObjectURL(file);
    const item: ImageQueueItem = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      file,
      originalName: file.name,
      originalSize: file.size,
      originalType: file.type,
      originalUrl: url,
      previewUrl: url,
      status: 'idle',
    };
    queue.push(item);
  });

  renderQueue();
  processQueue();
};

// Event Listeners
document.querySelectorAll('.format-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const target = e.currentTarget as HTMLButtonElement;
    document.querySelectorAll('.format-btn').forEach(b => {
      b.className = 'format-btn py-2 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all text-center';
    });
    target.className = 'format-btn py-2 text-xs font-medium rounded-lg border border-cyan-500 bg-cyan-950/60 text-cyan-300 transition-all text-center';
    
    currentSettings.targetFormat = target.dataset.format as OutputFormat;
    updateSettingsUI();

    queue.forEach(q => q.status = 'idle');
    renderQueue();
    processQueue();
  });
});

qualitySlider.addEventListener('input', (e) => {
  const val = parseInt((e.target as HTMLInputElement).value, 10);
  qualityVal.textContent = `${val}%`;
  currentSettings.quality = val / 100;
});

qualitySlider.addEventListener('change', () => {
  queue.forEach(q => q.status = 'idle');
  renderQueue();
  processQueue();
});

checkAlpha.addEventListener('change', (e) => {
  currentSettings.preserveAlpha = (e.target as HTMLInputElement).checked;
  updateSettingsUI();
  queue.forEach(q => q.status = 'idle');
  renderQueue();
  processQueue();
});

checkKnockout.addEventListener('change', (e) => {
  currentSettings.removeBackground = (e.target as HTMLInputElement).checked;
  updateSettingsUI();
  queue.forEach(q => q.status = 'idle');
  renderQueue();
  processQueue();
});

checkContiguous.addEventListener('change', (e) => {
  currentSettings.bgContiguous = (e.target as HTMLInputElement).checked;
  queue.forEach(q => q.status = 'idle');
  renderQueue();
  processQueue();
});

selectBgColor.addEventListener('change', () => {
  const val = selectBgColor.value;
  currentSettings.samplePoint = undefined;
  if (val === 'custom') {
    pickerBgColor.classList.remove('hidden');
    currentSettings.bgTargetColor = pickerBgColor.value;
    sampledSwatch.style.backgroundColor = pickerBgColor.value;
    sampledSwatch.textContent = '';
  } else {
    pickerBgColor.classList.add('hidden');
    currentSettings.bgTargetColor = val;
    if (val === 'auto') {
      sampledSwatch.style.backgroundColor = '';
      sampledSwatch.textContent = 'AUTO';
    } else {
      sampledSwatch.style.backgroundColor = val;
      sampledSwatch.textContent = '';
    }
  }
  queue.forEach(q => q.status = 'idle');
  renderQueue();
  processQueue();
});

pickerBgColor.addEventListener('input', () => {
  currentSettings.samplePoint = undefined;
  currentSettings.bgTargetColor = pickerBgColor.value;
  sampledSwatch.style.backgroundColor = pickerBgColor.value;
  sampledSwatch.textContent = '';
  queue.forEach(q => q.status = 'idle');
  renderQueue();
  processQueue();
});

toleranceSlider.addEventListener('input', (e) => {
  const val = parseInt((e.target as HTMLInputElement).value, 10);
  toleranceVal.textContent = `${val}%`;
  currentSettings.bgTolerance = val;
});

toleranceSlider.addEventListener('change', () => {
  queue.forEach(q => q.status = 'idle');
  renderQueue();
  processQueue();
});

document.querySelectorAll('.matte-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const target = e.currentTarget as HTMLButtonElement;
    document.querySelectorAll('.matte-btn').forEach(b => {
      b.className = 'matte-btn py-1.5 px-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 font-medium';
    });
    target.className = 'matte-btn py-1.5 px-2 rounded-lg border border-cyan-500 bg-cyan-950/40 text-cyan-300 font-medium';
    currentSettings.matteColor = target.dataset.matte as MatteColor;
    queue.forEach(q => q.status = 'idle');
    renderQueue();
    processQueue();
  });
});

inputMaxW.addEventListener('change', () => {
  currentSettings.maxWidth = inputMaxW.value ? parseInt(inputMaxW.value, 10) : undefined;
  queue.forEach(q => q.status = 'idle');
  renderQueue();
  processQueue();
});

inputMaxH.addEventListener('change', () => {
  currentSettings.maxHeight = inputMaxH.value ? parseInt(inputMaxH.value, 10) : undefined;
  queue.forEach(q => q.status = 'idle');
  renderQueue();
  processQueue();
});

fileInput.addEventListener('change', (e) => {
  const files = (e.target as HTMLInputElement).files;
  if (files && files.length > 0) addFilesToQueue(files);
});

dropTarget.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropTarget.classList.add('border-cyan-500', 'bg-slate-900');
});

dropTarget.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropTarget.classList.remove('border-cyan-500', 'bg-slate-900');
});

dropTarget.addEventListener('drop', (e) => {
  e.preventDefault();
  dropTarget.classList.remove('border-cyan-500', 'bg-slate-900');
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) addFilesToQueue(files);
});

queueGrid.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;

  const sampleBtn = target.closest('.btn-sample-item') as HTMLElement;
  if (sampleBtn) {
    const id = sampleBtn.dataset.sample;
    const item = queue.find(q => q.id === id);
    if (item) openEyedropperFor(item);
    return;
  }

  const downloadBtn = target.closest('.btn-single-download') as HTMLElement;
  if (downloadBtn) {
    const id = downloadBtn.dataset.download;
    const item = queue.find(q => q.id === id);
    if (item && item.convertedBlob) {
      const ext = getExtensionForFormat(currentSettings.targetFormat);
      const baseName = item.originalName.replace(/\.[^/.]+$/, '');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(item.convertedBlob);
      a.download = `${baseName}_converted.${ext}`;
      a.click();
    }
    return;
  }

  const removeBtn = target.closest('[data-remove]') as HTMLElement;
  if (removeBtn) {
    const id = removeBtn.dataset.remove;
    const idx = queue.findIndex(q => q.id === id);
    if (idx !== -1) {
      URL.revokeObjectURL(queue[idx].previewUrl);
      URL.revokeObjectURL(queue[idx].originalUrl);
      queue.splice(idx, 1);
      renderQueue();
    }
  }
});

btnClearQueue.addEventListener('click', () => {
  queue.forEach(item => {
    URL.revokeObjectURL(item.previewUrl);
    URL.revokeObjectURL(item.originalUrl);
  });
  queue = [];
  renderQueue();
});

btnBatchDownload.addEventListener('click', async () => {
  const completedItems = queue.filter(q => q.status === 'completed' && q.convertedBlob);
  if (completedItems.length === 0) return;

  btnBatchDownload.textContent = 'Archiving...';
  btnBatchDownload.classList.add('opacity-75', 'cursor-wait');

  try {
    const zipBlob = await packageBatchZip(completedItems, currentSettings);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zipBlob);
    a.download = `holodeck_replicator_${Date.now()}.zip`;
    a.click();
  } catch (err) {
    console.error('Batch ZIP generation failed:', err);
    alert('Failed to package batch ZIP file.');
  } finally {
    btnBatchDownload.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
      Download All (ZIP)
    `;
    btnBatchDownload.classList.remove('opacity-75', 'cursor-wait');
  }
});

updateSettingsUI();
