import { describe, expect, it } from "vitest";
import { normalizeSslMode } from "@/lib/db";

describe("normalizeSslMode", () => {
  it("troca require por verify-full e preserva o resto", () => {
    expect(normalizeSslMode("postgres://u:p@h/db?sslmode=require&channel_binding=require")).toBe(
      "postgres://u:p@h/db?sslmode=verify-full&channel_binding=require",
    );
    expect(normalizeSslMode("postgres://u:p@h/db?x=1&sslmode=prefer")).toBe("postgres://u:p@h/db?x=1&sslmode=verify-full");
  });

  it("não mexe quando não há sslmode ou ele já é verify-full", () => {
    expect(normalizeSslMode("postgres://u@localhost/db")).toBe("postgres://u@localhost/db");
    expect(normalizeSslMode("postgres://h/db?sslmode=verify-full")).toBe("postgres://h/db?sslmode=verify-full");
    expect(normalizeSslMode(undefined)).toBeUndefined();
  });
});
