import { describe, expect, it } from "vitest";
import { captionProblem, imageProblem, IMAGE_MAX_BYTES } from "@/lib/analytics/images";

describe("fotos e legendas", () => {
  it("aceita só JPG, PNG e WEBP até 8 MB", () => {
    expect(imageProblem("image/jpeg", 1000)).toBeNull();
    expect(imageProblem("image/gif", 1000)).toMatch(/JPG, PNG ou WEBP/);
    expect(imageProblem("image/png", 0)).toMatch(/vazio/);
    expect(imageProblem("image/png", IMAGE_MAX_BYTES + 1)).toMatch(/8 MB/);
  });

  it("legenda: até 2.200 caracteres e 30 hashtags", () => {
    expect(captionProblem("   ")).toMatch(/vazia/);
    expect(captionProblem("a".repeat(2201))).toMatch(/2.200/);
    expect(captionProblem("Caneca #a #b")).toBeNull();
    const muitas = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    expect(captionProblem(muitas)).toMatch(/30 hashtags/);
  });
});
