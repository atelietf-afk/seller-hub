import { describe, expect, it } from "vitest";
import { centerCrop, clipWindow, outputSize, videoProblem } from "@/lib/analytics/video";

describe("regras de vídeo", () => {
  it("aceita MP4, MOV e WEBM até 500 MB", () => {
    expect(videoProblem("video/mp4", 40)).toBeNull();
    expect(videoProblem("video/avi", 40)).toMatch(/MP4, MOV ou WEBM/);
    expect(videoProblem("video/mp4", 600)).toMatch(/500 MB/);
  });

  it("corta no máximo da loja e não passa do fim do vídeo", () => {
    expect(clipWindow(90, 0, 60)).toEqual({ from: 0, length: 60 });
    expect(clipWindow(30, 0, 60)).toEqual({ from: 0, length: 30 });
    expect(clipWindow(90, 80, 60)).toEqual({ from: 80, length: 10 }); // sobram 10 s
  });

  it("recorta no centro, sem esticar, para 1:1 e 4:5", () => {
    expect(centerCrop(1920, 1080, [1, 1])).toEqual({ x: 420, y: 0, w: 1080, h: 1080 });
    expect(centerCrop(1080, 1920, [1, 1])).toEqual({ x: 0, y: 420, w: 1080, h: 1080 });
    expect(centerCrop(1080, 1080, [4, 5])).toEqual({ x: 108, y: 0, w: 864, h: 1080 });
  });

  it("saída com lado menor de até 1080 e medidas pares", () => {
    expect(outputSize([1, 1])).toEqual({ w: 1080, h: 1080 });
    expect(outputSize([4, 5])).toEqual({ w: 1080, h: 1350 }); // o lado menor (largura) fica em 1080
  });
});
