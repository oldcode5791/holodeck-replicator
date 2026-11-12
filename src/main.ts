import './style.css';
import type { ImageQueueItem, ConversionSettings, OutputFormat, MatteColor } from './modules/types';
import { prepareImageSource, convertImageBlob, applyBackgroundKnockout, formatBytes, getExtensionForFormat } from './modules/converter';
import { packageBatchZip } from './modules/zipper';

const app = document.querySelector<HTMLDivElement>('#app')!;

// Default transcoding & Magic Wand background knockout settings
const currentSettings: ConversionSettings = {
  targetFormat: 'image/gif',
  quality: 0.85,
  preserveAlpha: true,
  matteColor: '#ffffff',
  stripExif: true,
  removeBackground: true,
  bgTargetColor: 'auto',
  bgTolerance: 15,
  bgDefringe: 0,
  bgContiguous: true,
  samplePoints: [],
};

// In-memory batch queue and active Eyedropper modal canvas reference
let queue: ImageQueueItem[] = [];
let isProcessing = false;
let sourceCanvasForEyedropper: HTMLCanvasElement | null = null;

// Render application shell with comprehensive everyday-user info triggers and native title tooltips
app.innerHTML = `
  <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased">
    <!-- Top Navigation Header -->
    <header class="h-16 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 z-20 backdrop-blur">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-mono font-bold text-lg shadow-sm">
          ⚡
        </div>
        <div>
          <span class="text-base font-bold tracking-tight text-white flex items-center gap-2">
            Holodeck Replicator
            <span class="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/30 text-cyan-400">v1.5</span>
          </span>
          <p class="text-xs text-slate-400 hidden sm:block">100% Client-Side Image Matrix &amp; Format Transcoder</p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <a href="https://apps.the-lal.net" title="Return to the full the-lal.net browser utility directory" class="text-xs text-slate-400 hover:text-cyan-400 transition-colors hidden sm:inline">
          &larr; App Showcase
        </a>
        <button id="btn-clear-queue" title="Remove all images from the current conversion queue and free browser memory" class="hidden text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 px-3.5 rounded-lg border border-slate-700 transition-colors">
          Clear All
        </button>
        <button id="btn-batch-download" title="Bundle all converted images into a single ZIP file for immediate download" class="hidden text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white py-2 px-4 rounded-lg shadow-lg shadow-cyan-600/30 transition-all flex items-center gap-1.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
          Download All (ZIP)
        </button>
      </div>
    </header>

    <div class="flex-1 flex flex-col lg:flex-row overflow-hidden">
      <!-- Left Sidebar: Replication & Background Removal Controls -->
      <aside class="w-full lg:w-80 bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-800 p-5 shrink-0 flex flex-col gap-5 overflow-y-auto">
        <div>
          <h2 class="text-xs font-mono uppercase tracking-wider text-cyan-400 mb-3">Replication Parameters</h2>

          <!-- Target Output Format Selection -->
          <div class="space-y-2 mb-4">
            <div class="flex items-center justify-between">
              <label class="text-xs text-slate-400 font-medium">Output Format</label>
              <button type="button" data-info="format" aria-label="Output format help" class="info-trigger w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-serif font-bold text-cyan-400 hover:bg-cyan-950 hover:border-cyan-500 flex items-center justify-center transition-colors">i</button>
            </div>
            <div class="grid grid-cols-4 gap-1.5">
              <button data-format="image/webp" title="Convert to modern WebP (small files with smooth transparency)" class="format-btn py-2 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all text-center">WebP</button>
              <button data-format="image/jpeg" title="Convert to universal JPEG (best for photos; no transparent background)" class="format-btn py-2 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all text-center">JPEG</button>
              <button data-format="image/png" title="Convert to lossless PNG (crisp edges with full transparency)" class="format-btn py-2 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all text-center">PNG</button>
              <button data-format="image/gif" title="Convert to static or animated GIF with transparent background support" class="format-btn py-2 text-xs font-medium rounded-lg border border-cyan-500 bg-cyan-950/60 text-cyan-300 transition-all text-center">GIF</button>
            </div>
          </div>

          <!-- Compression Quality Slider (Active for WebP & JPEG) -->
          <div id="quality-container" class="space-y-1.5 mb-4 opacity-40 pointer-events-none">
            <div class="flex justify-between items-center text-xs">
              <div class="flex items-center gap-1.5">
                <label class="text-slate-400 font-medium">Compression Quality</label>
                <button type="button" data-info="quality" aria-label="Compression quality help" class="info-trigger w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-serif font-bold text-cyan-400 hover:bg-cyan-950 hover:border-cyan-500 flex items-center justify-center transition-colors">i</button>
              </div>
              <span id="quality-val" class="font-mono text-cyan-400">85%</span>
            </div>
            <input type="range" id="quality-slider" min="10" max="100" value="85" step="5" title="Adjust image quality vs. file size for WebP and JPEG exports" class="w-full accent-cyan-500 bg-slate-800 cursor-pointer h-2 rounded-lg" />
          </div>

          <!-- Background Knockout (Multi-Point Eyedropper & Edge Defringe) -->
          <div class="space-y-3 pt-3 border-t border-slate-800">
            <div class="flex items-center justify-between">
              <div>
                <div class="flex items-center gap-1.5">
                  <label class="text-xs font-medium text-slate-200 block">Remove Background</label>
                  <button type="button" data-info="knockout" aria-label="Background removal help" class="info-trigger w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-serif font-bold text-cyan-400 hover:bg-cyan-950 hover:border-cyan-500 flex items-center justify-center transition-colors">i</button>
                </div>
                <span class="text-[11px] text-slate-400 block">Erase background to transparent</span>
              </div>
              <input type="checkbox" id="check-knockout" checked title="Toggle automatic or eyedropper-guided background removal" class="w-4 h-4 accent-cyan-500 rounded cursor-pointer" />
            </div>

            <div id="knockout-controls" class="space-y-2.5 pl-2.5 border-l-2 border-cyan-500/40">
              <!-- Multi-Point Eyedropper Launcher & Sample Reset -->
              <div class="flex items-center justify-between gap-2">
                <button type="button" id="btn-open-eyedropper" title="Open interactive canvas to click exact background colors or enclosed pockets to erase" class="flex-1 bg-cyan-950/70 hover:bg-cyan-900/70 text-cyan-300 border border-cyan-500/40 rounded-lg py-1.5 px-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                  Eyedropper (<span id="sample-count-badge">0</span>)
                </button>
                <button type="button" id="btn-reset-samples" title="Clear all manually clicked Eyedropper points and return to Fallback Mode" class="hidden px-2 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300">
                  Reset
                </button>
              </div>

              <!-- Fallback Color Detection Mode -->
              <div class="flex items-center justify-between text-xs">
                <div class="flex items-center gap-1.5">
                  <span class="text-slate-400">Fallback Mode</span>
                  <button type="button" data-info="fallback" aria-label="Fallback mode help" class="info-trigger w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-serif font-bold text-cyan-400 hover:bg-cyan-950 hover:border-cyan-500 flex items-center justify-center transition-colors">i</button>
                </div>
                <div class="flex items-center gap-1.5">
                  <select id="select-bg-color" title="Choose which background color to erase when no Eyedropper points are picked" class="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded px-2 py-1 outline-none focus:border-cyan-500">
                    <option value="auto">Auto (Top-Left)</option>
                    <option value="#ffffff">Pure White (#FFF)</option>
                    <option value="#000000">Pure Black (#000)</option>
                    <option value="custom">Custom Hex</option>
                  </select>
                  <input type="color" id="picker-bg-color" value="#ffffff" title="Pick a custom background color to remove" class="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer hidden" />
                </div>
              </div>

              <!-- Contiguous Magic Wand Toggle -->
              <div class="flex items-center justify-between text-xs">
                <div class="flex items-center gap-1.5">
                  <span class="text-slate-400">Contiguous (Magic Wand)</span>
                  <button type="button" data-info="contiguous" aria-label="Contiguous mode help" class="info-trigger w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-serif font-bold text-cyan-400 hover:bg-cyan-950 hover:border-cyan-500 flex items-center justify-center transition-colors">i</button>
                </div>
                <input type="checkbox" id="check-contiguous" checked title="Checked: only erases connected outer background. Unchecked: erases that color everywhere in the image." class="w-3.5 h-3.5 accent-cyan-500 rounded cursor-pointer" />
              </div>

              <!-- Color Match Tolerance Slider -->
              <div class="space-y-1">
                <div class="flex justify-between items-center text-xs">
                  <div class="flex items-center gap-1.5">
                    <span class="text-slate-400">Tolerance</span>
                    <button type="button" data-info="tolerance" aria-label="Tolerance help" class="info-trigger w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-serif font-bold text-cyan-400 hover:bg-cyan-950 hover:border-cyan-500 flex items-center justify-center transition-colors">i</button>
                  </div>
                  <span id="tolerance-val" class="font-mono text-cyan-400 text-[11px]">15%</span>
                </div>
                <input type="range" id="tolerance-slider" min="1" max="60" value="15" step="1" title="Higher values erase a wider range of similar shades and shadows" class="w-full accent-cyan-500 bg-slate-800 cursor-pointer h-1.5 rounded-lg" />
              </div>

              <!-- Edge Defringe Slider -->
              <div class="space-y-1">
                <div class="flex justify-between items-center text-xs">
                  <div class="flex items-center gap-1.5">
                    <span class="text-slate-400">Edge Defringe (Halo)</span>
                    <button type="button" data-info="defringe" aria-label="Edge defringe help" class="info-trigger w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-serif font-bold text-cyan-400 hover:bg-cyan-950 hover:border-cyan-500 flex items-center justify-center transition-colors">i</button>
                  </div>
                  <span id="defringe-val" class="font-mono text-cyan-400 text-[11px]">0 px</span>
                </div>
                <input type="range" id="defringe-slider" min="0" max="3" value="0" step="1" title="Shave 1–3 pixels off edges to clean up white or dark outline halos" class="w-full accent-cyan-500 bg-slate-800 cursor-pointer h-1.5 rounded-lg" />
              </div>
            </div>
          </div>

          <!-- Transparency & Alpha Controls -->
          <div class="space-y-3 pt-3 border-t border-slate-800">
            <div class="flex items-center justify-between">
              <div>
                <div class="flex items-center gap-1.5">
                  <label class="text-xs font-medium text-slate-200 block">Preserve Native Alpha</label>
                  <button type="button" data-info="alpha" aria-label="Preserve alpha help" class="info-trigger w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-serif font-bold text-cyan-400 hover:bg-cyan-950 hover:border-cyan-500 flex items-center justify-center transition-colors">i</button>
                </div>
                <span class="text-[11px] text-slate-400 block">Retain pre-existing transparency</span>
              </div>
              <input type="checkbox" id="check-alpha" checked title="Keep existing transparent areas intact when converting PNG, WebP, or GIF files" class="w-4 h-4 accent-cyan-500 rounded cursor-pointer" />
            </div>

            <!-- Solid Matte Fallback (Shown for JPEG or opaque exports) -->
            <div id="matte-container" class="space-y-1.5 pt-2 hidden">
              <div class="flex items-center justify-between">
                <label class="text-xs text-slate-400 font-medium">Fallback Matte</label>
                <button type="button" data-info="matte" aria-label="Fallback matte help" class="info-trigger w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-serif font-bold text-cyan-400 hover:bg-cyan-950 hover:border-cyan-500 flex items-center justify-center transition-colors">i</button>
              </div>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <button data-matte="#ffffff" title="Fill transparent areas with solid white" class="matte-btn py-1.5 px-2 rounded-lg border border-cyan-500 bg-cyan-950/40 text-cyan-300 font-medium">White Matte</button>
                <button data-matte="#000000" title="Fill transparent areas with solid black" class="matte-btn py-1.5 px-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 font-medium">Black Matte</button>
              </div>
            </div>
          </div>

          <!-- Optional Aspect-Ratio-Preserving Resize Ceilings -->
          <div class="space-y-2 pt-3 border-t border-slate-800">
            <div class="flex items-center justify-between">
              <label class="text-xs font-medium text-slate-200 block">Constraint Limits (Optional)</label>
              <button type="button" data-info="limits" aria-label="Resize limits help" class="info-trigger w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-serif font-bold text-cyan-400 hover:bg-cyan-950 hover:border-cyan-500 flex items-center justify-center transition-colors">i</button>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <span class="text-[10px] text-slate-500 block mb-1">Max Width (px)</span>
                <input type="number" id="input-max-w" placeholder="Auto" title="Shrink images wider than this pixel width while keeping proportions" class="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 outline-none" />
              </div>
              <div>
                <span class="text-[10px] text-slate-500 block mb-1">Max Height (px)</span>
                <input type="number" id="input-max-h" placeholder="Auto" title="Shrink images taller than this pixel height while keeping proportions" class="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 outline-none" />
              </div>
            </div>
          </div>
        </div>

        <div class="mt-auto pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-2">
          <svg class="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
          100% In-Memory Sandbox. Images are processed locally and never transmitted.
        </div>
      </aside>

      <!-- Main Stage: Drag/Drop/Paste Target & Live Conversion Queue -->
      <main class="flex-1 p-6 overflow-y-auto flex flex-col items-center justify-start relative">
        <div id="drop-target" title="Drop image files here, click Choose Files, or press Ctrl+V anywhere on the page to paste a screenshot" class="w-full max-w-2xl border-2 border-dashed border-slate-800 hover:border-cyan-500/60 rounded-3xl p-8 text-center transition-all bg-slate-900/50 flex flex-col items-center justify-center cursor-pointer mb-6">
          <div class="w-14 h-14 rounded-2xl bg-cyan-600/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-3 pointer-events-none">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
          </div>
          <h3 class="text-base font-semibold text-white mb-1 pointer-events-none">Drag &amp; Drop or Paste (<kbd class="text-xs font-mono bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-cyan-300">Ctrl+V</kbd>)</h3>
          <p class="text-xs text-slate-400 max-w-sm mb-4 pointer-events-none">Drop or paste JPG, PNG, WebP, animated GIF, Apple HEIC, or TIFF files for immediate client-side conversion.</p>
          <label title="Browse your device for one or more images to convert" class="cursor-pointer bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs py-2 px-5 rounded-xl shadow-lg shadow-cyan-600/20 transition-all pointer-events-auto">
            Choose Files
            <input type="file" id="file-input" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/tiff,.heic,.heif,.gif,.tif,.tiff" class="hidden" />
          </label>
        </div>

        <!-- Conversion Queue Grid -->
        <div id="queue-grid" class="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4"></div>
      </main>
    </div>

    <!-- Interactive Multi-Point Eyedropper Modal with Live Tuning -->
    <div id="eyedropper-modal" class="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 hidden flex-col items-center justify-center p-4 sm:p-6">
      <div class="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full p-5 shadow-2xl flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-bold text-white flex items-center gap-2">
              <span class="text-cyan-400">💧</span> Multi-Point Eyedropper
              <span id="modal-points-count" class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/40 text-cyan-300">0 areas selected</span>
            </h3>
            <p class="text-xs text-slate-400">Click multiple background pockets and fine-tune tolerance or edge defringe live.</p>
          </div>
          <button id="btn-close-eyedropper" title="Close Eyedropper and re-process queue with selected points" class="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <!-- Live Checkerboard Preview Stage -->
        <div class="relative transparency-check border border-slate-700 rounded-xl overflow-hidden flex items-center justify-center max-h-[55vh] p-3">
          <canvas id="eyedropper-canvas" title="Click any background color or enclosed loop (like inside letters) to make it transparent" class="max-w-full max-h-[50vh] object-contain cursor-crosshair shadow-xl"></canvas>
        </div>

        <!-- Live Modal Tuning Bar -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs">
          <div class="space-y-1">
            <div class="flex justify-between">
              <span class="text-slate-400 font-medium">Live Tolerance</span>
              <span id="modal-tolerance-val" class="font-mono text-cyan-400">15%</span>
            </div>
            <input type="range" id="modal-tolerance-slider" min="1" max="60" value="15" step="1" title="Drag to expand or tighten how many similar background shades are removed" class="w-full accent-cyan-500 bg-slate-800 cursor-pointer h-1.5 rounded-lg" />
          </div>

          <div class="space-y-1">
            <div class="flex justify-between">
              <span class="text-slate-400 font-medium">Edge Defringe (Remove Halo)</span>
              <span id="modal-defringe-val" class="font-mono text-cyan-400">0 px</span>
            </div>
            <input type="range" id="modal-defringe-slider" min="0" max="3" value="0" step="1" title="Trim 1–3 pixels from cut-out edges to remove white or dark anti-aliasing outlines" class="w-full accent-cyan-500 bg-slate-800 cursor-pointer h-1.5 rounded-lg" />
          </div>
        </div>

        <!-- Bottom Modal Action Bar -->
        <div class="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div class="flex items-center gap-3 text-slate-400">
            <div class="flex items-center gap-1.5" title="Live color readout directly under your cursor">
              <span>Cursor:</span>
              <span id="hover-swatch" class="w-4 h-4 rounded border border-slate-600 inline-block bg-transparent"></span>
              <span id="hover-hex" class="font-mono text-slate-200">—</span>
            </div>
            <button type="button" id="btn-undo-point" title="Remove the most recently clicked Eyedropper point" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors">
              Undo Last
            </button>
            <button type="button" id="btn-clear-points" title="Clear all clicked Eyedropper points on this image" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 transition-colors">
              Clear All
            </button>
          </div>

          <button type="button" id="btn-apply-eyedropper" title="Save these transparency points and re-encode every image in the queue" class="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2 px-5 rounded-xl shadow-lg shadow-cyan-600/30 transition-all">
            Apply &amp; Replicate
          </button>
        </div>
      </div>
    </div>

    <!-- Developer Support Badge -->
    <div class="fixed bottom-4 right-4 z-40">
      <a
        href="https://buymeacoffee.com/curiouslyso"
        target="_blank"
        rel="noopener noreferrer"
        title="Support independent privacy-first browser tools on Buy Me a Coffee"
        class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 hover:bg-slate-800 text-amber-300 font-medium text-xs border border-amber-500/30 hover:border-amber-400/60 shadow-lg shadow-black/50 backdrop-blur transition-all duration-200 hover:scale-105"
      >
        <span class="text-sm select-none">☕</span>
        <span class="text-[11px] tracking-wide text-slate-200 hover:text-amber-200">Support the dev</span>
      </a>
    </div>

    <!-- Global Viewport-Clamped Popover Container -->
    <div id="global-info-popover"></div>
  </div>
`;

