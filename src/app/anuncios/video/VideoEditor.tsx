"use client";

import { useRef, useState } from "react";
import { centerCrop, clipWindow, outputSize, VIDEO_PLATFORMS, VIDEO_SPECS, videoProblem, type VideoPlatform } from "@/lib/analytics/video";

// Edição no navegador: o vídeo não sai do computador. O ffmpeg roda no próprio navegador.
// A biblioteca vem do CDN em versão fixa: empacotada pelo Next, o worker do ffmpeg não é encontrado.
const LIB = "https://unpkg.com/@ffmpeg";
const CORE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

interface FFmpegLike {
  loaded: boolean;
  load(opts: { classWorkerURL: string; coreURL: string; wasmURL: string }): Promise<void>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  exec(args: string[]): Promise<number>;
  readFile(path: string): Promise<Uint8Array>;
  deleteFile(path: string): Promise<void>;
}
type FFmpegModule = { FFmpeg: new () => FFmpegLike };
type UtilModule = { fetchFile(file: File): Promise<Uint8Array>; toBlobURL(url: string, type: string): Promise<string> };

interface Output {
  platform: VideoPlatform;
  url: string;
  name: string;
  sizeMB: number;
  tooBig: boolean;
}

export function VideoEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [start, setStart] = useState(0);
  const [selected, setSelected] = useState<VideoPlatform[]>([...VIDEO_PLATFORMS]);
  const [busy, setBusy] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [error, setError] = useState<string | null>(null);
  const ffmpegRef = useRef<FFmpegLike | null>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    const problem = videoProblem(f.type, f.size / 1024 / 1024);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setOutputs([]);
    if (src) URL.revokeObjectURL(src);
    const url = URL.createObjectURL(f);
    setFile(f);
    setSrc(url);
    setStart(0);
    setMeta(null);
  }

  async function engine() {
    if (ffmpegRef.current?.loaded) return ffmpegRef.current;
    const { FFmpeg } = (await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ `${LIB}/ffmpeg@0.12.15/dist/esm/index.js`
    )) as FFmpegModule;
    const { toBlobURL } = (await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ `${LIB}/util@0.12.2/dist/esm/index.js`
    )) as UtilModule;
    const ff = new FFmpeg();
    // O worker importa os próprios arquivos pelo CDN; o blob só faz a ponte, porque o navegador
    // não aceita um worker de outra origem diretamente.
    const bridge = `import "${LIB}/ffmpeg@0.12.15/dist/esm/worker.js";`;
    await ff.load({
      classWorkerURL: URL.createObjectURL(new Blob([bridge], { type: "text/javascript" })),
      coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegRef.current = ff;
    return ff;
  }

  async function generate(platform: VideoPlatform) {
    if (!file || !meta) return;
    const spec = VIDEO_SPECS[platform];
    const { fetchFile } = (await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ `${LIB}/util@0.12.2/dist/esm/index.js`
    )) as UtilModule;
    const ff = await engine();
    const clip = clipWindow(meta.duration, start, spec.maxSeconds);
    const crop = centerCrop(meta.width, meta.height, spec.aspect);
    const size = outputSize(spec.aspect);
    await ff.writeFile("entrada", await fetchFile(file));
    await ff.exec([
      "-ss",
      String(clip.from),
      "-i",
      "entrada",
      "-t",
      String(clip.length),
      "-vf",
      `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=${size.w}:${size.h}`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "28",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      "saida.mp4",
    ]);
    const data = await ff.readFile("saida.mp4");
    await ff.deleteFile("entrada");
    await ff.deleteFile("saida.mp4");
    const blob = new Blob([data as BlobPart], { type: "video/mp4" });
    const sizeMB = blob.size / 1024 / 1024;
    const base = file.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-");
    return {
      platform,
      url: URL.createObjectURL(blob),
      name: `${base}-${platform}.mp4`,
      sizeMB: Math.round(sizeMB * 10) / 10,
      tooBig: sizeMB > spec.maxMB,
    } satisfies Output;
  }

  async function generateSelected() {
    setError(null);
    setOutputs([]);
    const done: Output[] = [];
    for (const p of selected) {
      setBusy(VIDEO_SPECS[p].label);
      try {
        const out = await generate(p);
        if (out) done.push(out);
      } catch (err) {
        console.error("Edição de vídeo falhou", err);
        setError(`Não conseguimos gerar o vídeo para ${VIDEO_SPECS[p].label}. Tente um vídeo menor.`);
        break;
      }
    }
    setBusy(null);
    setOutputs(done);
  }

  const toggle = (p: VideoPlatform) => setSelected((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const clip = meta ? clipWindow(meta.duration, start, 60) : null;

  return (
    <div className="space-y-5">
      <div className="space-y-2 rounded-xl border border-line bg-surface p-5">
        <label className="block text-sm font-medium">
          Vídeo original (MP4, MOV ou WEBM, até 500 MB)
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            onChange={(e) => pick(e.target.files?.[0])}
            disabled={!!busy}
            className="mt-2 block text-sm"
          />
        </label>
        {error && <p className="text-sm text-critical">{error}</p>}
        <p className="text-xs text-muted">O vídeo fica no seu computador. Nada é enviado ao servidor.</p>
      </div>

      {src && (
        <div className="space-y-4 rounded-xl border border-line bg-surface p-5">
          <video
            src={src}
            controls
            className="max-h-72 w-full rounded-md bg-black"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              setMeta({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
            }}
          />
          {meta && clip && (
            <>
              <p className="text-sm text-ink-2">
                Duração: {Math.round(meta.duration)} s · {meta.width}×{meta.height}
              </p>
              <label className="block text-sm">
                Começar em {Math.round(start)} s
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, Math.floor(meta.duration) - 1)}
                  value={Math.min(start, Math.max(0, Math.floor(meta.duration) - 1))}
                  onChange={(e) => setStart(Number(e.target.value))}
                  disabled={!!busy}
                  className="mt-1 w-full"
                />
              </label>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Lojas</legend>
                {VIDEO_PLATFORMS.map((p) => (
                  <label key={p} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={selected.includes(p)} onChange={() => toggle(p)} disabled={!!busy} className="mt-1" />
                    <span>
                      {VIDEO_SPECS[p].label}: {VIDEO_SPECS[p].aspect.join(":")}, até {VIDEO_SPECS[p].maxSeconds} s e {VIDEO_SPECS[p].maxMB}{" "}
                      MB
                      <span className="block text-xs text-muted">Confirme: {VIDEO_SPECS[p].toConfirm}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <button
                onClick={generateSelected}
                disabled={!!busy || !selected.length}
                className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy ? `Editando para ${busy}… pode levar alguns minutos` : "Gerar vídeos"}
              </button>
            </>
          )}
        </div>
      )}

      {outputs.length > 0 && (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-5">
          <h2 className="font-semibold">Prontos para baixar</h2>
          <ul className="space-y-2 text-sm">
            {outputs.map((o) => (
              <li key={o.platform} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {VIDEO_SPECS[o.platform].label} · {o.sizeMB} MB
                  {o.tooBig && <span className="ml-2 text-critical">passa do limite da loja</span>}
                </span>
                <a href={o.url} download={o.name} className="rounded-md border border-line px-3 py-1 text-sm font-medium">
                  Baixar
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
