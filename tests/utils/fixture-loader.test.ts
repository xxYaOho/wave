/**
 * 测试固件加载工具的自测
 */

import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs/promises';
import {
  loadTestTheme,
  createTempTheme,
  cleanupTempTheme,
  expectOutputToMatch,
  type TestTheme,
} from './fixture-loader.ts';

describe('Fixture Loader', () => {
  describe('loadTestTheme', () => {
    test('应加载标准主题', async () => {
      const theme = await loadTestTheme('standard');

      expect(theme.name).toBe('standard');
      expect(theme.themefile).toContain('themefile');
      expect(theme.mainYaml).toContain('main.yaml');
    });

    test('应在主题不存在时抛出错误', async () => {
      expect(loadTestTheme('nonexistent')).rejects.toThrow('Test theme not found');
    });
  });

  describe('createTempTheme', () => {
    let theme: TestTheme;

    afterAll(async () => {
      await cleanupTempTheme(theme);
    });

    test('应创建临时主题', async () => {
      theme = await createTempTheme({
        name: 'test-create',
        palette: 'tailwindcss4',
        dimension: 'wave',
        tokens: {
          color: {
            $type: 'color',
            primary: {
              $value: '#0066cc',
            },
          },
        },
      });

      // 验证文件已创建
      const themefileContent = await fs.readFile(theme.themefile, 'utf-8');
      expect(themefileContent).toContain('THEME test-create');
      expect(themefileContent).toContain('tailwindcss4');

      const mainYamlContent = await fs.readFile(theme.mainYaml, 'utf-8');
      expect(mainYamlContent).toContain('color:');
      expect(mainYamlContent).toContain('#0066cc');
    });

    test('应支持自定义 platform', async () => {
      theme = await createTempTheme({
        name: 'test-platform',
        platform: ['json', 'css'],
        tokens: {},
      });

      const themefileContent = await fs.readFile(theme.themefile, 'utf-8');
      expect(themefileContent).toContain('json,css');
    });

    test('应支持嵌套 tokens', async () => {
      theme = await createTempTheme({
        name: 'test-nested',
        tokens: {
          color: {
            $type: 'color',
            brand: {
              primary: {
                $value: '#0066cc',
              },
              secondary: {
                $value: '#0099ff',
              },
            },
          },
          dimension: {
            $type: 'dimension',
            spacing: {
              sm: {
                $value: 8,
              },
            },
          },
        },
      });

      const mainYamlContent = await fs.readFile(theme.mainYaml, 'utf-8');
      expect(mainYamlContent).toContain('brand:');
      expect(mainYamlContent).toContain('primary:');
      expect(mainYamlContent).toContain('secondary:');
    });
  });

  describe('cleanupTempTheme', () => {
    test('应删除临时目录', async () => {
      const theme = await createTempTheme({
        name: 'cleanup-test',
        tokens: {},
      });

      // 确认目录存在
      await fs.access(theme.dir);

      await cleanupTempTheme(theme);

      // 确认目录已删除
      expect(fs.access(theme.dir)).rejects.toThrow();
    });

    test('不应删除非临时目录', async () => {
      const theme = await loadTestTheme('standard');

      // 不应抛出错误也不应删除
      await cleanupTempTheme(theme);

      // 确认目录仍然存在
      await fs.access(theme.dir);
    });
  });

  describe('expectOutputToMatch', () => {
    test('应在内容匹配时通过', () => {
      expectOutputToMatch('hello\nworld', 'hello\nworld');
    });

    test('应在内容不匹配时抛出错误', () => {
      expect(() => {
        expectOutputToMatch('hello', 'world');
      }).toThrow('Output mismatch');
    });

    test('应支持自定义消息', () => {
      expect(() => {
        expectOutputToMatch('a', 'b', 'Custom error');
      }).toThrow('Custom error');
    });

    test('应忽略首尾空白', () => {
      expectOutputToMatch('  hello  ', 'hello');
    });
  });
});
