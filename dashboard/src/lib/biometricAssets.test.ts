import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('biometric asset delivery', () => {
  it('removes the unused OpenCV bootstrap and pins compatible runtimes', () => {
    const index = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const faceAi = readFileSync(resolve(process.cwd(), 'src/lib/faceAi.ts'), 'utf8');
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };

    expect(index).not.toContain('opencv');
    expect(faceAi).not.toContain('@master');
    expect(faceAi).not.toContain('@mediapipe/tasks-vision@0.10.8');
    expect(faceAi).toContain('@mediapipe/tasks-vision@0.10.35/wasm');
    expect(packageJson.dependencies['@mediapipe/tasks-vision']).toBe('0.10.35');
  });

  it('uses a versioned immutable model path without introducing Tiny Face Detector', () => {
    const faceAi = readFileSync(resolve(process.cwd(), 'src/lib/faceAi.ts'), 'utf8');
    const vercelPath = resolve(process.cwd(), 'vercel.json');

    expect(faceAi).toContain('/models/face-api-0.22.2/');
    expect(existsSync(resolve(process.cwd(), 'public/models/face-api-0.22.2/ssd_mobilenetv1_model-shard1'))).toBe(true);
    expect(existsSync(vercelPath)).toBe(true);
    expect(readFileSync(vercelPath, 'utf8')).toContain('max-age=31536000, immutable');
    expect(faceAi.toLowerCase()).not.toContain('tinyfacedetector');
  });
});