// Plain-English Help Copy Registry for Every Info Popover Trigger
const infoCopy: Record<string, string> = {
  format: `<strong class="text-white block mb-1">Export Format Guide</strong>
           <b class="text-cyan-400">WebP:</b> Modern web compression with smooth transparency.<br/>
           <b class="text-amber-400">JPEG:</b> Universal photo format (no transparent background).<br/>
           <b class="text-emerald-400">PNG:</b> Lossless crisp graphics with full transparency.<br/>
           <b class="text-purple-400">GIF:</b> Static or animated 256-colour graphic with transparent cutout support.`,
  quality: `<strong class="text-white block mb-1">Compression Quality</strong>
            Controls file size vs. visual sharpness for WebP and JPEG. Disabled for lossless PNG and palette-quantised GIF.`,
  knockout: `<strong class="text-white block mb-1">Multi-Point Eyedropper &amp; Defringe</strong>
             Click <b>Eyedropper</b> to pick multiple background areas (including inside letters like O or A). Use <b>Edge Defringe</b> to shave off lingering white/black outline halos.`,
  fallback: `<strong class="text-white block mb-1">Fallback Background Mode</strong>
             Used automatically before you pick custom Eyedropper points. <b>Auto (Top-Left)</b> samples the top-left corner pixel of each image.`,
  contiguous: `<strong class="text-white block mb-1">Contiguous (Magic Wand)</strong>
               <b>Checked:</b> Only erases connected outer background pixels so matching colours inside your subject stay safe.<br/>
               <b>Unchecked:</b> Erases that colour everywhere across the entire image.`,
  tolerance: `<strong class="text-white block mb-1">Colour Tolerance</strong>
              How close a pixel's shade must be to be erased. Increase this (15%–35%) to clean up JPEG compression noise or soft shadows.`,
  defringe: `<strong class="text-white block mb-1">Edge Defringe (Halo Removal)</strong>
             Trims 1–3 pixels around cut-out edges to eliminate leftover white or black anti-aliasing outlines.`,
  alpha: `<strong class="text-white block mb-1">Preserve Native Alpha</strong>
          Keeps pre-existing transparent areas from input PNG, WebP, or GIF files intact.`,
  matte: `<strong class="text-white block mb-1">Fallback Matte Colour</strong>
          Fills transparent regions with solid white or black when exporting to JPEG (which does not support transparency).`,
  limits: `<strong class="text-white block mb-1">Optional Size Limits</strong>
           Automatically scales down oversized images to fit within a maximum pixel width or height while preserving aspect ratio.`,
};

