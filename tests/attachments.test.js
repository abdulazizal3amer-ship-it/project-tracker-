import { describe, expect, it } from 'vitest';
import { attachmentPath, formatBytes, MAX_ATTACHMENT_BYTES } from '../src/lib/logic.js';

const P = '10000000-0000-0000-0000-000000000001';

describe('attachments', () => {
  it('builds ASCII storage paths inside the project folder', () => {
    expect(attachmentPath(P, null, 'خطة المشروع.PDF', 'abc')).toBe(`${P}/project/abc.pdf`);
    expect(attachmentPath(P, 't1', 'spec.docx', 'r')).toBe(`${P}/t1/r.docx`);
    expect(attachmentPath(P, 't1', 'no-extension', 'r')).toBe(`${P}/t1/r`);
    expect(attachmentPath(P, 't1', 'weird.ext!', 'r')).toBe(`${P}/t1/r`);
    expect(attachmentPath(P, undefined, '../../etc/passwd', 'r')).toBe(`${P}/project/r`);
  });
  it('formats sizes', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(200 * 1024)).toBe('200 KB');
    expect(formatBytes(MAX_ATTACHMENT_BYTES)).toBe('5.0 MB');
  });
});
