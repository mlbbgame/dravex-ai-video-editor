import { expect, test } from "@playwright/test";
import { finalizeWebmDuration } from "../src/video/video-sequence-render";

test("WebM duration finalization leaves non-WebM blobs untouched", async () => {
  const blob = new Blob(["not a webm"], { type: "video/mp4" });
  await expect(finalizeWebmDuration(blob, 12)).resolves.toBe(blob);
});

test("WebM duration finalization leaves invalid requested durations untouched", async () => {
  const blob = new Blob(["not a webm"], { type: "video/webm" });

  for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    await expect(finalizeWebmDuration(blob, duration)).resolves.toBe(blob);
  }
});

test("WebM duration finalization safely preserves malformed WebM payloads", async () => {
  const blob = new Blob(["malformed webm payload"], { type: "video/webm" });
  const finalized = await finalizeWebmDuration(blob, 12);

  expect(finalized).toBe(blob);
  expect(finalized.size).toBe(blob.size);
  expect(finalized.type).toBe("video/webm");
});

test("WebM duration finalization does not change media bytes when the Segment metadata is absent", async () => {
  const payload = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x01, 0x02]);
  const blob = new Blob([payload], { type: "video/webm" });
  const finalized = await finalizeWebmDuration(blob, 12);

  expect(finalized).toBe(blob);
  expect(new Uint8Array(await finalized.arrayBuffer())).toEqual(payload);
});