// Viewport-Clamped Popover Positioning Controller
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

// Bind hover, keyboard focus, and tap listeners to every info badge
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

// Cached DOM Element References
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
const defringeSlider = document.getElementById('defringe-slider') as HTMLInputElement;
const defringeVal = document.getElementById('defringe-val') as HTMLSpanElement;
const checkContiguous = document.getElementById('check-contiguous') as HTMLInputElement;
const btnOpenEyedropper = document.getElementById('btn-open-eyedropper') as HTMLButtonElement;
const sampleCountBadge = document.getElementById('sample-count-badge') as HTMLSpanElement;
const btnResetSamples = document.getElementById('btn-reset-samples') as HTMLButtonElement;

// Eyedropper Modal DOM Element References
const eyedropperModal = document.getElementById('eyedropper-modal') as HTMLDivElement;
const eyedropperCanvas = document.getElementById('eyedropper-canvas') as HTMLCanvasElement;
const btnCloseEyedropper = document.getElementById('btn-close-eyedropper') as HTMLButtonElement;
const btnUndoPoint = document.getElementById('btn-undo-point') as HTMLButtonElement;
const btnClearPoints = document.getElementById('btn-clear-points') as HTMLButtonElement;
const btnApplyEyedropper = document.getElementById('btn-apply-eyedropper') as HTMLButtonElement;
const modalPointsCount = document.getElementById('modal-points-count') as HTMLSpanElement;
const modalToleranceSlider = document.getElementById('modal-tolerance-slider') as HTMLInputElement;
const modalToleranceVal = document.getElementById('modal-tolerance-val') as HTMLSpanElement;
const modalDefringeSlider = document.getElementById('modal-defringe-slider') as HTMLInputElement;
const modalDefringeVal = document.getElementById('modal-defringe-val') as HTMLSpanElement;
const hoverSwatch = document.getElementById('hover-swatch') as HTMLSpanElement;
const hoverHex = document.getElementById('hover-hex') as HTMLSpanElement;

