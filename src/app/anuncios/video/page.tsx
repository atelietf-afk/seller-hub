import Link from "next/link";
import { VideoEditor } from "./VideoEditor";

// Editor de vídeo para os anúncios: ajusta proporção e duração de cada loja, no navegador.
export default function VideoPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link href="/anuncios" className="text-sm text-ink-2 hover:underline">
          ← Anúncios
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Editor de vídeo</h1>
        <p className="text-sm text-ink-2">Ajusta o vídeo para a proporção e a duração de cada loja. A edição acontece no seu navegador.</p>
      </div>
      <VideoEditor />
    </div>
  );
}
