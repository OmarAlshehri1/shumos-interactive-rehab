import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("ships a complete binary spacecraft with indexed geometry and an embedded PNG, without external fetch dependencies", () => {
  const bytes = readFileSync(resolve('public/spacepilot3d/models/bob.glb'));
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
  expect(bytes.readUInt32LE(4)).toBe(2);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);
  const model = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binaryOffset = 20 + jsonLength;
  expect(bytes.readUInt32LE(binaryOffset + 4)).toBe(0x004e4942);
  const binary = bytes.subarray(binaryOffset + 8);
  expect(model.buffers).toHaveLength(1);
  expect(model.buffers[0].uri).toBeUndefined();
  expect(model.buffers[0].byteLength).toBeLessThanOrEqual(binary.length);
  expect(model.meshes.length).toBeGreaterThan(0);
  for (const mesh of model.meshes) for (const primitive of mesh.primitives) {
    expect(model.accessors[primitive.attributes.POSITION].count).toBeGreaterThan(100);
    expect(model.accessors[primitive.indices].count % 3).toBe(0);
  }
  for (const view of model.bufferViews) expect((view.byteOffset ?? 0) + view.byteLength).toBeLessThanOrEqual(binary.length);
  for (const image of model.images) {
    expect(image.uri).toBeUndefined();
    expect(image.mimeType).toBe('image/png');
    const view = model.bufferViews[image.bufferView];
    expect(binary.subarray(view.byteOffset, view.byteOffset + 8).toString('hex')).toBe('89504e470d0a1a0a');
  }
  expect(bytes.length).toBeLessThan(4 * 1024 * 1024);
});