// Keep sidebar and modal tolerance sliders synchronized
const syncToleranceUI = (val: number) => {
  currentSettings.bgTolerance = val;
  toleranceSlider.value = String(val);
  toleranceVal.textContent = `${val}%`;
  modalToleranceSlider.value = String(val);
  modalToleranceVal.textContent = `${val}%`;
};

// Keep sidebar and modal edge-defringe sliders synchronized
const syncDefringeUI = (val: number) => {
  currentSettings.bgDefringe = val;
  defringeSlider.value = String(val);
  defringeVal.textContent = `${val} px`;
  modalDefringeSlider.value = String(val);
  modalDefringeVal.textContent = `${val} px`;
};

// Update sample point counter badges across sidebar and Eyedropper modal
const updateSampleCounters = () => {
  const count = currentSettings.samplePoints.length;
  sampleCountBadge.textContent = String(count);
  modalPointsCount.textContent = `${count} ${count === 1 ? 'area' : 'areas'} selected`;
  if (count > 0) {
    btnResetSamples.classList.remove('hidden');
  } else {
    btnResetSamples.classList.add('hidden');
  }
};

// Redraw the interactive Eyedropper canvas with live knockout preview and numbered pin markers
const renderEyedropperPreview = () => {
  if (!sourceCanvasForEyedropper) return;
  const ctx = eyedropperCanvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  const w = sourceCanvasForEyedropper.width;
  const h = sourceCanvasForEyedropper.height;
  eyedropperCanvas.width = w;
  eyedropperCanvas.height = h;

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(sourceCanvasForEyedropper, 0, 0);

  if (currentSettings.samplePoints.length > 0) {
    applyBackgroundKnockout(ctx, w, h, currentSettings);
  }

  // Draw numbered cyan target reticles on each clicked sample coordinate
  currentSettings.samplePoints.forEach((pt, idx) => {
    const px = pt.x * w;
    const py = pt.y * h;
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, Math.max(5, w * 0.008), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6, 182, 212, 0.85)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(10, Math.round(w * 0.015))}px monospace`;
    ctx.fillText(String(idx + 1), px + 8, py + 4);
    ctx.restore();
  });

  updateSampleCounters();
};

// Open the Multi-Point Eyedropper modal for a specific queue item
const openEyedropperFor = async (item: ImageQueueItem) => {
  const prepared = await prepareImageSource(item.file);
  sourceCanvasForEyedropper = prepared.frames[0].canvas;

  syncToleranceUI(currentSettings.bgTolerance);
  syncDefringeUI(currentSettings.bgDefringe);
  renderEyedropperPreview();

  eyedropperModal.classList.remove('hidden');
  eyedropperModal.classList.add('flex');
};

const closeEyedropper = () => {
  eyedropperModal.classList.add('hidden');
  eyedropperModal.classList.remove('flex');
  sourceCanvasForEyedropper = null;
};

const rgbToHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');

// Live cursor RGB color inspection inside the Eyedropper modal
eyedropperCanvas.addEventListener('mousemove', (e) => {
  if (!sourceCanvasForEyedropper) return;
  const rect = eyedropperCanvas.getBoundingClientRect();
  const scaleX = eyedropperCanvas.width / rect.width;
  const scaleY = eyedropperCanvas.height / rect.height;
  const x = Math.min(eyedropperCanvas.width - 1, Math.max(0, Math.floor((e.clientX - rect.left) * scaleX)));
  const y = Math.min(eyedropperCanvas.height - 1, Math.max(0, Math.floor((e.clientY - rect.top) * scaleY)));

  const srcCtx = sourceCanvasForEyedropper.getContext('2d');
  if (!srcCtx) return;
  const pixel = srcCtx.getImageData(x, y, 1, 1).data;

  const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
  hoverSwatch.style.backgroundColor = hex;
  hoverHex.textContent = hex.toUpperCase();
});

// Record clicked sample point and update live transparency preview
eyedropperCanvas.addEventListener('click', (e) => {
  if (!sourceCanvasForEyedropper) return;
  const rect = eyedropperCanvas.getBoundingClientRect();
  const normX = (e.clientX - rect.left) / rect.width;
  const normY = (e.clientY - rect.top) / rect.height;

  const scaleX = eyedropperCanvas.width / rect.width;
  const scaleY = eyedropperCanvas.height / rect.height;
  const x = Math.min(eyedropperCanvas.width - 1, Math.max(0, Math.floor((e.clientX - rect.left) * scaleX)));
  const y = Math.min(eyedropperCanvas.height - 1, Math.max(0, Math.floor((e.clientY - rect.top) * scaleY)));

  const srcCtx = sourceCanvasForEyedropper.getContext('2d');
  if (!srcCtx) return;
  const pixel = srcCtx.getImageData(x, y, 1, 1).data;
  const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);

  currentSettings.removeBackground = true;
  checkKnockout.checked = true;
  currentSettings.samplePoints.push({ x: normX, y: normY, color: hex });

  renderEyedropperPreview();
});

modalToleranceSlider.addEventListener('input', (e) => {
  const val = parseInt((e.target as HTMLInputElement).value, 10);
  syncToleranceUI(val);
  renderEyedropperPreview();
});

modalDefringeSlider.addEventListener('input', (e) => {
  const val = parseInt((e.target as HTMLInputElement).value, 10);
  syncDefringeUI(val);
  renderEyedropperPreview();
});

btnUndoPoint.addEventListener('click', () => {
  currentSettings.samplePoints.pop();
  renderEyedropperPreview();
});

btnClearPoints.addEventListener('click', () => {
  currentSettings.samplePoints = [];
  renderEyedropperPreview();
});

const applyModalAndReprocess = () => {
  closeEyedropper();
  updateSettingsUI();
  queue.forEach((q) => (q.status = 'idle'));
  renderQueue();
  processQueue();
};

btnApplyEyedropper.addEventListener('click', applyModalAndReprocess);
btnCloseEyedropper.addEventListener('click', applyModalAndReprocess);
eyedropperModal.addEventListener('click', (e) => {
  if (e.target === eyedropperModal) applyModalAndReprocess();
});

btnOpenEyedropper.addEventListener('click', () => {
  if (queue.length === 0) {
    fileInput.click();
    return;
  }
  openEyedropperFor(queue[0]);
});

btnResetSamples.addEventListener('click', () => {
  currentSettings.samplePoints = [];
  updateSampleCounters();
  queue.forEach((q) => (q.status = 'idle'));
  renderQueue();
  processQueue();
});

// Enable/disable conditional sidebar controls based on active format and alpha flags
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

  updateSampleCounters();
};

// Render cards for every queued file along with size savings, download buttons, and tooltips
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
      <!-- Checkerboard Transparency Preview Box -->
      <div class="w-20 h-20 rounded-xl overflow-hidden shrink-0 transparency-check border border-slate-700/60 flex items-center justify-center relative group/thumb">
        <img src="${item.previewUrl}" alt="Preview" class="w-full h-full object-contain select-none" />
        <button data-sample="${item.id}" title="Open Eyedropper on this image to click specific background colors to make transparent" class="btn-sample-item absolute bottom-1 right-1 bg-slate-900/90 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-slate-700 rounded-md p-1 opacity-0 group-hover/thumb:opacity-100 transition-opacity shadow-md">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
        </button>
      </div>

      <!-- File Metadata & Conversion Status -->
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

        ${item.status === 'converting' ? `
          <div class="text-[11px] font-mono text-cyan-400 animate-pulse flex items-center gap-1.5">
            <svg class="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
            Replicating...
          </div>
        ` : ''}

        ${item.status === 'completed' ? `
          <div class="flex items-center gap-2">
            <button data-download="${item.id}" title="Download this converted file directly to your device" class="btn-single-download text-[11px] bg-slate-800 hover:bg-slate-700 text-cyan-300 font-medium py-1 px-3 rounded-lg border border-slate-700 hover:border-cyan-500/40 transition-all inline-flex items-center gap-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              Save ${getExtensionForFormat(currentSettings.targetFormat).toUpperCase()}
            </button>
            <button data-sample="${item.id}" title="Open Multi-Point Eyedropper to pick background areas to erase" class="btn-sample-item text-[11px] bg-slate-800/70 hover:bg-slate-700 text-slate-300 py-1 px-2 rounded-lg border border-slate-700 transition-colors">
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

      <!-- Remove Item from Queue -->
      <button data-remove="${item.id}" title="Remove this file from the conversion queue" class="text-slate-500 hover:text-slate-300 p-1 rounded-lg transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
      </button>
    </div>
  `).join('');
};

// Sequentially process all 'idle' items in the queue without blocking UI responsiveness
const processQueue = async () => {
  if (isProcessing) return;
  isProcessing = true;

  for (const item of queue) {
    if (item.status === 'idle') {
      item.status = 'converting';
      renderQueue();

      try {
        const prepared = await prepareImageSource(item.file);
        const { blob: convertedBlob, dimensions } = await convertImageBlob(prepared, currentSettings);

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

// Enqueue dropped, selected, or pasted image files and kick off processing
const addFilesToQueue = (files: FileList | File[]) => {
  Array.from(files).forEach((file, idx) => {
    const url = URL.createObjectURL(file);
    const fallbackName = file.name && file.name !== 'image.png'
      ? file.name
      : `pasted_capture_${Date.now()}_${idx + 1}.png`;

    const item: ImageQueueItem = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      file,
      originalName: fallbackName,
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

// Global Clipboard Paste Listener (Ctrl+V / Cmd+V screenshot ingestion)
window.addEventListener('paste', (e: ClipboardEvent) => {
  const items = e.clipboardData?.items;
  if (!items) return;

  const pastedFiles: File[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.startsWith('image/')) {
      const file = items[i].getAsFile();
      if (file) pastedFiles.push(file);
    }
  }

  if (pastedFiles.length > 0) {
    addFilesToQueue(pastedFiles);
  }
});

// Control Panel Event Listeners
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
  currentSettings.samplePoints = [];
  updateSampleCounters();
  if (val === 'custom') {
    pickerBgColor.classList.remove('hidden');
    currentSettings.bgTargetColor = pickerBgColor.value;
  } else {
    pickerBgColor.classList.add('hidden');
    currentSettings.bgTargetColor = val;
  }
  queue.forEach(q => q.status = 'idle');
  renderQueue();
  processQueue();
});

pickerBgColor.addEventListener('input', () => {
  currentSettings.samplePoints = [];
  updateSampleCounters();
  currentSettings.bgTargetColor = pickerBgColor.value;
  queue.forEach(q => q.status = 'idle');
  renderQueue();
  processQueue();
});

toleranceSlider.addEventListener('input', (e) => {
  const val = parseInt((e.target as HTMLInputElement).value, 10);
  syncToleranceUI(val);
});

toleranceSlider.addEventListener('change', () => {
  queue.forEach(q => q.status = 'idle');
  renderQueue();
  processQueue();
});

defringeSlider.addEventListener('input', (e) => {
  const val = parseInt((e.target as HTMLInputElement).value, 10);
  syncDefringeUI(val);
});

defringeSlider.addEventListener('change', () => {
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

// Initialize sidebar state on initial load
updateSettingsUI();
